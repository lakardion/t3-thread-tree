import { describe, expect, test } from "bun:test";

import {
  briefInput,
  type BriefInput,
  briefService,
  codeActions,
  digestOf,
  filterAnswer,
  lastMessageRoutes,
  runBrief,
  questionOf,
  tailOf,
  type InputThread,
  type Outcome,
} from "../src/server/brief.ts";
import type { ModelResult } from "../src/server/model.ts";
import type { BriefAction } from "../src/shared/brief.ts";
import type { Branch, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");

function node(id: string, over: Partial<ThreadNode> = {}): ThreadNode {
  return {
    id,
    href: `t3://${id}`,
    title: `Thread ${id}`,
    key: null,
    linear: null,
    status: "your-turn",
    phrase: "Your turn",
    since: null,
    raw: "completed",
    updatedAt: "2026-11-13T09:00:00.000Z",
    lastRun: null,
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
  test("an answer reason is the question of the last message; no message keeps the fixed reason", () => {
    const tree = [branch([node("Q", { status: "needs-input" }), node("R", { status: "needs-input" })])];
    let asked: string[] = [];
    const { code } = briefInput(tree, (ids) => ((asked = ids), new Map([["Q", "Done. Which one?"]])), NOW);
    expect(asked).toEqual(["Q", "R"]);
    expect(code.actions.map((a) => a.reason)).toEqual(["Which one?", "The agent waits for your input."]);
  });

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
  test("the snapshot holds the status of code and model threads, and the since of answer threads", () => {
    const since = "2026-11-13T10:00:00.000Z";
    const tree = [branch([node("Q", { status: "needs-input", since }), node("M"), node("W", { status: "working" })])];
    const { code } = briefInput(tree, () => new Map(), NOW);
    expect(code.statuses).toEqual({ Q: "needs-input", M: "your-turn" });
    expect(code.since).toEqual({ Q: since });
  });

  test("covered threads leave the model input; refs restart over the rest; code titles are set", () => {
    const tree = [branch([node("Q", { status: "needs-input" }), node("A"), node("B")])];
    let asked: string[] = [];
    const { code, threads } = briefInput(tree, (ids) => ((asked = ids), new Map()), NOW);
    expect(asked).toEqual(["A", "B", "Q"]);
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
    labels: [],
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
  test("an answer title is the verb of the request kind", () => {
    const req = (request: string | null, phrase = "Approval") =>
      one({ status: "needs-input", phrase, detail: { request } as ThreadNode["detail"] })[0].title;
    expect(req("command · 3m")).toBe("Approve the command");
    expect(req("user_input · 1m")).toBe("Answer the question");
    expect(req("mystery · 1m")).toBe("Answer the agent");
    expect(req(null)).toBe("Answer the agent");
    expect(req("command · 3m", "Guest message")).toBe("Reply to the guest");
  });
  test("answers go oldest Wait first, no Wait last, then fix and merge", () => {
    const { actions } = codeActions([
      node("F", { prs: [pr({ conflicting: true })] }),
      node("N", { status: "needs-input" }),
      node("B", { status: "plan-ready", since: "2026-11-13T11:00:00.000Z" }),
      node("A", { status: "needs-input", since: "2026-11-13T10:00:00.000Z" }),
    ]);
    expect(actions.map((a) => a.threadIds[0])).toEqual(["A", "B", "N", "F"]);
  });
  test("a fix names one fact, or three joined, with the steps in fixed order", () => {
    expect(one({ prs: [pr({ checks: "failing" })] })).toEqual([
      {
        kind: "fix",
        title: "Fix PR #12",
        reason: "PR #12 has failing checks.",
        threadIds: ["A"],
        prompt: "fix the failing checks, and push.",
        pr: 12,
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
        pr: 12,
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

describe("questionOf", () => {
  test("the last question wins", () => {
    expect(questionOf("Which one? Or this one? Fine.")).toBe("Or this one?");
  });
  test("a question may end in closing marks", () => {
    expect(questionOf("Done.\n**Ready to merge?**\nNotes follow.")).toBe("**Ready to merge?**");
  });
  test("with no question, the last sentence; a trailing bullet counts", () => {
    expect(questionOf("Done. All good.")).toBe("All good.");
    expect(questionOf("Pick:\n- option a\n- option b")).toBe("- option b");
  });
  test("drops a leading ellipsis and splits on newlines", () => {
    expect(questionOf("…tail of a sentence\nReady?")).toBe("Ready?");
    expect(questionOf("…only")).toBe("only");
  });
  test("cuts at 140 characters with an ellipsis", () => {
    const out = questionOf(`${"x".repeat(200)}?`)!;
    expect(out).toBe(`${"x".repeat(139)}…`);
    expect(out.length).toBe(140);
  });
  test("empty text gives null", () => {
    expect(questionOf("")).toBeNull();
    expect(questionOf(" \n ")).toBeNull();
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
  test("plan ready and your turn with a since show the Wait, not the update age", () => {
    const since = "2026-11-13T11:30:00.000Z";
    expect(digestOf(node("A", { since }), "t1", null, NOW)).toBe("t1 · Your turn 30m · Thread A");
    expect(digestOf(node("A", { since, status: "plan-ready", phrase: "Plan ready" }), "t1", null, NOW)).toBe(
      "t1 · Plan ready 30m · Thread A",
    );
  });
  test("stack of N when pos is null; state shows when not open", () => {
    const n = node("A", { stack: { pos: null, total: 4 }, prs: [pr({ state: "merged" })] });
    expect(digestOf(n, "t1", null, NOW)).toBe("t1 · Your turn 3h · Thread A · PRs (#12 merged) · stack of 4");
  });
  test("a multi-line message tail is indented on every line", () => {
    expect(digestOf(node("A"), "t1", "a\nb", NOW)).toContain("\n  a\n  b");
  });
});

describe("tailOf", () => {
  test("a short message stays; a long one keeps its last 600 characters after a …", () => {
    expect(tailOf("short")).toBe("short");
    expect(tailOf("x".repeat(300) + "y".repeat(700))).toBe("…" + "y".repeat(600));
  });
});

describe("lastMessageRoutes", () => {
  const messages: Record<string, string | null> = { "env:thread%3A1": "z".repeat(700), quiet: null };
  const get = lastMessageRoutes({ read: (id) => messages[id] ?? null, has: (id) => id in messages })["/t3/last-message"]
    .GET;
  const call = (query: string) => get(new Request(`http://x/t3/last-message${query}`));
  test("400 without an id; 404 for an unknown thread", async () => {
    expect(call("").status).toBe(400);
    expect(call("?id=nope").status).toBe(404);
  });
  test("null text when the thread has no message", async () => {
    expect(await call("?id=quiet").json()).toEqual({ text: null });
  });
  test("a long message comes back as its tail, for an id with : and %3A", async () => {
    const res = call(`?id=${encodeURIComponent("env:thread%3A1")}`);
    expect(await res.json()).toEqual({ text: "…" + "z".repeat(600) });
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
  const CLIS = () => Promise.resolve([{ id: "claude" as const, label: "Claude Haiku" }]);
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
  const SNAP = { statuses: { Q: "needs-input" as const }, since: { Q: null } };
  const CODE = { actions: [act("Q", "answer")], titles: { Q: "Thread Q" }, ...SNAP };

  /** A run that ends when the test calls `finish`, or with `null` on cancel. */
  function setup(code: BriefInput["code"] = { actions: [], titles: {}, statuses: {}, since: {} }) {
    let finish!: (o: Outcome | null) => void;
    const changes: string[] = [];
    const svc = briefService({
      offered: CLIS,
      input: () => ({ code, threads: [{ id: "o" } as InputThread] }),
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
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }))).status).toBe(202);
    expect(svc.state()).toMatchObject({ status: "running", cli: "claude", threadCount: 1 });
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }))).status).toBe(409);
    finish(done());
    await flush();
    expect(svc.state().status).toBe("done");
    expect(changes).toEqual(["running", "done"]);
  });

  test("refuses a model that is not offered", async () => {
    const { svc } = setup();
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "codex" }))).status).toBe(400);
    expect((await svc.routes["/brief/run"].POST(post("/brief/run"))).status).toBe(400);
    expect(svc.state().status).toBe("idle");
  });

  test("GET /models returns what offered gives", async () => {
    const { svc } = setup();
    expect(await (await svc.routes["/models"].GET()).json()).toEqual(await CLIS());
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
      offered: CLIS,
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
      ...SNAP,
    });
    expect(svc.state()).not.toHaveProperty("rulesOnly");
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
      offered: CLIS,
      input: () => ({ code: CODE, threads: [] }),
      onChange: () => {},
      run: () => ((ran = true), { done: new Promise(() => {}), cancel: () => {} }),
    });
    expect((await svc.routes["/brief/run"].POST(post("/brief/run", { cli: "claude" }))).status).toBe(202);
    expect(ran).toBe(false);
    expect(svc.state()).toMatchObject({ status: "done", cli: "claude", rulesOnly: true, ...CODE });
  });
});

describe("runBrief", () => {
  const threads = [{ id: "A", ref: "t1", title: "Alpha", digest: "t1 line" }];
  function fakeRun(res: ModelResult | null) {
    return { done: Promise.resolve(res), cancel() {} };
  }
  const fake = (res: ModelResult | null) => () => fakeRun(res);
  test("passes the guide, the digests and the schema to the model", async () => {
    let job: { guide: string; input: string; schema: object } | undefined;
    await runBrief((_p, j) => ((job = j), fakeRun({ answer: { actions: [] } })), "claude", threads).done;
    expect(job?.input).toBe("t1 line");
    expect(job?.schema).toHaveProperty("required", ["actions"]);
  });
  test("an answer is filtered into done", async () => {
    const answer = { actions: [{ kind: "review", title: "t", reason: "r", threadIds: ["t1", "X"], prompt: null }] };
    const out = await runBrief(fake({ answer }), "claude", threads, () => new Date(0)).done;
    expect(out).toEqual({
      status: "done",
      cli: "claude",
      generatedAt: "1970-01-01T00:00:00.000Z",
      actions: [{ kind: "review", title: "t", reason: "r", threadIds: ["A"], prompt: null }],
      titles: { A: "Alpha" },
    });
  });
  test("an error becomes failed with the detail as stderrTail", async () => {
    const out = await runBrief(fake({ error: "e", detail: "d" }), "codex", threads).done;
    expect(out).toEqual({ status: "failed", cli: "codex", error: "e", stderrTail: "d", actions: [], titles: {} });
  });
  test("null after cancel stays null", async () => {
    expect(await runBrief(fake(null), "claude", threads).done).toBeNull();
  });
  test("a bad answer is failed", async () => {
    const out = await runBrief(fake({ answer: {} }), "claude", threads).done;
    expect(out).toMatchObject({ status: "failed", error: "The answer has no actions list.", stderrTail: "" });
  });
});
