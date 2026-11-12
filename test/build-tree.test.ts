import { describe, expect, test } from "bun:test";
import { buildTree, issueKey, statusOf, type BuildInput } from "../src/server/build-tree.ts";
import { homedir } from "node:os";
import { decodeItem, decodeThread, type Thread } from "../src/server/t3.ts";
import { launchedIds } from "../src/server/lineage.ts";
import type { Branch, Status, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
let clock = 0;

/** A raw shell thread, as `orchestration.subscribeShell` sends it. */
function shell(id: string, title: string, over: Record<string, unknown> = {}) {
  clock += 1;
  return {
    id,
    projectId: "p1",
    title,
    providerInstanceId: "claudeAgent",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: id },
    forkedFrom: null,
    activeProviderThreadId: null,
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 1,
    visibleItemCount: 1,
    createdAt: "2026-11-12T08:00:00.000Z",
    updatedAt: `2026-11-12T09:${String(clock).padStart(2, "0")}:00.000Z`,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    ...over,
  };
}

const pr = (number: number, source: string, state = "open", stack: object | null = null) => ({
  host: "github.com",
  repository: "org/repo",
  number,
  url: `https://github.com/org/repo/pull/${number}`,
  source,
  linkedAt: "2026-11-12T08:00:00.000Z",
  snapshot: { state, title: "x", headBranch: "h", baseBranch: "b", isDraft: false, updatedAt: null, syncedAt: "2026-11-12T08:00:00.000Z" },
  stack,
});

function build(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) {
  const threads = raws.map((r) => decodeThread(r)!);
  return buildTree({
    threads,
    projects: new Map([["p1", { title: "frontend", repo: "acme/frontend" }], ["p2", { title: "backend", repo: null }]]),
    spawnerOf: (id) => spawners[id],
    environmentId: "env-1",
    settled: false,
    now: NOW,
    ...over,
  });
}

const labels = (b: Branch[]) => b.map((x) => x.label);
const child = (b: Branch[], ...path: string[]): Branch =>
  path.reduce<Branch>((cur, l) => cur.branches.find((x) => x.label === l)!, { branches: b } as Branch);
const titles = (ts: ThreadNode[]) => ts.map((t) => t.title);

describe("issue key", () => {
  test("first match, review number ignored", () => {
    expect(issueKey("Review #15708 SHOP-4319")).toBe("SHOP-4319");
    expect(issueKey("WEB-6081 then WEB-6082")).toBe("WEB-6081");
    expect(issueKey("combobox work")).toBeNull();
    expect(issueKey("x-123 lower")).toBeNull();
  });
});

describe("visibility", () => {
  test("settled, archived, deleted, subagent and side chat threads are hidden", () => {
    const tree = build([
      shell("a", "SHOP-1 open"),
      shell("b", "SHOP-2 settled", { settledAt: "2026-11-12T09:00:00.000Z", settledOverride: "settled" }),
      shell("c", "SHOP-3 archived", { archivedAt: "2026-11-12T09:00:00.000Z" }),
      shell("d", "SHOP-4 deleted", { deletedAt: "2026-11-12T09:00:00.000Z" }),
      shell("e", "SHOP-5 subagent", { lineage: { parentThreadId: "a", relationshipToParent: "subagent", rootThreadId: "a" } }),
      shell("f", "SHOP-6 side", { lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: "f", sideChat: true } }),
    ]);
    expect(labels(tree[0]!.branches)).toEqual(["SHOP-1"]);
  });

  test("settled toggle shows settled threads, never archived ones", () => {
    const tree = build(
      [
        shell("a", "SHOP-1 open"),
        shell("b", "SHOP-2 settled", { settledAt: "2026-11-12T09:00:00.000Z" }),
        shell("c", "SHOP-3 archived", { archivedAt: "2026-11-12T09:00:00.000Z" }),
      ],
      {},
      { settled: true },
    );
    expect(labels(tree[0]!.branches).sort()).toEqual(["SHOP-1", "SHOP-2"]);
  });

  test("snoozed threads stay visible, with their wake time", () => {
    const until = "2026-11-13T09:00:00.000Z";
    const [t] = build([shell("a", "SHOP-1", { snoozedUntil: until, status: "completed" })])[0]!.branches[0]!.threads;
    expect(t!.status).toBe("snoozed");
    expect(t!.snoozedUntil).toBe(until);
  });

  test("an archive-location update removes the thread", () => {
    expect(decodeItem({ kind: "thread.updated", sequence: 1, location: "archive", thread: shell("a", "x") })).toEqual({
      kind: "thread.removed",
      id: "a",
    });
  });
});

describe("project repository", () => {
  test("a project branch carries its repo only when known", () => {
    const tree = build([shell("a", "SHOP-1 x"), shell("b", "SHOP-2 y", { projectId: "p2" })]);
    const byLabel = (l: string) => tree.find((b) => b.label === l)!;
    expect(byLabel("frontend").repo).toBe("acme/frontend");
    expect("repo" in byLabel("backend")).toBe(false);
  });

  test("decodeItem reads owner/name from repositoryIdentity, else null", () => {
    const withRepo = { id: "p1", title: "shop", repositoryIdentity: { owner: "acme", name: "shop" } };
    const without = { id: "p2", title: "docs" };
    expect(decodeItem({ kind: "snapshot", snapshot: { threads: [], projects: [withRepo, without] } })).toEqual({
      kind: "snapshot",
      fresh: false,
      threads: [],
      projects: [
        ["p1", { title: "shop", repo: "acme/shop" }],
        ["p2", { title: "docs", repo: null }],
      ],
    });
    expect(decodeItem({ kind: "project.updated", project: withRepo })).toEqual({
      kind: "project",
      id: "p1",
      project: { title: "shop", repo: "acme/shop" },
    });
    expect(decodeItem({ kind: "project.updated", project: without })).toEqual({
      kind: "project",
      id: "p2",
      project: { title: "docs", repo: null },
    });
  });
});

describe("placement", () => {
  test("Reviews group by key, keyed groups, No issue key last", () => {
    const tree = build([
      shell("r1", "Review #15708 SHOP-4319"),
      shell("r2", "Review #15709 without key"),
      shell("k", "SHOP-4319 build the thing"),
      shell("n", "loose thread"),
    ]);
    const p = tree[0]!;
    expect(labels(p.branches)).toEqual(["SHOP-4319", "Reviews", "No issue key"]);
    expect(labels(child(tree, "frontend", "Reviews").branches)).toEqual(["No issue key", "SHOP-4319"]);
    expect(titles(child(tree, "frontend", "Reviews", "SHOP-4319").threads)).toEqual(["Review #15708 SHOP-4319"]);
  });

  test("keyless thread nests under its visible spawner, skipping a settled launcher", () => {
    const tree = build(
      [
        shell("map", "Wayfinder map"),
        shell("launcher", "launcher", { settledAt: "2026-11-12T09:00:00.000Z" }),
        shell("mcp:t1", "ticket 001"),
      ],
      { "mcp:t1": "launcher", launcher: "map" },
    );
    const [map] = child(tree, "frontend", "No issue key").threads;
    expect(map!.title).toBe("Wayfinder map");
    expect(titles(map!.children)).toEqual(["ticket 001"]);
  });

  test("keyed thread stays under its key even with a visible spawner", () => {
    const tree = build([shell("a", "SHOP-4312 parent"), shell("mcp:b", "SHOP-4313 child")], { "mcp:b": "a" });
    expect(labels(tree[0]!.branches).sort()).toEqual(["SHOP-4312", "SHOP-4313"]);
  });

  test("spawner in another project is not followed", () => {
    const tree = build([shell("a", "Adapt planning"), shell("mcp:b", "t3exp work", { projectId: "p2" })], { "mcp:b": "a" });
    expect(labels(tree).sort()).toEqual(["backend", "frontend"]);
    expect(titles(child(tree, "backend", "No issue key").threads)).toEqual(["t3exp work"]);
  });

  test("no visible spawner in the chain → No issue key", () => {
    const tree = build([shell("x", "gone", { settledAt: "2026-11-12T09:00:00.000Z" }), shell("mcp:b", "orphan")], { "mcp:b": "x" });
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["orphan"]);
  });

  test("a spawner cycle does not hang", () => {
    const tree = build([shell("mcp:a", "a"), shell("mcp:b", "b")].map((t) => ({ ...t, settledAt: null })), {
      "mcp:a": "x",
      x: "y",
      y: "x",
    });
    expect(child(tree, "frontend", "No issue key").threads.length).toBe(2);
  });
});

describe("order", () => {
  test("projects and threads newest first; latest update includes nested threads", () => {
    const tree = build(
      [
        shell("old", "old root"),
        shell("b1", "backend thing", { projectId: "p2" }),
        shell("new", "new root"),
        shell("mcp:kid", "kid of old"),
      ],
      { "mcp:kid": "old" },
    );
    expect(labels(tree)).toEqual(["frontend", "backend"]);
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["old root", "new root"]);
  });
});

describe("PR stack", () => {
  /** WEB-1 holds #10, WEB-2 #11, WEB-3 #12; each thread lists the stack. */
  const stacked = () => [
    shell("s3", "WEB-3 top", { pullRequests: [pr(12, "created"), pr(10, "stack"), pr(11, "stack")] }),
    shell("other", "WEB-9 unrelated"),
    shell("s1", "WEB-1 base", { pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack"), pr(12, "stack")] }),
    shell("s2", "WEB-2 middle", { pullRequests: [pr(11, "created"), pr(10, "stack"), pr(12, "stack"), pr(99, "manual")] }),
  ];

  test("badge position and total", () => {
    const tree = build(stacked());
    const pos = (k: string) => child(tree, "frontend", k).threads[0]!.stack;
    expect(pos("WEB-1")).toEqual({ pos: 1, total: 3 });
    expect(pos("WEB-2")).toEqual({ pos: 2, total: 3 });
    expect(pos("WEB-3")).toEqual({ pos: 3, total: 3 });
    expect(pos("WEB-9")).toBeNull();
  });

  test("stack-mate groups sit together in stack order, at the newest member's slot", () => {
    expect(labels(build(stacked())[0]!.branches)).toEqual(["WEB-1", "WEB-2", "WEB-3", "WEB-9"]);
  });

  test("the decoder reads the stack base", () => {
    const t = decodeThread(shell("x", "WEB-1", { pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack")] }))!;
    expect(t.prs.map((p) => p.stackBase)).toEqual(["main", null]);
  });

  test("key groups of one stack carry the rail; others carry none", () => {
    const tree = build(stacked());
    for (const k of ["WEB-1", "WEB-2", "WEB-3"]) expect(child(tree, "frontend", k).stack).toEqual({ id: "s10", total: 3, base: "main" });
    expect("stack" in child(tree, "frontend", "WEB-9")).toBe(false);
  });

  test("a stack with no base has a null base", () => {
    const tree = build([
      shell("a", "WEB-20 a", { pullRequests: [pr(30, "created"), pr(31, "stack")] }),
      shell("b", "WEB-21 b", { pullRequests: [pr(31, "created"), pr(30, "stack")] }),
    ]);
    expect(child(tree, "frontend", "WEB-20").stack).toEqual({ id: "s30", total: 2, base: null });
  });

  test("a thread with no key gets no rail", () => {
    const tree = build([...stacked(), shell("loose", "loose thread", { pullRequests: [pr(12, "stack"), pr(10, "stack")] })]);
    expect("stack" in child(tree, "frontend", "No issue key")).toBe(false);
  });

  test("node PRs leave out stack links; closed PRs are not stack members", () => {
    const tree = build([
      ...stacked(),
      shell("c", "WEB-5 closed", { pullRequests: [pr(20, "created", "merged"), pr(21, "stack", "merged")] }),
    ]);
    expect(child(tree, "frontend", "WEB-2").threads[0]!.prs.map((p) => p.n)).toEqual([11, 99]);
    const closed = child(tree, "frontend", "WEB-5").threads[0]!;
    expect(closed.stack).toBeNull();
    expect(closed.prs).toEqual([
      { n: 20, url: "https://github.com/org/repo/pull/20", state: "merged", draft: false, checks: null, review: null, conflicting: false, title: "x", additions: null, deletions: null, changedFiles: null },
    ]);
  });
});

describe("status", () => {
  const s = (over: Record<string, unknown>) => statusOf(decodeThread(shell("a", "x", over)) as Thread, NOW);
  const req = (kind: string, extra: object = {}) => ({ id: "r", kind, createdAt: "2026-11-12T09:00:00.000Z", ...extra });
  const SNOOZE = "2026-11-13T00:00:00.000Z";
  const DONE_AT = { latestRunCompletedAt: "2026-11-12T10:00:00.000Z" };

  test.each<[string, Record<string, unknown>, Status]>([
    ["request", { pendingRuntimeRequest: req("user_input") }, "needs-input"],
    ["guest message", { pendingGuestMessageCount: 2 }, "needs-input"],
    ["snooze", { status: "completed", snoozedUntil: SNOOZE }, "snoozed"],
    ["waiting", { status: "running", blockedOnThreadWait: true }, "waiting"],
    ["working", { status: "running" }, "working"],
    ["waiting run status", { status: "waiting" }, "working"],
    ["starting", { status: "preparing" }, "starting"],
    ["plan-ready", { status: "completed", interactionMode: "plan", hasActionableProposedPlan: true }, "plan-ready"],
    ["your-turn", { status: "completed", ...DONE_AT }, "your-turn"],
    ["done", { status: "completed" }, "done"],
    ["failed", { status: "failed" }, "failed"],
    ["interrupted", { status: "rolled_back" }, "interrupted"],
    ["idle", { status: "something-new" }, "idle"],
    ["request beats snooze", { pendingRuntimeRequest: req("user_input"), snoozedUntil: SNOOZE }, "needs-input"],
    ["snooze beats run", { status: "running", snoozedUntil: SNOOZE }, "snoozed"],
    ["past snooze is ignored", { status: "completed", snoozedUntil: "2026-11-11T00:00:00.000Z" }, "done"],
    ["non-blocking request does not block", { status: "running", pendingRuntimeRequest: req("user_input", { blocking: false }) }, "working"],
    ["activity run status beats status", { status: "idle", activityRunStatus: "running" }, "working"],
    ["plan-ready beats your-turn", { status: "completed", interactionMode: "plan", hasActionableProposedPlan: true, ...DONE_AT }, "plan-ready"],
    ["plan without proposal", { status: "completed", interactionMode: "plan" }, "done"],
  ])("%s", (_name, over, status) => {
    expect(s(over).status).toBe(status);
  });

  test.each([
    ["command", "Approval"],
    ["file-read", "Approval"],
    ["file-change", "Approval"],
    ["permission", "Approval"],
    ["dynamic_tool_call", "Approval"],
    ["user_input", "Question"],
    ["mcp-elicitation", "Question"],
    ["auth_refresh", "Sign in"],
    ["constructor", "Input"],
    ["unknown", "Input"],
  ])("request kind %s reads %s", (kind, phrase) => {
    expect(s({ pendingRuntimeRequest: req(kind) }).phrase).toBe(phrase);
  });

  test("guest messages alone, or with a non-blocking request, read Guest message with no since", () => {
    expect(s({ pendingGuestMessageCount: 1 })).toEqual({ status: "needs-input", phrase: "Guest message", since: null });
    expect(s({ pendingGuestMessageCount: 1, pendingRuntimeRequest: req("command", { blocking: false }) }).phrase).toBe("Guest message");
  });

  test.each<[string, Record<string, unknown>, Status]>([
    ["no completion time", { status: "completed" }, "done"],
    ["never visited", { status: "completed", ...DONE_AT }, "your-turn"],
    ["visited before", { status: "completed", ...DONE_AT, lastVisitedAt: "2026-11-12T09:00:00.000Z" }, "your-turn"],
    ["visited after", { status: "completed", ...DONE_AT, lastVisitedAt: "2026-11-12T11:00:00.000Z" }, "done"],
  ])("unseen completion: %s", (_name, over, status) => {
    expect(s(over).status).toBe(status);
  });

  test("since: request time, activity run start, else latest run start", () => {
    expect(s({ pendingRuntimeRequest: req("command") }).since).toBe("2026-11-12T09:00:00.000Z");
    const both = { status: "running", activityRunStartedAt: "2026-11-12T08:00:00.000Z", latestRunStartedAt: "2026-11-12T07:00:00.000Z" };
    expect(s(both).since).toBe("2026-11-12T08:00:00.000Z");
    expect(s({ ...both, activityRunStartedAt: null }).since).toBe("2026-11-12T07:00:00.000Z");
    expect(s({ status: "completed", ...DONE_AT }).since).toBeNull();
  });

  test("Queued, Starting and Cancelled phrases", () => {
    expect(s({ status: "queued" }).phrase).toBe("Queued");
    expect(s({ status: "starting" }).phrase).toBe("Starting");
    expect(s({ status: "cancelled" })).toEqual({ status: "interrupted", phrase: "Cancelled", since: null });
    expect(s({ status: "interrupted" }).phrase).toBe("Interrupted");
  });

  test("node carries key, updatedAt, settled, input and PR marks; absent snapshot fields give false or null", () => {
    const marked = {
      ...pr(7, "created"),
      snapshot: { ...pr(7, "created").snapshot, isDraft: true, checksState: "failing", reviewDecision: "changes-requested", mergeability: "conflicting" },
    };
    const [t] = build([
      shell("a", "SHOP-1 x", {
        settledAt: "2026-11-12T09:00:00.000Z",
        pendingRuntimeRequest: req("command", { blocking: false }),
        pullRequests: [marked, pr(8, "manual")],
      }),
    ], {}, { settled: true })[0]!.branches[0]!.threads;
    expect(t).toMatchObject({ key: "SHOP-1", settled: true, input: true, updatedAt: expect.any(String) });
    expect(t!.prs).toEqual([
      { n: 7, url: "https://github.com/org/repo/pull/7", state: "open", draft: true, checks: "failing", review: "changes-requested", conflicting: true, title: "x", additions: null, deletions: null, changedFiles: null },
      { n: 8, url: "https://github.com/org/repo/pull/8", state: "open", draft: false, checks: null, review: null, conflicting: false, title: "x", additions: null, deletions: null, changedFiles: null },
    ]);
  });
});

describe("details", () => {
  const node = (raws: object[], id: string, spawners: Record<string, string> = {}) => {
    const walk = (ts: ThreadNode[]): ThreadNode[] => ts.flatMap((t) => [t, ...walk(t.children)]);
    const walkB = (b: Branch): ThreadNode[] => [...walk(b.threads), ...b.branches.flatMap(walkB)];
    return build(raws, spawners).flatMap(walkB).find((t) => t.id === id)!;
  };
  const EMPTY = {
    request: null, error: null, limitResetAt: null, autoResume: false, stopRequested: false, model: null, planMode: false,
    branch: null, worktreePath: null, launchedBy: null, origin: null, startedBy: null, createdAt: "2026-11-12T08:00:00.000Z",
    goal: null, tags: [], pinned: false,
  };

  test("every field decodes into the detail and the PR counts", () => {
    const full = shell("a", "SHOP-1 x", {
      pendingRuntimeRequest: { id: "r", kind: "command", createdAt: "2026-11-12T11:57:00.000Z" },
      lastError: "boom", lastErrorClass: "provider", lastErrorCode: "e1",
      usageLimitResetAt: "2026-11-12T14:00:00.000Z",
      limitRecovery: { resetAt: "2026-11-12T15:00:00.000Z", autoResume: true },
      latestRunStopRequested: true,
      modelSelection: { model: "m1" },
      interactionMode: "plan",
      branch: "b",
      worktreePath: `${homedir()}/w`,
      createdBy: "agent", creationSource: "mcp",
      goal: { objective: "ship", status: "active" },
      tags: ["x", 3, "y"],
      pinnedAt: "2026-11-12T08:00:00.000Z",
      pullRequests: [{ ...pr(1, "created"), snapshot: { ...pr(1, "created").snapshot, additions: 5, deletions: 2, changedFiles: 3 } }],
    });
    const t = node([full], "a");
    expect(t.detail).toEqual({
      request: "command · 3m",
      error: { class: "provider", code: "e1", text: "boom" },
      limitResetAt: "2026-11-12T14:00:00.000Z",
      autoResume: true,
      stopRequested: true,
      model: "m1",
      planMode: true,
      branch: "b",
      worktreePath: "~/w",
      launchedBy: null,
      origin: null,
      startedBy: "agent via mcp",
      createdAt: "2026-11-12T08:00:00.000Z",
      goal: { objective: "ship", status: "active" },
      tags: ["x", "y"],
      pinned: true,
    });
    expect(t.prs[0]).toMatchObject({ title: "x", additions: 5, deletions: 2, changedFiles: 3 });
    expect(decodeThread(shell("b", "y", { worktreePath: `${homedir()}x/w` }))!.worktreePath).toBe(`${homedir()}x/w`);
  });

  test("no optional field gives nulls, false and empty lists", () => {
    const t = node([shell("a", "SHOP-1 x", { pullRequests: [pr(1, "created")] })], "a");
    expect(t.detail).toEqual(EMPTY);
    expect(t.prs[0]).toMatchObject({ additions: null, deletions: null, changedFiles: null });
  });

  test("a request without a kind reads request", () => {
    expect(node([shell("a", "SHOP-1 x", { pendingRuntimeRequest: { id: "r" } })], "a").detail.request).toBe("request");
  });

  test("limit reset falls back to limitRecovery.resetAt", () => {
    const t = node([shell("a", "SHOP-1 x", { limitRecovery: { resetAt: "2026-11-12T15:00:00.000Z" } })], "a");
    expect(t.detail).toMatchObject({ limitResetAt: "2026-11-12T15:00:00.000Z", autoResume: false });
  });

  test("origin: fork of a known thread, unknown fork, delegated, link label", () => {
    const raws = [
      shell("src", "Source thread"),
      shell("f1", "SHOP-1 a", { forkedFrom: { kind: "run", threadId: "src" } }),
      shell("f2", "SHOP-2 b", { forkedFrom: { kind: "run", threadId: "nope" }, delegatedFrom: { title: "Boss" } }),
      shell("f3", "SHOP-3 c", { forkedFrom: { kind: "run", threadId: "nope" }, linkOrigin: { label: "Linear" } }),
    ];
    expect(node(raws, "f1").detail.origin).toBe("Fork of Source thread");
    expect(node(raws, "f2").detail.origin).toBe("Delegated from Boss");
    expect(node(raws, "f3").detail.origin).toBe("via Linear");
  });

  describe("launchedBy", () => {
    const spawner = { title: "Spawner", href: "t3code://threads/env-1/sp" };
    test("null when the thread nests under its spawner or the spawner is unknown", () => {
      const raws = [shell("sp", "Spawner"), shell("k", "keyless")];
      expect(node(raws, "k", { k: "sp" }).detail.launchedBy).toBeNull();
      expect(node([shell("k", "keyless")], "k", { k: "ghost" }).detail.launchedBy).toBeNull();
    });
    test("set for a keyed thread", () => {
      expect(node([shell("sp", "Spawner"), shell("k", "SHOP-1 keyed")], "k", { k: "sp" }).detail.launchedBy).toEqual(spawner);
    });
    test("set under No issue key when the spawner is in another project", () => {
      const raws = [shell("sp", "Spawner", { projectId: "p2" }), shell("k", "keyless")];
      expect(node(raws, "k", { k: "sp" }).detail.launchedBy).toEqual(spawner);
    });
    test("names a settled spawner when the thread nests under a grandparent", () => {
      const raws = [shell("gp", "Grand"), shell("sp", "Spawner", { settledAt: "2026-11-12T09:00:00.000Z" }), shell("k", "keyless")];
      expect(node(raws, "k", { k: "sp", sp: "gp" }).detail.launchedBy).toEqual(spawner);
    });
  });
});

describe("lineage tool results", () => {
  test("launch, create_threads, delegate_task and wrapped text", () => {
    expect(launchedIds('{"threadId":"mcp:1","projectId":"p"}')).toEqual(["mcp:1"]);
    expect(launchedIds('{"threads":[{"threadId":"thread:mcp:a"},{"threadId":"thread:mcp:b"}]}')).toEqual(["thread:mcp:a", "thread:mcp:b"]);
    expect(launchedIds('{"taskId":"n","childThreadId":"thread:delegated-task:x"}')).toEqual(["thread:delegated-task:x"]);
    expect(launchedIds('[{"type":"text","text":"{\\"threadId\\":\\"mcp:2\\"}"}]')).toEqual(["mcp:2"]);
    expect(launchedIds("not json")).toEqual([]);
  });
});
