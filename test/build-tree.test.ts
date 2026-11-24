import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import { flatten, sortFlat } from "../src/page/view.ts";
import { buildLinearTree, buildTree, issueKey, statusOf, type BuildInput } from "../src/server/build-tree.ts";
import { launchedIds } from "../src/server/lineage.ts";
import { decodeItem, decodeThread, type RunsSnapshot, type Thread } from "../src/server/t3.ts";
import {
  NO_KEY,
  NO_MILESTONE,
  NO_PROJECT,
  allRuns,
  allThreads,
  isFallback,
  type Branch,
  type LinearIssue,
  type Status,
  type ThreadNode,
} from "../src/shared/tree.ts";

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
    createdAt: new Date(Date.parse("2026-11-12T08:00:00.000Z") + clock * 1000).toISOString(),
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
  snapshot: {
    state,
    title: "x",
    headBranch: "h",
    baseBranch: "b",
    isDraft: false,
    updatedAt: null,
    syncedAt: "2026-11-12T08:00:00.000Z",
  },
  stack,
});

function inputOf(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}): BuildInput {
  const threads = raws.map((r) => decodeThread(r)!);
  return {
    threads,
    projects: new Map([
      ["p1", { title: "frontend", repo: "acme/frontend" }],
      ["p2", { title: "backend", repo: null }],
    ]),
    spawnerOf: (id) => spawners[id],
    environmentId: "env-1",
    settled: false,
    nest: true,
    now: NOW,
    ...over,
  };
}

function build(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) {
  return buildTree(inputOf(raws, spawners, over));
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
      shell("e", "SHOP-5 subagent", {
        lineage: { parentThreadId: "a", relationshipToParent: "subagent", rootThreadId: "a" },
      }),
      shell("f", "SHOP-6 side", {
        lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: "f", sideChat: true },
      }),
    ]);
    expect(labels(tree[0].branches)).toEqual(["SHOP-1"]);
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
    expect(labels(tree[0].branches).toSorted()).toEqual(["SHOP-1", "SHOP-2"]);
  });

  test("snoozed threads stay visible, with their wake time", () => {
    const until = "2026-11-13T09:00:00.000Z";
    const [t] = build([shell("a", "SHOP-1", { snoozedUntil: until, status: "completed" })])[0].branches[0].threads;
    expect(t.status).toBe("snoozed");
    expect(t.snoozedUntil).toBe(until);
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
  test("Reviews first and grouped by key, then keyed groups, No issue key last", () => {
    const tree = build([
      shell("r1", "Review #15708 SHOP-4319"),
      shell("r2", "Review #15709 without key"),
      shell("k", "SHOP-4319 build the thing"),
      shell("n", "loose thread"),
    ]);
    const p = tree[0];
    expect(labels(p.branches)).toEqual(["Reviews", "SHOP-4319", "No issue key"]);
    expect(labels(child(tree, "frontend", "Reviews").branches)).toEqual(["SHOP-4319", "No issue key"]);
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
    expect(map.title).toBe("Wayfinder map");
    expect(titles(map.children)).toEqual(["ticket 001"]);
  });

  test("with nesting off, a launched thread sits in No issue key and names its spawner", () => {
    const tree = build(
      [shell("map", "Wayfinder map"), shell("mcp:t1", "ticket 001")],
      { "mcp:t1": "map" },
      { nest: false },
    );
    const ts = child(tree, "frontend", "No issue key").threads;
    expect(titles(ts)).toEqual(["Wayfinder map", "ticket 001"]);
    expect(ts[0].children).toEqual([]);
    expect(ts[1].detail.launchedBy).toEqual({ title: "Wayfinder map", href: "t3code://threads/env-1/map" });
  });

  test("keyed thread stays under its key even with a visible spawner", () => {
    const tree = build([shell("a", "SHOP-4312 parent"), shell("mcp:b", "SHOP-4313 child")], { "mcp:b": "a" });
    expect(labels(tree[0].branches).toSorted()).toEqual(["SHOP-4312", "SHOP-4313"]);
  });

  test("spawner in another project is not followed", () => {
    const tree = build([shell("a", "Adapt planning"), shell("mcp:b", "t3exp work", { projectId: "p2" })], {
      "mcp:b": "a",
    });
    expect(labels(tree).toSorted()).toEqual(["backend", "frontend"]);
    expect(titles(child(tree, "backend", "No issue key").threads)).toEqual(["t3exp work"]);
  });

  test("no visible spawner in the chain → No issue key", () => {
    const tree = build([shell("x", "gone", { settledAt: "2026-11-12T09:00:00.000Z" }), shell("mcp:b", "orphan")], {
      "mcp:b": "x",
    });
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["orphan"]);
  });

  test("a spawner cycle does not hang", () => {
    const tree = build(
      [shell("mcp:a", "a"), shell("mcp:b", "b")].map((t) => ({ ...t, settledAt: null })),
      {
        "mcp:a": "x",
        x: "y",
        y: "x",
      },
    );
    expect(child(tree, "frontend", "No issue key").threads.length).toBe(2);
  });
});

describe("order", () => {
  test("projects, groups and threads in creation order, oldest first", () => {
    const tree = build(
      [
        shell("b1", "backend thing", { projectId: "p2" }),
        shell("old", "old root"),
        shell("new", "new root"),
        shell("mcp:kid", "kid of old"),
      ],
      { "mcp:kid": "old" },
    );
    expect(labels(tree)).toEqual(["backend", "frontend"]);
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["old root", "new root"]);
  });

  test("lastRun is the latest of activity run start, run start and run end, and null when all are null", () => {
    const run = (over: Record<string, unknown>) =>
      build([shell("a", "SHOP-1 a", over)])[0].branches[0].threads[0].lastRun;
    const early = "2026-11-12T07:00:00.000Z";
    const late = "2026-11-12T08:00:00.000Z";
    expect(run({ latestRunStartedAt: early, latestRunCompletedAt: late })).toBe(late);
    expect(run({ latestRunStartedAt: late, latestRunCompletedAt: early })).toBe(late);
    expect(run({ latestRunStartedAt: early })).toBe(early);
    expect(run({ activityRunStartedAt: late })).toBe(late);
    expect(run({ activityRunStartedAt: late, latestRunStartedAt: early, latestRunCompletedAt: early })).toBe(late);
    expect(run({ activityRunStartedAt: early, latestRunCompletedAt: late })).toBe(late);
    expect(run({})).toBeNull();
  });

  test("Last updated puts a working thread with a queued follow-up run first", () => {
    const tree = build([
      shell("old", "SHOP-1 old", { status: "completed", latestRunCompletedAt: "2026-11-10T08:00:00.000Z" }),
      shell("busy", "SHOP-2 busy", {
        status: "queued",
        activityRunStatus: "running",
        activityRunStartedAt: "2026-11-12T11:59:00.000Z",
      }),
      shell("mid", "SHOP-3 mid", { status: "completed", latestRunCompletedAt: "2026-11-12T11:00:00.000Z" }),
    ]);
    expect(sortFlat(flatten(tree)).map((u) => u.id)).toEqual(["t:busy", "t:mid", "t:old"]);
  });

  test("an updatedAt or run change does not move a row", () => {
    const a = shell("a", "SHOP-1 a");
    const b = shell("b", "SHOP-2 b");
    const change = {
      updatedAt: "2026-11-12T23:00:00.000Z",
      activityRunStatus: "running",
      pullRequests: [pr(5, "created")],
    };
    const bump = (t: typeof a) => ({ ...t, ...change });
    expect(labels(build([a, b])[0].branches)).toEqual(["SHOP-1", "SHOP-2"]);
    expect(labels(build([bump(a), b])[0].branches)).toEqual(["SHOP-1", "SHOP-2"]);
    expect(labels(build([a, bump(b)])[0].branches)).toEqual(["SHOP-1", "SHOP-2"]);
  });

  test("same createdAt: the thread id breaks the tie", () => {
    const at = { createdAt: "2026-11-12T08:00:00.000Z" };
    const tree = build([shell("b", "second", at), shell("a", "first", at)]);
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["first", "second"]);
  });

  test("a new thread appends at the end of its group", () => {
    const tree = build([shell("5", "old root"), shell("0", "new root")]);
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["old root", "new root"]);
  });

  test("a new group appends at the end of its section", () => {
    const tree = build([
      shell("r", "Review #1 without key"),
      shell("n", "loose thread"),
      shell("k1", "SHOP-1 first"),
      shell("k2", "SHOP-2 second"),
    ]);
    expect(labels(tree[0].branches)).toEqual(["Reviews", "SHOP-1", "SHOP-2", "No issue key"]);
  });
});

describe("PR stack", () => {
  /** WEB-1 holds #10, WEB-2 #11, WEB-3 #12; each thread lists the stack. */
  const stacked = () => [
    shell("s3", "WEB-3 top", { pullRequests: [pr(12, "created"), pr(10, "stack"), pr(11, "stack")] }),
    shell("other", "WEB-9 unrelated"),
    shell("s1", "WEB-1 base", {
      pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack"), pr(12, "stack")],
    }),
    shell("s2", "WEB-2 middle", {
      pullRequests: [pr(11, "created"), pr(10, "stack"), pr(12, "stack"), pr(99, "manual")],
    }),
  ];

  test("badge position and total", () => {
    const tree = build(stacked());
    const pos = (k: string) => child(tree, "frontend", k).threads[0].stack;
    expect(pos("WEB-1")).toEqual({ pos: 1, total: 3 });
    expect(pos("WEB-2")).toEqual({ pos: 2, total: 3 });
    expect(pos("WEB-3")).toEqual({ pos: 3, total: 3 });
    expect(pos("WEB-9")).toBeNull();
  });

  test("stack-mate groups sit together in stack order, at the oldest member's slot", () => {
    expect(labels(build(stacked())[0].branches)).toEqual(["WEB-1", "WEB-2", "WEB-3", "WEB-9"]);
  });

  test("the decoder reads the stack base", () => {
    const t = decodeThread(
      shell("x", "WEB-1", { pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack")] }),
    )!;
    expect(t.prs.map((p) => p.stackBase)).toEqual(["main", null]);
  });

  test("key groups of one stack carry the rail; others carry none", () => {
    const tree = build(stacked());
    for (const k of ["WEB-1", "WEB-2", "WEB-3"])
      expect(child(tree, "frontend", k).stack).toEqual({ id: "s10", total: 3, base: "main" });
    expect("stack" in child(tree, "frontend", "WEB-9")).toBe(false);
  });

  test("a stack with no base has a null base", () => {
    const tree = build([
      shell("a", "WEB-20 a", { pullRequests: [pr(30, "created"), pr(31, "stack")] }),
      shell("b", "WEB-21 b", { pullRequests: [pr(31, "created"), pr(30, "stack")] }),
    ]);
    expect(child(tree, "frontend", "WEB-20").stack).toEqual({ id: "s30", total: 2, base: null });
  });

  test("a keyless stack mate joins a stack group with the rail, next to its keyed mates", () => {
    const tree = build([
      ...stacked(),
      shell("loose", "loose thread", { pullRequests: [pr(12, "stack"), pr(10, "stack")] }),
      shell("plain", "plain thread"),
    ]);
    expect(labels(tree[0].branches)).toEqual(["WEB-1", "WEB-2", "WEB-3", "PR stack #10", "WEB-9", "No issue key"]);
    expect(child(tree, "frontend", "PR stack #10").stack).toEqual({ id: "s10", total: 3, base: "main" });
    expect(titles(child(tree, "frontend", "No issue key").threads)).toEqual(["plain thread"]);
    expect("stack" in child(tree, "frontend", "No issue key")).toBe(false);
  });

  test("keyless launched stack threads share one stack group instead of nesting", () => {
    const tree = build(
      [
        shell("lead", "dispatch"),
        shell("a", "wait-time-04 one", { pullRequests: [pr(61, "created"), pr(65, "stack"), pr(67, "stack")] }),
        shell("b", "wait-time-05 two", { pullRequests: [pr(65, "created"), pr(61, "stack"), pr(67, "stack")] }),
        shell("c", "wait-time-06 three", { pullRequests: [pr(67, "created"), pr(61, "stack"), pr(65, "stack")] }),
      ],
      { a: "lead", b: "a", c: "b" },
    );
    expect(labels(tree[0].branches)).toEqual(["PR stack #61", "No issue key"]);
    const g = child(tree, "frontend", "PR stack #61");
    expect(g.stack).toEqual({ id: "s61", total: 3, base: null });
    expect(g.threads.map((t) => [t.title, t.stack?.pos, t.children.length])).toEqual([
      ["wait-time-04 one", 1, 0],
      ["wait-time-05 two", 2, 0],
      ["wait-time-06 three", 3, 0],
    ]);
    expect(child(tree, "frontend", "No issue key").threads[0].children).toEqual([]);
  });

  test("T3 stack layers set the order; an agent-linked PR is the thread's own", () => {
    const stack = {
      base: "main",
      layers: [10, 11, 12, 13].map((number) => ({ number, state: "open" })),
    };
    const own = (n: number, source: string) =>
      [10, 11, 12, 13].map((x) => pr(x, x === n ? source : "stack", "open", stack));
    const tree = build([
      shell("b", "WEB-1 B", { pullRequests: own(12, "agent"), createdAt: "2026-11-12T07:00:00.000Z" }),
      shell("top", "WEB-2 top", { pullRequests: own(13, "created"), createdAt: "2026-11-12T06:00:00.000Z" }),
      shell("a1", "WEB-1 A1", { pullRequests: own(10, "agent"), createdAt: "2026-11-12T07:01:00.000Z" }),
      shell("a2", "WEB-1 A2", { pullRequests: own(11, "agent"), createdAt: "2026-11-12T07:02:00.000Z" }),
    ]);
    expect(labels(tree[0].branches)).toEqual(["WEB-1", "WEB-2"]);
    expect(child(tree, "frontend", "WEB-1").threads.map((t) => [t.title, t.stack?.pos])).toEqual([
      ["WEB-1 A1", 1],
      ["WEB-1 A2", 2],
      ["WEB-1 B", 3],
    ]);
    expect(child(tree, "frontend", "WEB-2").threads[0].stack).toEqual({ pos: 4, total: 4 });
  });

  test("a review thread with stack PRs stays in Reviews", () => {
    const tree = build([
      ...stacked(),
      shell("r", "Review #10 notes", { pullRequests: [pr(10, "stack"), pr(11, "stack")] }),
    ]);
    expect(titles(child(tree, "frontend", "Reviews", "No issue key").threads)).toEqual(["Review #10 notes"]);
  });

  test("node PRs leave out stack links; closed PRs are not stack members", () => {
    const tree = build([
      ...stacked(),
      shell("c", "WEB-5 closed", { pullRequests: [pr(20, "created", "merged"), pr(21, "stack", "merged")] }),
    ]);
    expect(child(tree, "frontend", "WEB-2").threads[0].prs.map((p) => p.n)).toEqual([11, 99]);
    const closed = child(tree, "frontend", "WEB-5").threads[0];
    expect(closed.stack).toBeNull();
    expect(closed.prs).toEqual([
      {
        n: 20,
        url: "https://github.com/org/repo/pull/20",
        state: "merged",
        draft: false,
        checks: null,
        review: null,
        conflicting: false,
        title: "x",
        additions: null,
        deletions: null,
        changedFiles: null,
        labels: [],
      },
    ]);
  });
});

describe("status", () => {
  const s = (over: Record<string, unknown>) => statusOf(decodeThread(shell("a", "x", over)) as Thread, NOW);
  const req = (kind: string, extra: object = {}) => ({
    id: "r",
    kind,
    createdAt: "2026-11-12T09:00:00.000Z",
    ...extra,
  });
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
    [
      "non-blocking request does not block",
      { status: "running", pendingRuntimeRequest: req("user_input", { blocking: false }) },
      "working",
    ],
    ["activity run status beats status", { status: "idle", activityRunStatus: "running" }, "working"],
    [
      "plan-ready beats your-turn",
      { status: "completed", interactionMode: "plan", hasActionableProposedPlan: true, ...DONE_AT },
      "plan-ready",
    ],
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
    expect(s({ pendingGuestMessageCount: 1, pendingRuntimeRequest: req("command", { blocking: false }) }).phrase).toBe(
      "Guest message",
    );
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
    const both = {
      status: "running",
      activityRunStartedAt: "2026-11-12T08:00:00.000Z",
      latestRunStartedAt: "2026-11-12T07:00:00.000Z",
    };
    expect(s(both).since).toBe("2026-11-12T08:00:00.000Z");
    expect(s({ ...both, activityRunStartedAt: null }).since).toBe("2026-11-12T07:00:00.000Z");
    expect(s({ status: "completed", ...DONE_AT }).since).toBe(DONE_AT.latestRunCompletedAt);
    expect(s({ status: "completed", interactionMode: "plan", hasPlan: true, ...DONE_AT }).since).toBe(
      DONE_AT.latestRunCompletedAt,
    );
    expect(s({ status: "completed", ...DONE_AT, lastVisitedAt: "2026-11-12T11:00:00.000Z" }).since).toBeNull();
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
      snapshot: {
        ...pr(7, "created").snapshot,
        isDraft: true,
        checksState: "failing",
        reviewDecision: "changes-requested",
        mergeability: "conflicting",
      },
    };
    const [t] = build(
      [
        shell("a", "SHOP-1 x", {
          settledAt: "2026-11-12T09:00:00.000Z",
          pendingRuntimeRequest: req("command", { blocking: false }),
          pullRequests: [marked, pr(8, "manual")],
        }),
      ],
      {},
      { settled: true },
    )[0].branches[0].threads;
    expect(t).toMatchObject({ key: "SHOP-1", settled: true, input: true, updatedAt: expect.any(String) });
    expect(t.prs).toEqual([
      {
        n: 7,
        url: "https://github.com/org/repo/pull/7",
        state: "open",
        draft: true,
        checks: "failing",
        review: "changes-requested",
        conflicting: true,
        title: "x",
        additions: null,
        deletions: null,
        changedFiles: null,
        labels: [],
      },
      {
        n: 8,
        url: "https://github.com/org/repo/pull/8",
        state: "open",
        draft: false,
        checks: null,
        review: null,
        conflicting: false,
        title: "x",
        additions: null,
        deletions: null,
        changedFiles: null,
        labels: [],
      },
    ]);
  });
});

describe("details", () => {
  const node = (raws: object[], id: string, spawners: Record<string, string> = {}) => {
    const walk = (ts: ThreadNode[]): ThreadNode[] => ts.flatMap((t) => [t, ...walk(t.children)]);
    const walkB = (b: Branch): ThreadNode[] => [...walk(b.threads), ...b.branches.flatMap(walkB)];
    return build(raws, spawners)
      .flatMap(walkB)
      .find((t) => t.id === id)!;
  };
  const EMPTY = {
    request: null,
    error: null,
    limitResetAt: null,
    autoResume: false,
    stopRequested: false,
    model: null,
    planMode: false,
    branch: null,
    worktreePath: null,
    launchedBy: null,
    origin: null,
    startedBy: null,
    createdAt: "2026-11-12T08:00:00.000Z",
    goal: null,
    tags: [],
    pinned: false,
  };

  test("every field decodes into the detail and the PR counts", () => {
    const full = shell("a", "SHOP-1 x", {
      createdAt: "2026-11-12T08:00:00.000Z",
      pendingRuntimeRequest: { id: "r", kind: "command", createdAt: "2026-11-12T11:57:00.000Z" },
      lastError: "boom",
      lastErrorClass: "provider",
      lastErrorCode: "e1",
      usageLimitResetAt: "2026-11-12T14:00:00.000Z",
      limitRecovery: { resetAt: "2026-11-12T15:00:00.000Z", autoResume: true },
      latestRunStopRequested: true,
      modelSelection: { model: "m1" },
      interactionMode: "plan",
      branch: "b",
      worktreePath: `${homedir()}/w`,
      createdBy: "agent",
      creationSource: "mcp",
      goal: { objective: "ship", status: "active" },
      tags: ["x", 3, "y"],
      pinnedAt: "2026-11-12T08:00:00.000Z",
      pullRequests: [
        {
          ...pr(1, "created"),
          snapshot: { ...pr(1, "created").snapshot, additions: 5, deletions: 2, changedFiles: 3 },
        },
      ],
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
    const t = node([shell("a", "SHOP-1 x", { pullRequests: [pr(1, "created")], createdAt: EMPTY.createdAt })], "a");
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
      expect(node([shell("sp", "Spawner"), shell("k", "SHOP-1 keyed")], "k", { k: "sp" }).detail.launchedBy).toEqual(
        spawner,
      );
    });
    test("set under No issue key when the spawner is in another project", () => {
      const raws = [shell("sp", "Spawner", { projectId: "p2" }), shell("k", "keyless")];
      expect(node(raws, "k", { k: "sp" }).detail.launchedBy).toEqual(spawner);
    });
    test("names a settled spawner when the thread nests under a grandparent", () => {
      const raws = [
        shell("gp", "Grand"),
        shell("sp", "Spawner", { settledAt: "2026-11-12T09:00:00.000Z" }),
        shell("k", "keyless"),
      ];
      expect(node(raws, "k", { k: "sp", sp: "gp" }).detail.launchedBy).toEqual(spawner);
    });
  });
});

describe("lineage tool results", () => {
  test("launch, create_threads, delegate_task and wrapped text", () => {
    expect(launchedIds('{"threadId":"mcp:1","projectId":"p"}')).toEqual(["mcp:1"]);
    expect(launchedIds('{"threads":[{"threadId":"thread:mcp:a"},{"threadId":"thread:mcp:b"}]}')).toEqual([
      "thread:mcp:a",
      "thread:mcp:b",
    ]);
    expect(launchedIds('{"taskId":"n","childThreadId":"thread:delegated-task:x"}')).toEqual([
      "thread:delegated-task:x",
    ]);
    expect(launchedIds('[{"type":"text","text":"{\\"threadId\\":\\"mcp:2\\"}"}]')).toEqual(["mcp:2"]);
    expect(launchedIds("not json")).toEqual([]);
  });
});

describe("labels", () => {
  const linked = {
    ...pr(7, "created"),
    repository: "org/repo",
    snapshot: { ...pr(7, "created").snapshot, updatedAt: "2026-11-12T10:00:00.000Z" },
  };
  const all = [
    { name: "Ready-For-Review", color: "0e8a16" },
    { name: "size:L", color: null },
  ];
  const prsOf = (over: Partial<BuildInput>, raw: Record<string, unknown> = {}, settled = false) =>
    build(
      [shell("a", "SHOP-1 x", { pullRequests: [linked], ...raw })],
      {},
      { labelsOf: () => all, settled, ...over },
    )[0].branches[0].threads[0].prs;

  test("decode keeps host, repository and the snapshot updatedAt", () => {
    const [p] = decodeThread(shell("a", "x", { pullRequests: [linked] }))!.prs;
    expect(p).toMatchObject({ host: "github.com", repository: "org/repo", updatedAt: "2026-11-12T10:00:00.000Z" });
    const bare = decodeThread(shell("a", "x", { pullRequests: [{ number: 1 }] }))!.prs[0];
    expect(bare).toMatchObject({ host: "", repository: "", updatedAt: "" });
  });

  test("a PR gets the watched labels, case-insensitive", () => {
    expect(prsOf({ labels: ["ready-for-review"] })[0].labels).toEqual([all[0]]);
  });

  test("no list gives no labels", () => {
    expect(prsOf({})[0].labels).toEqual([]);
    expect(prsOf({ labels: [] })[0].labels).toEqual([]);
  });

  test("a settled thread gives no labels", () => {
    const raw = { settledAt: "2026-11-12T09:00:00.000Z" };
    expect(prsOf({ labels: ["size:L"] }, raw, true)[0].labels).toEqual([]);
  });

  test("labelsOf may have no answer yet", () => {
    expect(prsOf({ labels: ["size:L"], labelsOf: () => undefined })[0].labels).toEqual([]);
  });
});

describe("linearOf", () => {
  const ISSUE = {
    project: { id: "p", name: "Checkout", url: "https://linear.app/w/project/checkout" },
    milestone: null,
  };
  const linearOf = (key: string) => (key === "SHOP-1" ? ISSUE : undefined);
  const nodeOf = (title: string, over: Partial<BuildInput> = {}) =>
    build([shell("a", title)], {}, over)[0].branches[0].threads[0];

  test("a node gets the Linear data of the first key in its title", () => {
    expect(nodeOf("SHOP-1 and SHOP-2 x", { linearOf }).linear).toEqual(ISSUE);
  });

  test("a node is null with no key, no answer, or no linearOf", () => {
    expect(nodeOf("no key here", { linearOf }).linear).toBeNull();
    expect(nodeOf("SHOP-2 x", { linearOf }).linear).toBeNull();
    expect(nodeOf("SHOP-1 x").linear).toBeNull();
  });
});

describe("buildLinearTree", () => {
  const proj = (id: string) => ({ id, name: `Proj ${id}`, url: `https://linear.app/w/project/${id}` });
  const ms = (id: string, targetDate: string | null) => ({ id, name: `Mile ${id}`, targetDate });
  const issue = (project: string | null, milestone: LinearIssue["milestone"] = null): LinearIssue => ({
    project: project ? proj(project) : null,
    milestone,
  });
  const buildL = (
    raws: object[],
    answers: Record<string, LinearIssue | null> = {},
    spawners: Record<string, string> = {},
    over: Partial<BuildInput> = {},
  ) => {
    const linearOf = (k: string) => answers[k] ?? undefined;
    return buildLinearTree(inputOf(raws, spawners, { linearOf, ...over }));
  };
  const ids = (b: Branch[]) => b.map((x) => x.id);

  test("a keyed thread goes to its project, then its milestone", () => {
    const tree = buildL([shell("a", "SHOP-1 x")], { "SHOP-1": issue("x", ms("m", "2026-12-04")) });
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe("Proj x");
    expect(tree[0].threads).toEqual([]);
    expect(tree[0].branches[0].label).toBe("Mile m");
    expect(titles(tree[0].branches[0].threads)).toEqual(["SHOP-1 x"]);
  });

  test("a project without a milestone goes to No milestone", () => {
    const tree = buildL([shell("a", "SHOP-1 x")], { "SHOP-1": issue("x") });
    expect(tree[0].branches.map((b) => [b.id, b.label])).toEqual([["lm:x:none", NO_MILESTONE]]);
  });

  test("a keyed thread with null linear or no project goes to No project", () => {
    const tree = buildL([shell("a", "SHOP-1 x"), shell("b", "SHOP-2 y"), shell("c", "SHOP-3 z")], {
      "SHOP-2": issue(null),
      "SHOP-3": issue("x"),
    });
    expect(ids(tree)).toEqual(["lp:x", "lf:none"]);
    expect(tree[1].label).toBe(NO_PROJECT);
    expect(titles(tree[1].threads)).toEqual(["SHOP-1 x", "SHOP-2 y"]);
  });

  test("Reviews keeps key subgroups, as the T3 tree does", () => {
    const tree = buildL([shell("a", "Review #4 SHOP-1"), shell("b", "Review #5 SHOP-1"), shell("c", "Review #6")], {
      "SHOP-1": issue("x"),
    });
    expect(tree[0].id).toBe("lf:reviews");
    expect(tree[0].label).toBe("Reviews");
    expect(tree[0].threads).toEqual([]);
    expect(tree[0].branches.map((b) => [b.id, b.label, b.threads.length])).toEqual([
      ["lf:reviews:SHOP-1", "SHOP-1", 2],
      [`lf:reviews:${NO_KEY}`, NO_KEY, 1],
    ]);
  });

  test("a keyless thread is a loose row, with no header label", () => {
    const tree = buildL([shell("a", "combobox")]);
    expect(tree.map((b) => [b.id, b.label])).toEqual([["lf:loose", ""]]);
    expect(titles(tree[0].threads)).toEqual(["combobox"]);
  });

  test("milestones sort by date, then undated, then No milestone", () => {
    const tree = buildL(
      [shell("a", "SHOP-1 x"), shell("b", "SHOP-2 x"), shell("c", "SHOP-3 x"), shell("d", "SHOP-4 x")],
      {
        "SHOP-1": issue("x"),
        "SHOP-2": issue("x", ms("late", "2027-01-15")),
        "SHOP-3": issue("x", ms("none", null)),
        "SHOP-4": issue("x", ms("soon", "2026-12-04")),
      },
    );
    expect(ids(tree[0].branches)).toEqual(["lm:soon", "lm:late", "lm:none", "lm:x:none"]);
  });

  test("milestones with the same date sort by oldest thread", () => {
    const tree = buildL([shell("a", "SHOP-1 x"), shell("b", "SHOP-2 x")], {
      "SHOP-1": issue("x", ms("second", "2026-12-04")),
      "SHOP-2": issue("x", ms("first", "2026-12-04")),
    });
    expect(ids(tree[0].branches)).toEqual(["lm:second", "lm:first"]);
  });

  test("projects sort by oldest thread, then Reviews, No project, loose rows; empty fallbacks go", () => {
    const raws = [
      shell("k", "no key"),
      shell("n", "SHOP-9 none"),
      shell("r", "Review #1"),
      shell("b", "SHOP-2 beta"),
      shell("a", "SHOP-1 alpha"),
    ];
    const answers = { "SHOP-1": issue("alpha"), "SHOP-2": issue("beta") };
    expect(ids(buildL(raws, answers))).toEqual(["lp:beta", "lp:alpha", "lf:reviews", "lf:none", "lf:loose"]);
    expect(ids(buildL([shell("a", "SHOP-1 alpha")], answers))).toEqual(["lp:alpha"]);
  });

  /** The thread titles of a branch: its key groups first, then its own threads. */
  const rows = (b: Branch) => [...b.branches.flatMap((g) => titles(g.threads)), ...titles(b.threads)];

  const stackRaws = () => [
    shell("s2", "WEB-2 two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
    shell("o", "WEB-9 other"),
    shell("s1", "WEB-1 one", { pullRequests: [pr(10, "created"), pr(11, "stack")] }),
  ];

  test("stack mates sit together in stack order inside a milestone", () => {
    const m = ms("m", "2026-12-04");
    const tree = buildL(stackRaws(), { "WEB-1": issue("x", m), "WEB-2": issue("x", m), "WEB-9": issue("x", m) });
    const [lm] = tree[0].branches;
    expect(lm.branches.map((g) => [g.id, g.label, g.stack, titles(g.threads)])).toEqual([
      ["lm:m:s10:WEB-1", "WEB-1", { id: "s10", total: 2, base: null }, ["WEB-1 one"]],
      ["lm:m:s10:WEB-2", "WEB-2", { id: "s10", total: 2, base: null }, ["WEB-2 two"]],
    ]);
    expect(titles(lm.threads)).toEqual(["WEB-9 other"]);
  });

  test("a stack mate with no Linear project sits in No project, in a key group with the rail", () => {
    const tree = buildL(stackRaws().slice(0, 1).concat(stackRaws().slice(2)), {
      "WEB-1": issue(null),
      "WEB-2": issue(null),
    });
    expect(ids(tree)).toEqual(["lf:none"]);
    expect(tree[0].branches.map((g) => [g.id, g.stack?.id, titles(g.threads)])).toEqual([
      ["lf:none:s10:WEB-1", "s10", ["WEB-1 one"]],
      ["lf:none:s10:WEB-2", "s10", ["WEB-2 two"]],
    ]);
    expect(tree[0].threads).toEqual([]);
  });

  test("a stack stays whole in the milestone of its lowest member", () => {
    const tree = buildL(stackRaws(), {
      "WEB-1": issue("x", ms("a", "2026-12-04")),
      "WEB-2": issue("y", ms("b", "2027-01-01")),
      "WEB-9": issue("x"),
    });
    expect(ids(tree)).toEqual(["lp:x"]);
    expect(tree[0].branches.map(rows)).toEqual([["WEB-1 one", "WEB-2 two"], ["WEB-9 other"]]);
  });

  test("a stack is placed by its lowest member that has a key", () => {
    const tree = buildL(
      [
        shell("s1", "one", { pullRequests: [pr(10, "created"), pr(11, "stack"), pr(12, "stack")] }),
        shell("s2", "WEB-2 two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
        shell("s3", "WEB-3 three", { pullRequests: [pr(12, "created"), pr(11, "stack")] }),
      ],
      { "WEB-2": issue(null), "WEB-3": issue("x") },
    );
    expect(ids(tree)).toEqual(["lf:none"]);
    expect(rows(tree[0])).toEqual(["one", "WEB-2 two", "WEB-3 three"]);
  });

  test("keyless stack threads sit together in the loose rows", () => {
    const tree = buildL([
      shell("s2", "two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
      shell("o", "other"),
      shell("s1", "one", { pullRequests: [pr(10, "created"), pr(11, "stack")] }),
    ]);
    expect(tree[0].branches.map((g) => [g.label, g.stack?.id, titles(g.threads)])).toEqual([
      ["PR stack #10", "s10", ["one", "two"]],
    ]);
    expect(titles(tree[0].threads)).toEqual(["other"]);
  });

  test("a keyless thread nests under a keyless spawner, not under a keyed one", () => {
    const raws = [shell("p", "parent"), shell("k", "SHOP-1 keyed"), shell("c", "child"), shell("d", "other child")];
    const tree = buildL(raws, { "SHOP-1": issue("x") }, { c: "p", d: "k" });
    const nokey = tree.find((b) => b.id === "lf:loose")!;
    expect(titles(nokey.threads)).toEqual(["parent", "other child"]);
    expect(titles(nokey.threads[0].children)).toEqual(["child"]);
    expect(nokey.threads[0].children[0].detail.launchedBy).toBeNull();
    expect(nokey.threads[1].detail.launchedBy?.title).toBe("SHOP-1 keyed");
  });

  test("a keyless thread does not nest with nest off", () => {
    const tree = buildL([shell("p", "parent"), shell("c", "child")], {}, { c: "p" }, { nest: false });
    expect(titles(tree[0].threads)).toEqual(["parent", "child"]);
    expect(tree[0].threads[1].detail.launchedBy?.title).toBe("parent");
  });

  test("ids, Linear meta on branches, and t3Project on nodes and children", () => {
    const m = ms("m", "2026-12-04");
    const tree = buildL(
      [
        shell("a", "SHOP-1 x", { projectId: "p2" }),
        shell("n", "SHOP-2 none"),
        shell("p", "parent"),
        shell("c", "child", { projectId: "p2" }),
        shell("r", "Review #1"),
      ],
      { "SHOP-1": issue("x", m), "SHOP-2": issue("x") },
      { c: "p" },
    );
    expect(ids(tree)).toEqual(["lp:x", "lf:reviews", "lf:loose"]);
    expect(ids(tree[0].branches)).toEqual(["lm:m", "lm:x:none"]);
    expect(tree.map(isFallback)).toEqual([false, true, true]);
    expect(tree[0].linear).toEqual({ url: "https://linear.app/w/project/x" });
    expect(tree[0].branches[0].linear).toEqual({ date: "2026-12-04" });
    expect(tree[0].branches[1].linear).toEqual({ date: null });
    expect(tree[1].linear).toEqual({});
    expect(tree[0].branches[0].threads[0].t3Project).toEqual({ id: "p2", label: "backend" });
    expect(tree[0].branches[1].threads[0].t3Project).toEqual({ id: "p1", label: "frontend" });
    const parent = tree[2].threads[0];
    expect(parent.children[0].t3Project).toEqual({ id: "p2", label: "backend" });
  });

  test("a keyless stack thread does not nest under its keyless spawner", () => {
    const tree = buildL(
      [
        shell("p", "parent"),
        shell("s1", "one", { pullRequests: [pr(10, "created"), pr(11, "stack")] }),
        shell("s2", "two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
      ],
      {},
      { s1: "p" },
    );
    expect(titles(tree[0].threads)).toEqual(["parent"]);
    expect(titles(tree[0].branches[0].threads)).toEqual(["one", "two"]);
    expect(tree[0].threads[0].children).toEqual([]);
    expect(tree[0].branches[0].threads[0].detail.launchedBy?.title).toBe("parent");
  });

  test("a keyless thread does not nest under a keyless review", () => {
    const tree = buildL([shell("r", "Review #1"), shell("c", "child")], {}, { c: "r" });
    expect(ids(tree)).toEqual(["lf:reviews", "lf:loose"]);
    expect(titles(tree[1].threads)).toEqual(["child"]);
    expect(tree[1].threads[0].detail.launchedBy?.title).toBe("Review #1");
  });

  test("nesting follows a nested spawner", () => {
    const tree = buildL([shell("a", "A"), shell("b", "B"), shell("c", "C")], {}, { b: "a", c: "b" });
    expect(titles(tree[0].threads)).toEqual(["A"]);
    expect(titles(tree[0].threads[0].children)).toEqual(["B"]);
    expect(titles(tree[0].threads[0].children[0].children)).toEqual(["C"]);
  });

  test("nested children sort by creation and a parent takes its oldest child's place", () => {
    const tree = buildL(
      [
        shell("late", "late child", { createdAt: "2026-11-12T10:00:00.000Z" }),
        shell("x", "x"),
        shell("early", "early child"),
        shell("y", "y"),
        shell("p", "parent"),
      ],
      {},
      { late: "p", early: "p" },
    );
    expect(titles(tree[0].threads)).toEqual(["x", "parent", "y"]);
    expect(titles(tree[0].threads[1].children)).toEqual(["early child", "late child"]);
  });

  test("stack mates take the place of their oldest member among unrelated threads", () => {
    const m = ms("m", "2026-12-04");
    const raws = [
      shell("o0", "WEB-8 o0"),
      shell("s2", "WEB-2 two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
      shell("o1", "WEB-9 o1"),
      shell("s1", "WEB-1 one", { pullRequests: [pr(10, "created"), pr(11, "stack")] }),
      shell("o2", "WEB-7 o2"),
    ];
    const answers = Object.fromEntries(["WEB-8", "WEB-2", "WEB-9", "WEB-1", "WEB-7"].map((k) => [k, issue("x", m)]));
    const tree = buildL(raws, answers);
    expect(rows(tree[0].branches[0])).toEqual(["WEB-1 one", "WEB-2 two", "WEB-8 o0", "WEB-9 o1", "WEB-7 o2"]);
    expect(titles(tree[0].branches[0].threads)).toEqual(["WEB-8 o0", "WEB-9 o1", "WEB-7 o2"]);
  });

  test("the T3 tree stays free of Linear fields", () => {
    const tree = build([shell("a", "SHOP-1 x")], {}, { linearOf: () => issue("x") });
    expect(tree[0].linear).toBeUndefined();
    expect(tree[0].branches[0].threads[0].t3Project).toBeUndefined();
  });
});

describe("suggested replies", () => {
  const DONE_AT = { status: "completed", latestRunCompletedAt: "2026-11-12T10:00:00.000Z" };
  const req = (kind: string) => ({ pendingRuntimeRequest: { id: "r", kind, createdAt: "2026-11-12T09:00:00.000Z" } });
  const MSG = "Tell me when PR #53 is merged.";
  const all = (b: Branch[]): ThreadNode[] => b.flatMap(allThreads);
  const repliesOf = (raws: object[], over: Partial<BuildInput> = {}, spawners: Record<string, string> = {}) => {
    const asked: string[][] = [];
    const tree = build(raws, spawners, {
      lastMessagesOf: (ids) => (asked.push(ids), new Map(ids.map((id) => [id, id === "none" ? null : MSG]))),
      ...over,
    });
    return { asked, by: Object.fromEntries(all(tree).map((t) => [t.id, t.suggestedReplies])) };
  };

  test("set on waiting threads from the last message, in one batch read", () => {
    const { asked, by } = repliesOf([
      shell("turn", "your turn", DONE_AT),
      shell("q", "question", req("user_input")),
      shell("plan", "plan", { status: "completed", interactionMode: "plan", hasActionableProposedPlan: true }),
      shell("fail", "failed", { status: "failed" }),
    ]);
    expect(by).toEqual({ turn: ["merged"], q: ["merged"], plan: ["merged"], fail: ["merged"] });
    expect(asked).toHaveLength(1);
  });

  test("absent when the thread does not wait, is snoozed, settled, waits for an Approval or has no message", () => {
    const { by } = repliesOf(
      [
        shell("work", "working", { status: "running" }),
        shell("done", "done", { status: "completed" }),
        shell("snz", "snoozed", { ...DONE_AT, ...req("user_input"), snoozedUntil: "2026-11-13T00:00:00.000Z" }),
        shell("set", "settled", { ...DONE_AT, settledAt: "2026-11-12T11:00:00.000Z" }),
        shell("appr", "approval", req("command")),
        shell("none", "no message", DONE_AT),
      ],
      { settled: true },
    );
    expect(by).toEqual({
      work: undefined,
      done: undefined,
      snz: undefined,
      set: undefined,
      appr: undefined,
      none: undefined,
    });
  });

  test("a nested subthread gets none; with nesting off it is top-level and gets them", () => {
    const raws = [shell("map", "Wayfinder map", DONE_AT), shell("mcp:t1", "ticket 001", DONE_AT)];
    const spawners = { "mcp:t1": "map" };
    expect(repliesOf(raws, {}, spawners).by).toEqual({ map: ["merged"], "mcp:t1": undefined });
    expect(repliesOf(raws, { nest: false }, spawners).by).toEqual({ map: ["merged"], "mcp:t1": ["merged"] });
  });

  test("no reader gives no field", () => {
    expect(all(build([shell("turn", "your turn", DONE_AT)]))[0].suggestedReplies).toBeUndefined();
  });
});

describe("runs", () => {
  const step = (id: string, title: string, runId: string, stepName = "implement", over: Record<string, unknown> = {}) =>
    shell(id, title, { workflowRun: { runId, workflow: "ship-issue", step: stepName }, ...over });
  const run = (runId: string, over: Partial<RunsSnapshot["runs"][number]> = {}): RunsSnapshot["runs"][number] => ({
    runId,
    workflow: "ship-issue",
    title: `Ship SHOP-1 ${runId}`,
    status: "running",
    detail: null,
    retired: false,
    resumesAt: null,
    updatedAt: "2026-11-12T11:00:00.000Z",
    parentRunId: null,
    parentStep: null,
    startedAt: "2026-11-12T08:30:00.000Z",
    ...over,
  });
  const snap = (runs: RunsSnapshot["runs"], questions: RunsSnapshot["questions"] = []): Partial<BuildInput> => ({
    runs: { runs, questions },
    origin: "http://t3",
  });
  const runsIn = (b: Branch[]) => b.flatMap((p) => allRuns(p));
  const BUSY = { status: "running" };

  test("the decoder reads workflowRun", () => {
    expect(decodeThread(step("a", "x", "r1", "plan"))!.workflowRun).toEqual({
      runId: "r1",
      workflow: "ship-issue",
      step: "plan",
    });
    expect(decodeThread(shell("b", "y"))!.workflowRun).toBeNull();
  });

  describe("placement", () => {
    test("a root run goes to the project of its oldest step thread, with the key of its title", () => {
      const tree = build(
        [
          step("late", "Implement", "r1", "implement", { projectId: "p2", createdAt: "2026-11-12T09:00:00.000Z" }),
          step("early", "Plan", "r1", "plan", { createdAt: "2026-11-12T08:00:00.000Z" }),
        ],
        {},
        snap([run("r1")]),
      );
      const [node] = child(tree, "frontend", "SHOP-1").threads;
      expect(node).toMatchObject({ id: "run:r1", href: "http://t3/workflows?run=r1", key: "SHOP-1" });
      expect(labels(tree)).toEqual(["frontend"]);
    });

    test("with no key in the title, the key of the first step thread", () => {
      const tree = build([step("a", "Plan SHOP-7 thing", "r1", "plan")], {}, snap([run("r1", { title: "Nightly" })]));
      expect(labels(tree[0].branches)).toEqual(["SHOP-7"]);
    });

    test("a Review run goes to Reviews; a keyless run to No issue key", () => {
      const tree = build(
        [step("a", "Review thread", "r1", "review"), step("b", "Work", "r2")],
        {},
        snap([run("r1", { title: "Review #12 SHOP-3 x" }), run("r2", { title: "Nightly" })]),
      );
      expect(child(tree, "frontend", "Reviews", "SHOP-3").threads[0].id).toBe("run:r1");
      expect(child(tree, "frontend", NO_KEY).threads[0].id).toBe("run:r2");
    });

    test("step threads never show as loose rows, in any tree", () => {
      const raws = [step("a", "Plan", "r1", "plan", { settledAt: "2026-11-12T09:00:00.000Z" }), shell("x", "SHOP-5 y")];
      for (const tree of [
        build(raws, {}, snap([run("r1")])),
        build(raws, {}, { ...snap([run("r1")]), settled: true }),
        buildLinearTree(inputOf(raws, {}, snap([run("r1")]))),
      ]) {
        const tops = tree.flatMap((p) => [...p.threads, ...p.branches.flatMap((b) => b.threads)]);
        expect(tops.filter((t) => !t.run).map((t) => t.id)).toEqual(["x"]);
        expect(runsIn(tree)).toHaveLength(1);
      }
    });

    test("the Linear tree places a run by its key, with no launch nesting", () => {
      const raws = [shell("spawner", "Wayfinder"), step("a", "Plan", "r1", "plan")];
      const tree = buildLinearTree(
        inputOf(raws, { "run:r1": "spawner", a: "spawner" }, snap([run("r1", { title: "Nightly" })])),
      );
      expect(tree.flatMap((p) => p.threads).map((t) => t.id)).toEqual(["spawner", "run:r1"]);
      expect(tree[0].threads[0].children).toEqual([]);
    });
  });

  describe("lifetime", () => {
    test("running, waiting and paused runs show", () => {
      for (const status of ["running", "waiting", "paused"])
        expect(runsIn(build([step("a", "Plan", "r1")], {}, snap([run("r1", { status })])))).toHaveLength(1);
    });

    test("a completed run shows only while a step thread is busy or waits", () => {
      const done = snap([run("r1", { status: "completed" })]);
      expect(runsIn(build([step("a", "Plan", "r1")], {}, done))).toHaveLength(0);
      expect(runsIn(build([step("a", "Plan", "r1", "plan", BUSY)], {}, done))).toHaveLength(1);
      const ask = { pendingRuntimeRequest: { kind: "user_input", createdAt: "2026-11-12T09:00:00.000Z" } };
      expect(runsIn(build([step("a", "Plan", "r1", "plan", ask)], {}, done))).toHaveLength(1);
    });

    test("a run with no step thread is absent", () => {
      expect(runsIn(build([shell("a", "SHOP-1 x")], {}, snap([run("r1")])))).toHaveLength(0);
    });

    test("a run not in the snapshot titles itself by its workflow and counts as ended", () => {
      expect(runsIn(build([step("a", "Plan", "r1")], {}, snap([])))).toHaveLength(0);
      const [node] = runsIn(build([step("a", "Plan", "r1", "plan", BUSY)], {}, snap([])));
      expect(node).toMatchObject({ title: "ship-issue", status: "done", phrase: "done · 1 step" });
    });
  });

  test("a step thread from another project stays under the run, with its project", () => {
    const tree = build(
      [step("a", "Plan", "r1", "plan"), step("b", "Implement", "r1", "implement", { projectId: "p2" })],
      {},
      snap([run("r1")]),
    );
    expect(labels(tree)).toEqual(["frontend"]);
    const [node] = runsIn(tree);
    expect(node.children.map((c) => [c.id, c.t3Project?.label])).toEqual([
      ["a", undefined],
      ["b", "backend"],
    ]);
  });

  test("a step thread in a PR stack stays under its run with its badge; its keyless mate goes to the stack group", () => {
    const tree = build(
      [
        step("s1", "Impl", "r1", "implement", {
          pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack")],
        }),
        shell("mate", "keyless", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
      ],
      {},
      snap([run("r1")]),
    );
    const [node] = runsIn(tree);
    expect(node.children[0]).toMatchObject({ id: "s1", stack: { pos: 1, total: 2 } });
    expect(child(tree, "frontend", "PR stack #10").threads.map((t) => t.id)).toEqual(["mate"]);
    expect(child(tree, "frontend", "PR stack #10").threads[0].stack).toEqual({ pos: 2, total: 2 });
  });

  describe("child runs", () => {
    test("a child run nests under its showing parent, in startedAt order with the step threads", () => {
      const tree = build(
        [step("a", "Plan", "r1", "plan"), step("c", "Review", "r2", "review"), step("b", "Impl", "r1", "implement")],
        {},
        snap([
          run("r1"),
          run("r2", { parentRunId: "r1", parentStep: "review", startedAt: "2026-11-12T08:00:30.000Z" }),
        ]),
      );
      const roots = child(tree, "frontend", "SHOP-1").threads;
      expect(roots.map((t) => t.id)).toEqual(["run:r1"]);
      expect(roots[0].children.map((c) => c.id)).toEqual(["run:r2", "a", "b"]);
      expect(roots[0].children[0]).toMatchObject({ step: "review", children: [{ id: "c" }] });
    });

    test("a child run with no step thread does not throw and does not show", () => {
      const tree = build(
        [step("a", "Plan", "r1", "plan")],
        {},
        snap([run("r1"), run("r2", { parentRunId: "r1", parentStep: "review" })]),
      );
      const [root] = runsIn(tree);
      expect(root.id).toBe("run:r1");
      expect(root.children.map((c) => c.id)).toEqual(["a"]);
    });

    test("a child run whose parent does not show is a root run", () => {
      const tree = build(
        [step("a", "Plan", "r1", "plan"), step("c", "Review", "r2", "review", BUSY)],
        {},
        snap([run("r1", { status: "completed" }), run("r2", { parentRunId: "r1", status: "completed" })]),
      );
      expect(runsIn(tree).map((n) => n.id)).toEqual(["run:r2"]);
    });
  });

  describe("steps and status", () => {
    test("lines follow the fetched steps; matched children first, the rest after", () => {
      const [node] = runsIn(
        build(
          [
            step("a", "Plan", "r1", "plan"),
            step("b", "Impl", "r1", "implement", BUSY),
            step("x", "Extra", "r1", "fix"),
          ],
          {},
          {
            ...snap([run("r1")]),
            stepsOf: () => [
              { name: "plan", status: "completed", threadId: "a" },
              { name: "implement", status: "running", threadId: "b" },
              { name: "open-pr", status: "failed", threadId: null },
            ],
          },
        ),
      );
      expect(node.run!.steps).toEqual([
        { name: "plan", state: "done", child: "a" },
        { name: "implement", state: "now", child: "b" },
        { name: "open-pr", state: "failed", child: null },
        { name: "fix", state: "done", child: "x" },
      ]);
      expect(node).toMatchObject({ status: "working", phrase: "running · open-pr", since: null });
    });

    test("with no steps fetched, the lines are the children in order", () => {
      const [node] = runsIn(
        build([step("a", "Plan", "r1", "plan"), step("b", "Impl", "r1", "implement", BUSY)], {}, snap([run("r1")])),
      );
      expect(node.run!.steps).toEqual([
        { name: "plan", state: "done", child: "a" },
        { name: "implement", state: "now", child: "b" },
      ]);
    });

    test("an open question, a pause and a finished run each give their status and phrase", () => {
      const q = {
        runId: "r1",
        name: "approve",
        title: "Approve?",
        choices: [],
        askedAt: "2026-11-12T10:00:00.000Z",
        thread: null,
      };
      const one = (r: RunsSnapshot["runs"][number], questions: RunsSnapshot["questions"] = []) =>
        runsIn(build([step("a", "Plan", "r1", "plan", BUSY)], {}, snap([r], questions)))[0];
      expect(one(run("r1", { status: "waiting" }), [q])).toMatchObject({
        status: "needs-input",
        phrase: "asks you · plan",
        since: "2026-11-12T10:00:00.000Z",
        run: { state: "asks" },
      });
      expect(one(run("r1", { status: "paused", detail: "boom" }))).toMatchObject({
        status: "needs-input",
        phrase: "paused · plan",
        since: "2026-11-12T11:00:00.000Z",
        run: { state: "paused", detail: "boom" },
      });
      expect(one(run("r1", { status: "completed" }))).toMatchObject({
        status: "done",
        phrase: "done · 1 step",
        run: { state: "done" },
      });
    });

    test("the run takes its updatedAt, and the row has no PRs or stack", () => {
      const [node] = runsIn(
        build([step("a", "Plan", "r1")], {}, snap([run("r1", { updatedAt: "2026-11-12T11:30:00.000Z" })])),
      );
      expect(node).toMatchObject({
        updatedAt: "2026-11-12T11:30:00.000Z",
        lastRun: "2026-11-12T11:30:00.000Z",
        prs: [],
        stack: null,
      });
    });
  });
});

describe("Map groups", () => {
  const SETTLED = { settledAt: "2026-11-12T09:00:00.000Z", settledOverride: "settled" };
  const keys = (m: Record<string, string>) => ({ mapKeyOf: (id: string) => m[id] ?? null });
  const mapped = (raws: object[], m: Record<string, string>, spawners: Record<string, string> = {}) =>
    build(raws, spawners, keys(m));
  const loose = (tree: Branch[]) => child(tree, "frontend", NO_KEY).threads;
  const hrefOf = (id: string) => `t3code://threads/env-1/${id}`;

  test("a member leaves its key group and nests under the map thread", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder: Search"), shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")],
      { t1: "/m/search", t2: "/m/search" },
      { t1: "chart", t2: "chart" },
    );
    expect(labels(tree[0].branches)).toEqual([NO_KEY]);
    const [head] = loose(tree);
    expect(head.map).toEqual({ name: "Search", header: false, href: null });
    expect(titles(head.children)).toEqual(["SHOP-1 a", "SHOP-2 b"]);
  });

  test("the map group shows only while a member is visible", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder"), shell("t1", "SHOP-1 a", SETTLED)],
      { t1: "/m/x" },
      { t1: "chart" },
    );
    expect(loose(tree)[0].map).toBeUndefined();
  });

  test("a non-member never nests under the map thread", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder"), shell("t1", "SHOP-1 a"), shell("free", "free thread")],
      { t1: "/m/x" },
      { t1: "chart", free: "chart" },
    );
    expect(titles(loose(tree))).toEqual(["Wayfinder", "free thread"]);
    expect(titles(loose(tree)[0].children)).toEqual(["SHOP-1 a"]);
  });

  test("a settled map thread gives a header at its place", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder: Search", SETTLED), shell("t1", "SHOP-1 a"), shell("t2", "b")],
      { t1: "/m/search", t2: "/m/search" },
      { t1: "chart", t2: "chart" },
    );
    const [header] = loose(tree);
    expect(header).toMatchObject({ id: "chart", map: { name: "Search", header: true, href: hrefOf("chart") } });
    expect(titles(header.children)).toEqual(["SHOP-1 a", "b"]);
  });

  test("a settled map thread places its header by the rules, under its visible spawner", () => {
    const tree = mapped(
      [shell("boss", "boss"), shell("chart", "Wayfinder", SETTLED), shell("t1", "a")],
      { t1: "/m/x" },
      { chart: "boss", t1: "chart" },
    );
    const [boss] = loose(tree);
    expect(boss.children.map((c) => c.id)).toEqual(["chart"]);
    expect(boss.children[0].map?.header).toBe(true);
  });

  test("a map with no map thread puts its header at the oldest member's place", () => {
    const tree = mapped([shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")], { t1: "/m/alpha-map", t2: "/m/alpha-map" });
    expect(labels(tree[0].branches)).toEqual(["SHOP-1"]);
    const [header] = child(tree, "frontend", "SHOP-1").threads;
    expect(header).toMatchObject({ id: "map:/m/alpha-map", map: { name: "Alpha map", header: true, href: null } });
    expect(titles(header.children)).toEqual(["SHOP-1 a", "SHOP-2 b"]);
  });

  test("a map thread of several maps heads one header per map, oldest map first", () => {
    const raws = [shell("chart", "Charting"), shell("y", "y"), shell("x", "x")];
    const tree = mapped(raws, { x: "/m/k", y: "/m/l" }, { x: "chart", y: "chart" });
    const [head] = loose(tree);
    expect(head.map).toMatchObject({ header: false });
    expect(head.children.map((c) => c.id)).toEqual(["map:/m/l", "map:/m/k"]);
    expect(head.children.map((c) => c.map?.name)).toEqual(["L", "K"]);
    expect(head.children.map((c) => c.map?.href)).toEqual([null, null].map(() => hrefOf("chart")));
  });

  test("a settled map thread of several maps gives one header per map", () => {
    const tree = mapped(
      [shell("chart", "Charting", SETTLED), shell("x", "x"), shell("y", "y")],
      { x: "/m/k", y: "/m/l" },
      { x: "chart", y: "chart" },
    );
    expect(loose(tree).map((t) => t.id)).toEqual(["map:/m/k", "map:/m/l"]);
  });

  test("members nest by spawner chain; a settled member is skipped", () => {
    const tree = mapped(
      [
        shell("chart", "Wayfinder"),
        shell("d", "dispatch"),
        shell("t2", "t2", SETTLED),
        shell("s", "start-issue"),
        shell("t3", "t3"),
      ],
      { d: "/m/x", t2: "/m/x", t3: "/m/x" },
      { d: "chart", s: "d", t2: "d", t3: "t2" },
    );
    const [head] = loose(tree);
    expect(titles(head.children)).toEqual(["dispatch"]);
    expect(titles(head.children[0].children)).toEqual(["start-issue", "t3"]);
  });

  test("keyless stack mates join the group with a rail; a keyed non-member stays", () => {
    const stack = (own: number) => [
      pr(own, "created"),
      ...[10, 11, 12].filter((n) => n !== own).map((n) => pr(n, "stack")),
    ];
    const tree = mapped(
      [
        shell("chart", "Wayfinder"),
        shell("other", "WEB-9 other", { pullRequests: stack(12) }),
        shell("mate", "mate", { pullRequests: stack(11) }),
        shell("m", "SHOP-1 member", { pullRequests: stack(10) }),
      ],
      { m: "/m/x" },
      { m: "chart" },
    );
    const [head] = loose(tree);
    expect(titles(head.children)).toEqual(["SHOP-1 member", "mate"]);
    expect(head.children.map((c) => c.rail)).toEqual([
      { id: "s10", total: 3, base: null },
      { id: "s10", total: 3, base: null },
    ]);
    expect(labels(tree[0].branches)).toEqual(["WEB-9", NO_KEY]);
  });

  test("in a stack of two maps, each member stays and mates go to the lowest member", () => {
    const stack = (own: number) => [
      pr(own, "created"),
      ...[10, 11, 12].filter((n) => n !== own).map((n) => pr(n, "stack")),
    ];
    const tree = mapped(
      [
        shell("c1", "Map one"),
        shell("c2", "Map two"),
        shell("m1", "SHOP-1 a", { pullRequests: stack(10) }),
        shell("m2", "SHOP-2 b", { pullRequests: stack(11) }),
        shell("mate", "mate", { pullRequests: stack(12) }),
      ],
      { m1: "/m/one", m2: "/m/two" },
      { m1: "c1", m2: "c2" },
    );
    const [one, two] = loose(tree);
    expect(titles(one.children)).toEqual(["SHOP-1 a", "mate"]);
    expect(one.children.every((c) => c.rail)).toBe(true);
    expect(titles(two.children)).toEqual(["SHOP-2 b"]);
    expect(two.children[0].rail).toBeUndefined();
  });

  test("a sub-map nests in the parent group at its map thread", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder"), shell("t", "ticket"), shell("s", "sub ticket")],
      { t: "/m/p", s: "/m/s" },
      { t: "chart", s: "t" },
    );
    const [head] = loose(tree);
    const [t] = head.children;
    expect(t.map?.header).toBe(false);
    expect(titles(t.children)).toEqual(["sub ticket"]);
  });

  test("a member never nests under the head of another map", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder"), shell("s", "S ticket"), shell("k", "K ticket"), shell("x", "X loose")],
      { s: "/m/p", k: "/m/k" },
      { s: "chart", k: "s", x: "s" },
    );
    const [head] = loose(tree);
    expect(titles(head.children)).toEqual(["S ticket", "X loose"]);
    expect(titles(head.children[0].children)).toEqual(["K ticket"]);
  });

  test("a settled sub-map thread puts its header in the parent group", () => {
    const tree = mapped(
      [
        shell("chart", "Wayfinder"),
        shell("t", "ticket", SETTLED),
        shell("u", "other ticket"),
        shell("s", "sub ticket"),
      ],
      { t: "/m/p", u: "/m/p", s: "/m/s" },
      { t: "chart", u: "chart", s: "t" },
    );
    const [head] = loose(tree);
    expect(head.children.map((c) => [c.id, c.map?.header])).toEqual([
      ["t", true],
      ["u", undefined],
    ]);
    expect(titles(head.children[0].children)).toEqual(["sub ticket"]);
  });

  test("a member from another project gets its project", () => {
    const tree = mapped(
      [shell("chart", "Wayfinder"), shell("t1", "a", { projectId: "p2" }), shell("t2", "b")],
      { t1: "/m/x", t2: "/m/x" },
      { t1: "chart", t2: "chart" },
    );
    const [head] = loose(tree);
    expect(head.children.map((c) => c.t3Project)).toEqual([{ id: "p2", label: "backend" }, undefined]);
  });

  test("a step thread is never a member", () => {
    const raws = [
      shell("chart", "Wayfinder"),
      shell("t1", "a"),
      shell("st", "step", { workflowRun: { runId: "r1", workflow: "w", step: "go" }, status: "running" }),
    ];
    const run = {
      runId: "r1",
      workflow: "w",
      title: "Nightly",
      status: "running",
      detail: null,
      retired: false,
    } as const;
    const tree = buildTree(
      inputOf(
        raws,
        { t1: "chart", st: "chart" },
        {
          ...keys({ t1: "/m/x", st: "/m/x" }),
          runs: {
            runs: [
              {
                ...run,
                resumesAt: null,
                updatedAt: "2026-11-12T11:00:00.000Z",
                parentRunId: null,
                parentStep: null,
                startedAt: "2026-11-12T08:30:00.000Z",
              },
            ],
            questions: [],
          },
        },
      ),
    );
    expect(titles(loose(tree).filter((t) => t.map)[0].children)).toEqual(["a"]);
    expect(allRuns(tree[0])).toHaveLength(1);
  });

  describe("Linear tree", () => {
    const answers: Record<string, LinearIssue> = {
      "SHOP-1": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
      "SHOP-2": { project: { id: "y", name: "Proj y", url: "u" }, milestone: null },
    };
    const buildL = (raws: object[], m: Record<string, string>, spawners: Record<string, string> = {}) =>
      buildLinearTree(inputOf(raws, spawners, { linearOf: (k) => answers[k], ...keys(m) }));

    test("the group follows the map thread; a member in another Linear project stays", () => {
      const tree = buildL(
        [shell("chart", "Wayfinder"), shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")],
        { t1: "/m/x", t2: "/m/x" },
        { t1: "chart", t2: "chart" },
      );
      expect(tree.map((b) => b.id)).toEqual(["lf:loose"]);
      const [head] = tree[0].threads;
      expect(titles(head.children)).toEqual(["SHOP-1 a", "SHOP-2 b"]);
      expect(head.children.map((c) => c.t3Project?.id)).toEqual(["p1", "p1"]);
    });

    test("a settled map thread puts the header at its place", () => {
      const tree = buildL(
        [shell("chart", "Wayfinder", SETTLED), shell("t1", "SHOP-1 a")],
        { t1: "/m/x" },
        { t1: "chart" },
      );
      expect(tree.map((b) => b.id)).toEqual(["lf:loose"]);
      expect(tree[0].threads[0]).toMatchObject({ id: "chart", map: { header: true } });
    });

    test("a map with no map thread puts the header at the oldest member's place", () => {
      const tree = buildL([shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")], { t1: "/m/x", t2: "/m/x" });
      expect(tree.map((b) => b.id)).toEqual(["lp:x"]);
      expect(tree[0].branches[0].threads[0]).toMatchObject({ id: "map:/m/x", map: { header: true } });
    });
  });

  describe("stack mates that spawned each other", () => {
    const stack = (own: number) => [
      pr(own, "created"),
      ...[10, 11, 12].filter((n) => n !== own).map((n) => pr(n, "stack")),
    ];
    const threads = () => [
      shell("chart", "Wayfinder"),
      shell("s3", "s3", { pullRequests: stack(12) }),
      shell("s1", "s1", { pullRequests: stack(10) }),
      shell("s2", "s2", { pullRequests: stack(11) }),
      shell("kid", "kid"),
    ];
    const spawners = { s1: "chart", s2: "s1", s3: "s2", kid: "s2" };
    const check = (tree: Branch[]) => {
      const [head] = loose(tree);
      expect(titles(head.children)).toEqual(["s1", "s2", "s3"]);
      expect(head.children.every((c) => c.rail)).toBe(true);
      expect(titles(head.children[1].children)).toEqual(["kid"]);
    };

    test("a native key: the mates sit together in stack order, not nested", () => {
      check(mapped(threads(), { s1: "/m/x", s2: "/m/x", s3: "/m/x" }, spawners));
    });

    test("a marked map thread: the mates sit together in stack order, not nested", () => {
      check(build(threads(), spawners, { ...keys({}), marked: new Set(["chart"]) }));
    });
  });

  describe("marked map threads", () => {
    const marked = (...ids: string[]) => ({ ...keys({}), marked: new Set(ids) });
    const plan = shell("plan", "Plan Interview Mode Work Lanes");

    test("the children of a marked thread group under it, with its title as the name", () => {
      const tree = build(
        [plan, shell("t4308", "TIB-4308 a"), shell("t4328", "TIB-4328 b"), shell("t4309", "TIB-4309 c")],
        { t4308: "plan", t4328: "plan", t4309: "t4308" },
        marked("plan"),
      );
      const [head] = loose(tree);
      expect(head.title).toBe("Plan Interview Mode Work Lanes");
      expect(head.map).toEqual({ name: "Plan Interview Mode Work Lanes", header: false, href: null });
      expect(head.detail.mapMarked).toBe(true);
      expect(titles(head.children)).toEqual(["TIB-4308 a", "TIB-4328 b"]);
      expect(titles(head.children[0].children)).toEqual(["TIB-4309 c"]);
    });

    test("an unmarked thread gets no group and no flag", () => {
      const tree = build([plan, shell("t1", "TIB-1 a")], { t1: "plan" }, marked());
      expect(loose(tree).every((t) => !t.map && !t.detail.mapMarked)).toBe(true);
    });

    test("a child with a real key gives a second Map header", () => {
      const tree = build(
        [plan, shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")],
        { t1: "plan", t2: "plan" },
        { mapKeyOf: (id) => (id === "t1" ? "/m/real" : null), marked: new Set(["plan"]) },
      );
      const [head] = loose(tree);
      expect(head.children.map((c) => c.map)).toEqual([
        { name: "Real", header: true, href: hrefOf("plan") },
        { name: "Plan Interview Mode Work Lanes", header: true, href: hrefOf("plan") },
      ]);
    });

    test("a step thread under a marked thread stays out", () => {
      const tree = build(
        [plan, shell("st", "step", { workflowRun: { runId: "r1", workflow: "w", step: "go" } })],
        { st: "plan" },
        marked("plan"),
      );
      expect(loose(tree).every((t) => !t.map)).toBe(true);
    });

    test("a marked member of a real map holds a nested thread: group", () => {
      const tree = build(
        [shell("chart", "Wayfinder"), shell("m", "Marked ticket"), shell("k", "SHOP-1 k")],
        { m: "chart", k: "m" },
        { mapKeyOf: (id) => (id === "m" ? "/m/real" : null), marked: new Set(["m"]) },
      );
      const [head] = loose(tree);
      expect(head.map?.name).toBe("Real");
      const [m] = head.children;
      expect(m.title).toBe("Marked ticket");
      expect(m.map?.name).toBe("Marked ticket");
      expect(titles(m.children)).toEqual(["SHOP-1 k"]);
    });
  });
});
