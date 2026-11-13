import { describe, expect, test } from "bun:test";
import { briefInput, briefService, capMessage, filterAnswer, parseAnswer, type InputThread, type Outcome } from "../src/server/brief.ts";
import type { BriefAction } from "../src/shared/brief.ts";
import type { Branch, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");

function node(id: string, over: Partial<ThreadNode> = {}): ThreadNode {
  return {
    id,
    href: `t3://${id}`,
    title: `Thread ${id}`,
    key: null,
    status: "your-turn",
    phrase: "Your turn",
    since: null,
    raw: "completed",
    updatedAt: "2026-11-13T09:00:00.000Z",
    settled: false,
    input: false,
    snoozedUntil: null,
    stack: null,
    prs: [],
    detail: { request: null } as ThreadNode["detail"],
    children: [],
    ...over,
  };
}

const branch = (threads: ThreadNode[], branches: Branch[] = []): Branch => ({ id: "b", label: "b", branches, threads });

describe("capMessage", () => {
  test("keeps a short message whole", () => {
    expect(capMessage("x".repeat(1500))).toBe("x".repeat(1500));
    expect(capMessage(null)).toBeNull();
  });
  test("keeps the first 1000 and the last 500 characters of a long one", () => {
    const out = capMessage("a".repeat(1000) + "b".repeat(100) + "c".repeat(500))!;
    expect(out).toBe(`${"a".repeat(1000)}…${"c".repeat(500)}`);
  });
});

describe("briefInput", () => {
  test("takes every node of the tree, launched children included, with its last message", () => {
    const launched = node("L");
    const tree = [branch([node("A", { children: [launched] })], [branch([node("B", { key: "ABC-1", detail: { request: "Approve rm" } as ThreadNode["detail"] })])])];
    let asked: string[] = [];
    const input = briefInput(tree, (ids) => ((asked = ids), new Map([["A", "done"], ["L", null]])), NOW);
    expect(asked.sort()).toEqual(["A", "B", "L"]);
    const a = input.find((t) => t.id === "A")!;
    expect(a).toMatchObject({ title: "Thread A", status: "your-turn", age: "3h", subthreads: 1, lastMessage: "done" });
    expect(input.find((t) => t.id === "B")).toMatchObject({ key: "ABC-1", request: "Approve rm", lastMessage: null });
  });

  test("keeps only the PR fields the ranking needs", () => {
    const pr = { n: 7, url: "u", state: "open", draft: false, checks: "failing", review: null, conflicting: true, title: "t", additions: 1, deletions: 2, changedFiles: 3 } as const;
    const [t] = briefInput([branch([node("A", { prs: [pr] })])], () => new Map(), NOW);
    expect(t!.prs).toEqual([{ n: 7, state: "open", draft: false, checks: "failing", review: null, conflicting: true }]);
  });
});

describe("parseAnswer", () => {
  const ok = { actions: [] };
  test("claude: reads structured_output from the result line, after a tag line", () => {
    const out = `[claude-code:tag] {"x":1}\n${JSON.stringify({ type: "result", is_error: false, structured_output: ok })}\n`;
    expect(parseAnswer("claude", out)).toEqual({ answer: ok });
  });
  test("claude: is_error gives the result text", () => {
    const out = JSON.stringify({ type: "result", is_error: true, result: "There's an issue with the selected model" });
    expect(parseAnswer("claude", out)).toEqual({ error: "There's an issue with the selected model" });
  });
  test("codex: parses the last agent_message", () => {
    const out = [
      { type: "thread.started" },
      { type: "item.completed", item: { type: "agent_message", text: "{}" } },
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(ok) } },
      { type: "turn.completed" },
    ].map((l) => JSON.stringify(l)).join("\n");
    expect(parseAnswer("codex", out)).toEqual({ answer: ok });
  });
  test("codex: turn.failed gives its message", () => {
    const out = [{ type: "error", message: "e" }, { type: "turn.failed", error: { message: "model not supported" } }]
      .map((l) => JSON.stringify(l)).join("\n");
    expect(parseAnswer("codex", out)).toEqual({ error: "model not supported" });
  });
  test("codex: bad JSON is a parse error", () => {
    const out = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{nope" } });
    expect(parseAnswer("codex", out)).toMatchObject({ error: expect.stringContaining("Cannot parse the answer") });
  });
  test("no answer at all gives null", () => {
    expect(parseAnswer("claude", "")).toBeNull();
    expect(parseAnswer("codex", "")).toBeNull();
  });
});

describe("filterAnswer", () => {
  const threads = [{ id: "A", title: "Alpha" }, { id: "B", title: "Beta" }];
  const action = (threadIds: string[], prompt: string | null = null) => ({ kind: "fix", title: "t", reason: "r", threadIds, prompt });

  test("drops unknown ids and actions with none left, keeps the order, saves titles", () => {
    const out = filterAnswer({ actions: [action(["B", "X"], "go"), action(["X"]), action(["A"])] }, threads);
    expect(out).toEqual({
      actions: [
        { kind: "fix", title: "t", reason: "r", threadIds: ["B"], prompt: "go" },
        { kind: "fix", title: "t", reason: "r", threadIds: ["A"], prompt: null },
      ],
      titles: { B: "Beta", A: "Alpha" },
    });
  });
  test("0 actions is valid", () => {
    expect(filterAnswer({ actions: [] }, threads)).toEqual({ actions: [], titles: {} });
  });
  test("an answer with no actions list is an error", () => {
    expect(filterAnswer({}, threads)).toEqual({ error: "The answer has no actions list." });
    expect(filterAnswer(null, threads)).toEqual({ error: "The answer has no actions list." });
  });
});

describe("briefService", () => {
  const CLIS = Promise.resolve([{ id: "claude" as const, label: "Claude Haiku" }]);
  const post = (path: string, body?: unknown) =>
    new Request(`http://x${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  const done = (actions: BriefAction[] = []): Outcome => ({ status: "done", cli: "claude", generatedAt: "t", actions, titles: {} });

  /** A run that ends when the test calls `finish`, or with `null` on cancel. */
  function setup() {
    let finish!: (o: Outcome | null) => void;
    const changes: string[] = [];
    const svc = briefService({
      clis: CLIS,
      input: (settled) => [{ id: settled ? "s" : "o" } as InputThread],
      onChange: () => changes.push(svc.state().status),
      run: () => {
        const p = new Promise<Outcome | null>((r) => (finish = r));
        return { done: p, cancel: () => finish(null) };
      },
    });
    const flush = () => Bun.sleep(0);
    return { svc, changes, finish: (o: Outcome | null) => finish(o), flush };
  }

  test("runs, refuses a second run, then keeps the result", async () => {
    const { svc, changes, finish, flush } = setup();
    expect((await svc.routes["/brief/run"].POST(post("/brief/run?settled=1", { cli: "claude" }))).status).toBe(202);
    expect(svc.state()).toMatchObject({ status: "running", cli: "claude", threadCount: 1 });
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }))).status).toBe(409);
    finish(done());
    await flush();
    expect(svc.state().status).toBe("done");
    expect(changes).toEqual(["running", "done"]);
  });

  test("refuses a CLI that is not offered", async () => {
    const { svc } = setup();
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "codex" }))).status).toBe(400);
    expect((await svc.routes["/brief/run"].POST(post("/brief/run"))).status).toBe(400);
    expect(svc.state().status).toBe("idle");
  });

  test("a cancel returns to the state before the run", async () => {
    const { svc, finish, flush } = setup();
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    finish(done());
    await flush();
    const before = svc.state();
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    svc.routes["/brief/cancel"].POST();
    await flush();
    expect(svc.state()).toBe(before);
  });

  test("a thrown run becomes a failed state", async () => {
    const svc = briefService({
      clis: CLIS,
      input: () => [],
      onChange: () => {},
      run: () => ({ done: Promise.reject(new Error("boom")), cancel: () => {} }),
    });
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    await Bun.sleep(0);
    expect(svc.state()).toMatchObject({ status: "failed", error: "boom" });
  });
});
