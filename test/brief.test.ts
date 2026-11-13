import { describe, expect, test } from "bun:test";

import {
  briefInput,
  type BriefInput,
  briefService,
  codeActions,
  digestOf,
  filterAnswer,
  parseAnswer,
  stdinFor,
  type InputThread,
  type Outcome,
} from "../src/server/brief.ts";
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

describe("briefInput", () => {
  test("drops working, starting, waiting and snoozed threads before the message query; keeps launched children", () => {
    const tree = [
      branch([
        node("A", { children: [node("L")] }),
        node("W", { status: "working" }),
        node("S", { status: "starting" }),
        node("T", { status: "waiting" }),
        node("Z", { status: "snoozed" }),
      ]),
    ];
    let asked: string[] = [];
    const { threads: input } = briefInput(tree, (ids) => ((asked = ids), new Map([["A", "done"]])), NOW);
    expect(asked.toSorted()).toEqual(["A", "L"]);
    expect(input.map((t) => [t.id, t.title])).toEqual([
      ["A", "Thread A"],
      ["L", "Thread L"],
    ]);
    expect(input.map((t) => t.ref)).toEqual(["t1", "t2"]);
    expect(input[1].digest).toBe("t2 · Your turn 3h · Thread L");
    expect(input[0].digest).toBe("t1 · Your turn 3h · Thread A\n  done");
  });
  test("covered threads leave the model input; refs restart over the rest; code titles are set", () => {
    const tree = [branch([node("Q", { status: "needs-input" }), node("A"), node("B")])];
    let asked: string[] = [];
    const { code, threads } = briefInput(tree, (ids) => ((asked = ids), new Map()), NOW);
    expect(asked).toEqual(["A", "B"]);
    expect(threads.map((t) => [t.id, t.ref])).toEqual([
      ["A", "t1"],
      ["B", "t2"],
    ]);
    expect(code.actions.map((a) => a.threadIds)).toEqual([["Q"]]);
    expect(code.titles).toEqual({ Q: "Thread Q" });
  });
});

const pr = (over: object) =>
  ({
    n: 12,
    url: "u",
    state: "open",
    draft: false,
    checks: null,
    review: null,
    conflicting: false,
    title: "t",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    ...over,
  }) as ThreadNode["prs"][number];

describe("codeActions", () => {
  const one = (over: Partial<ThreadNode>) => codeActions([node("A", over)]).actions;
  const ready = { review: "approved", checks: "passing" };

  test("needs-input and plan-ready give an answer with no prompt", () => {
    expect(one({ status: "needs-input" })).toEqual([
      {
        kind: "answer",
        title: "Answer the agent",
        reason: "The agent waits for your input.",
        threadIds: ["A"],
        prompt: null,
      },
    ]);
    expect(one({ status: "plan-ready" })[0]).toMatchObject({ kind: "answer", title: "Review the plan", prompt: null });
  });
  test("a fix names one fact, or three joined, with the steps in fixed order", () => {
    expect(one({ prs: [pr({ checks: "failing" })] })).toEqual([
      {
        kind: "fix",
        title: "Fix PR #12",
        reason: "PR #12 has failing checks.",
        threadIds: ["A"],
        prompt: "fix the failing checks, and push.",
      },
    ]);
    expect(
      one({ prs: [pr({ n: 7, checks: "failing", conflicting: true, review: "changes-requested" })] })[0],
    ).toMatchObject({
      title: "Fix PR #7",
      reason: "PR #7 has conflicts, failing checks and changes requested.",
      prompt:
        "Rebase on main and resolve the conflicts, fix the failing checks, address the review comments, and push.",
    });
  });
  test("a closed PR gives no fix", () => {
    expect(one({ prs: [pr({ state: "merged", checks: "failing" })] })).toEqual([]);
  });
  test("a merge needs an open, non-draft, approved, passing PR with no conflicts", () => {
    expect(one({ prs: [pr(ready)] })).toEqual([
      {
        kind: "merge",
        title: "Merge PR #12",
        reason: "PR #12 is approved, its checks pass, and it has no conflicts.",
        threadIds: ["A"],
        prompt: null,
      },
    ]);
    expect(one({ prs: [pr({ ...ready, draft: true })] })).toEqual([]);
    expect(one({ prs: [pr({ ...ready, state: "closed" })] })).toEqual([]);
    expect(one({ prs: [pr({ review: "review-required", checks: "passing" })] })).toEqual([]);
  });
  test("the first PR that matches names the action", () => {
    expect(
      one({ prs: [pr({ n: 1 }), pr({ n: 2, checks: "failing" }), pr({ n: 3, conflicting: true })] })[0],
    ).toMatchObject({
      title: "Fix PR #2",
    });
  });
  test("a thread that matches two rules gets the first", () => {
    const out = one({ status: "needs-input", prs: [pr({ checks: "failing" })] });
    expect(out.map((a) => a.kind)).toEqual(["answer"]);
  });
  test("groups by kind in rank order, tree order inside a kind, and reports the covered ids", () => {
    const { actions, covered } = codeActions([
      node("M", { prs: [pr(ready)] }),
      node("F1", { prs: [pr({ conflicting: true })] }),
      node("Q", { status: "needs-input" }),
      node("F2", { prs: [pr({ checks: "failing" })] }),
      node("P", { status: "plan-ready" }),
      node("X"),
    ]);
    expect(actions.map((a) => a.threadIds[0])).toEqual(["Q", "P", "F1", "F2", "M"]);
    expect([...covered].toSorted()).toEqual(["F1", "F2", "M", "P", "Q"]);
  });
});

describe("digestOf", () => {
  test("full line with key, PRs, stack, request and a cut message tail", () => {
    const n = node("A", {
      key: "ABC-1",
      title: "ABC-1 · Fix it",
      since: "2026-11-13T11:00:00.000Z",
      phrase: "Approval",
      status: "needs-input",
      prs: [
        pr({ review: "approved", checks: "passing" }),
        pr({ n: 13, draft: true, checks: "failing", conflicting: true }),
      ],
      stack: { pos: 2, total: 3 },
      detail: { request: "Approve rm" } as ThreadNode["detail"],
    });
    const msg = "x".repeat(300) + "\n" + "y".repeat(700);
    const [head, ...rest] = digestOf(n, "t1", msg, NOW).split("\n");
    expect(head).toBe(
      "t1 · Approval · 1h · ABC-1 Fix it · PRs (#12 approved passing, #13 draft failing conflicting) · stack 2/3 · request: Approve rm",
    );
    expect(rest).toEqual(["  …" + "y".repeat(600)]);
  });
  test("minimal line: no key, PRs, stack, request or message", () => {
    expect(digestOf(node("A"), "t1", null, NOW)).toBe("t1 · Your turn 3h · Thread A");
  });
  test("stack of N when pos is null; state shows when not open", () => {
    const n = node("A", { stack: { pos: null, total: 4 }, prs: [pr({ state: "merged" })] });
    expect(digestOf(n, "t1", null, NOW)).toBe("t1 · Your turn 3h · Thread A · PRs (#12 merged) · stack of 4");
  });
  test("a multi-line message tail is indented on every line", () => {
    expect(digestOf(node("A"), "t1", "a\nb", NOW)).toContain("\n  a\n  b");
  });
});

describe("stdinFor", () => {
  const threads = [
    { id: "A", ref: "t1", title: "a", digest: "t1 line" },
    { id: "B", ref: "t2", title: "b", digest: "t2 line" },
  ];
  test("claude gets the blocks only; an empty list gives No threads.", () => {
    expect(stdinFor("claude", "G", threads)).toBe("t1 line\n\nt2 line");
    expect(stdinFor("claude", "G", [])).toBe("No threads.");
  });
  test("codex gets the guide, a Threads heading and the blocks", () => {
    expect(stdinFor("codex", "G", threads)).toBe("G\n\n## Threads\n\nt1 line\n\nt2 line");
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
    ]
      .map((l) => JSON.stringify(l))
      .join("\n");
    expect(parseAnswer("codex", out)).toEqual({ answer: ok });
  });
  test("codex: turn.failed gives its message", () => {
    const out = [
      { type: "error", message: "e" },
      { type: "turn.failed", error: { message: "model not supported" } },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n");
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
  const threads = [
    { id: "A", ref: "t1", title: "Alpha" },
    { id: "B", ref: "t2", title: "Beta" },
  ];
  const action = (threadIds: string[], prompt: string | null = null, kind = "review") => ({
    kind,
    title: "t",
    reason: "r",
    threadIds,
    prompt,
  });

  test("drops unknown ids and actions with none left, keeps the order, saves titles", () => {
    const out = filterAnswer({ actions: [action(["t2", "X"], "go"), action(["X"]), action(["t1"])] }, threads);
    expect(out).toEqual({
      actions: [
        { kind: "review", title: "t", reason: "r", threadIds: ["B"], prompt: "go" },
        { kind: "review", title: "t", reason: "r", threadIds: ["A"], prompt: null },
      ],
      titles: { B: "Beta", A: "Alpha" },
    });
  });
  test("a real id in place of a ref is dropped", () => {
    expect(filterAnswer({ actions: [action(["A"])] }, threads)).toEqual({ actions: [], titles: {} });
  });
  test("a kind that code makes is dropped", () => {
    expect(filterAnswer({ actions: [action(["t1"], null, "merge")] }, threads)).toEqual({ actions: [], titles: {} });
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
  const done = (actions: BriefAction[] = [], titles: Record<string, string> = {}): Outcome => ({
    status: "done",
    cli: "claude",
    generatedAt: "t",
    actions,
    titles,
  });
  const act = (id: string, kind: BriefAction["kind"]): BriefAction => ({
    kind,
    title: id,
    reason: "r",
    threadIds: [id],
    prompt: null,
  });
  const CODE = { actions: [act("Q", "answer")], titles: { Q: "Thread Q" } };

  /** A run that ends when the test calls `finish`, or with `null` on cancel. */
  function setup(code = { actions: [], titles: {} } as BriefInput["code"]) {
    let finish!: (o: Outcome | null) => void;
    const changes: string[] = [];
    const svc = briefService({
      clis: CLIS,
      input: (settled) => ({ code, threads: [{ id: settled ? "s" : "o" } as InputThread] }),
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
      input: () => ({ code: CODE, threads: [{ id: "A" } as InputThread] }),
      onChange: () => {},
      run: () => ({ done: Promise.reject(new Error("boom")), cancel: () => {} }),
    });
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    await Bun.sleep(0);
    expect(svc.state()).toMatchObject({ status: "failed", error: "boom", ...CODE });
  });

  test("running carries the code actions; done lists code then model actions and merges titles", async () => {
    const { svc, finish, flush } = setup(CODE);
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    expect(svc.state()).toMatchObject({ status: "running", ...CODE });
    finish(done([act("A", "review")], { A: "Thread A" }));
    await flush();
    expect(svc.state()).toMatchObject({
      status: "done",
      actions: [act("Q", "answer"), act("A", "review")],
      titles: { Q: "Thread Q", A: "Thread A" },
    });
  });

  test("a model failure keeps the code actions", async () => {
    const { svc, finish, flush } = setup(CODE);
    await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }));
    finish({ status: "failed", cli: "claude", error: "e", stderrTail: "", actions: [], titles: {} });
    await flush();
    expect(svc.state()).toMatchObject({ status: "failed", error: "e", ...CODE });
  });

  test("with no model threads the run is skipped and the state is done with the code actions", async () => {
    let ran = false;
    const svc = briefService({
      clis: CLIS,
      input: () => ({ code: CODE, threads: [] }),
      onChange: () => {},
      run: () => ((ran = true), { done: new Promise(() => {}), cancel: () => {} }),
    });
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }))).status).toBe(202);
    expect(ran).toBe(false);
    expect(svc.state()).toMatchObject({ status: "done", cli: "claude", ...CODE });
  });
});
