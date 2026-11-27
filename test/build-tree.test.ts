import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import { pinIdOf } from "../src/page/order.ts";
import { flatten, sortFlat } from "../src/page/view.ts";
import {
  buildLinearTree,
  buildTree,
  defaultRules,
  issueKey,
  statusOf,
  type BuildInput,
} from "../src/server/build-tree.ts";
import { prNode } from "../src/server/build-tree.ts";
import { launchedIds } from "../src/server/lineage.ts";
import { decodeItem, decodeListResult, decodeThread, type RunsSnapshot, type Thread } from "../src/server/t3.ts";
import {
  NO_MILESTONE,
  NO_PROJECT,
  allRuns,
  allThreads,
  type Group,
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

const pr = (
  number: number,
  source: string,
  state = "open",
  stack: object | null = null,
  syncedAt = "2026-11-12T08:00:00.000Z",
) => ({
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
    syncedAt,
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
    now: NOW,
    ...over,
  };
}

type Over = Partial<BuildInput>;

/** The default chain without Lineage group: launched threads stay where the other rules put them. */
const NO_LINEAGE = defaultRules().filter((r) => r !== "lineage");

function build(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) {
  return buildTree(inputOf(raws, spawners, over), defaultRules());
}

const labels = (b: Group[]) => b.map((x) => x.label);
const child = (b: Group[], ...path: string[]): Group =>
  path.reduce<Group>((cur, l) => cur.groups.find((x) => x.label === l)!, { groups: b } as Group);
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
    expect(labels(tree[0].groups)).toEqual(["SHOP-1"]);
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
    expect(labels(tree[0].groups).toSorted()).toEqual(["SHOP-1", "SHOP-2"]);
  });

  test("snoozed threads stay visible, with their wake time", () => {
    const until = "2026-11-13T09:00:00.000Z";
    const [t] = build([shell("a", "SHOP-1", { snoozedUntil: until, status: "completed" })])[0].groups[0].threads;
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
  test("Reviews groups by key at its creation slot; keyless reviews and loose threads sit directly in their parent", () => {
    const tree = build([
      shell("r1", "Review #15708 SHOP-4319"),
      shell("r2", "Review #15709 without key"),
      shell("k", "SHOP-4319 build the thing"),
      shell("n", "loose thread"),
    ]);
    const p = tree[0];
    expect(labels(p.groups)).toEqual(["Reviews", "SHOP-4319"]);
    expect(labels(child(tree, "frontend", "Reviews").groups)).toEqual(["SHOP-4319"]);
    expect(titles(child(tree, "frontend", "Reviews").threads)).toEqual(["Review #15709 without key"]);
    expect(titles(p.threads)).toEqual(["loose thread"]);
    expect(titles(child(tree, "frontend", "Reviews", "SHOP-4319").threads)).toEqual(["Review #15708 SHOP-4319"]);
  });

  test("a title that starts with Review # sets the review flag", () => {
    const tree = build([shell("r", "Review #1 SHOP-2"), shell("n", "Reviewing #1")]);
    const flags = Object.fromEntries(allThreads(child(tree, "frontend")).map((t) => [t.id, t.review]));
    expect(flags).toEqual({ r: true, n: false });
  });

  test("a review newer than a key group comes after it", () => {
    const tree = build([shell("k", "SHOP-1 first"), shell("r", "Review #1 SHOP-2")]);
    expect(labels(tree[0].groups)).toEqual(["SHOP-1", "Reviews"]);
  });

  test("a project with only loose threads shows", () => {
    const tree = build([shell("n", "loose thread")]);
    expect(tree[0].groups).toEqual([]);
    expect(titles(tree[0].threads)).toEqual(["loose thread"]);
  });

  test("a keyless launched thread sits directly in its project and names its spawner", () => {
    const tree = buildTree(
      inputOf([shell("map", "Wayfinder map"), shell("mcp:t1", "ticket 001")], { "mcp:t1": "map" }),
      NO_LINEAGE,
    );
    const ts = child(tree, "frontend").threads;
    expect(titles(ts)).toEqual(["Wayfinder map", "ticket 001"]);
    expect(ts[0].children).toEqual([]);
    expect(ts[1].detail.launchedBy).toEqual({ title: "Wayfinder map", href: "t3code://threads/env-1/map" });
  });

  test("a keyed thread nests under its visible spawner", () => {
    const tree = build([shell("a", "SHOP-4312 parent"), shell("mcp:b", "SHOP-4313 child")], { "mcp:b": "a" });
    expect(labels(tree[0].groups)).toEqual(["SHOP-4312"]);
    expect(titles(child(tree, "frontend", "SHOP-4312").threads[0].children)).toEqual(["SHOP-4313 child"]);
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
    expect(child(tree, "frontend").threads.length).toBe(2);
  });
});

describe("order", () => {
  test("projects, groups and threads in creation order, oldest first", () => {
    const tree = build([
      shell("b1", "backend thing", { projectId: "p2" }),
      shell("old", "old root"),
      shell("new", "new root"),
    ]);
    expect(labels(tree)).toEqual(["backend", "frontend"]);
    expect(titles(child(tree, "frontend").threads)).toEqual(["old root", "new root"]);
  });

  test("lastRun is the latest of activity run start, run start and run end, and null when all are null", () => {
    const run = (over: Record<string, unknown>) =>
      build([shell("a", "SHOP-1 a", over)])[0].groups[0].threads[0].lastRun;
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
    expect(labels(build([a, b])[0].groups)).toEqual(["SHOP-1", "SHOP-2"]);
    expect(labels(build([bump(a), b])[0].groups)).toEqual(["SHOP-1", "SHOP-2"]);
    expect(labels(build([a, bump(b)])[0].groups)).toEqual(["SHOP-1", "SHOP-2"]);
  });

  test("same createdAt: the thread id breaks the tie", () => {
    const at = { createdAt: "2026-11-12T08:00:00.000Z" };
    const tree = build([shell("b", "second", at), shell("a", "first", at)]);
    expect(titles(child(tree, "frontend").threads)).toEqual(["first", "second"]);
  });

  test("a new thread appends at the end of its group", () => {
    const tree = build([shell("5", "old root"), shell("0", "new root")]);
    expect(titles(child(tree, "frontend").threads)).toEqual(["old root", "new root"]);
  });

  test("a new group appends at the end of its section", () => {
    const tree = build([
      shell("r", "Review #1 without key"),
      shell("n", "loose thread"),
      shell("k1", "SHOP-1 first"),
      shell("k2", "SHOP-2 second"),
    ]);
    expect(labels(tree[0].groups)).toEqual(["Reviews", "SHOP-1", "SHOP-2"]);
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
    expect(labels(build(stacked())[0].groups)).toEqual(["WEB-1", "WEB-2", "WEB-3", "WEB-9"]);
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
    expect(labels(tree[0].groups)).toEqual(["WEB-1", "WEB-2", "WEB-3", "PR stack #10", "WEB-9"]);
    expect(child(tree, "frontend", "PR stack #10").stack).toEqual({ id: "s10", total: 3, base: "main" });
    expect(titles(child(tree, "frontend").threads)).toEqual(["plain thread"]);
    expect("stack" in child(tree, "frontend")).toBe(false);
  });

  test("launched stack threads sit together under their spawner instead of nesting in each other", () => {
    const tree = build(
      [
        shell("lead", "dispatch"),
        shell("a", "wait-time-04 one", { pullRequests: [pr(61, "created"), pr(65, "stack"), pr(67, "stack")] }),
        shell("b", "wait-time-05 two", { pullRequests: [pr(65, "created"), pr(61, "stack"), pr(67, "stack")] }),
        shell("c", "wait-time-06 three", { pullRequests: [pr(67, "created"), pr(61, "stack"), pr(65, "stack")] }),
      ],
      { a: "lead", b: "a", c: "b" },
    );
    expect(tree[0].groups).toEqual([]);
    const [head] = tree[0].threads;
    expect(head.children.map((t) => [t.title, t.stack?.pos, t.children.length, t.rail?.id])).toEqual([
      ["wait-time-04 one", 1, 0, "s61"],
      ["wait-time-05 two", 2, 0, "s61"],
      ["wait-time-06 three", 3, 0, "s61"],
    ]);
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
    expect(labels(tree[0].groups)).toEqual(["WEB-1", "WEB-2"]);
    expect(child(tree, "frontend", "WEB-1").threads.map((t) => [t.title, t.stack?.pos])).toEqual([
      ["WEB-1 A1", 1],
      ["WEB-1 A2", 2],
      ["WEB-1 B", 3],
    ]);
    expect(child(tree, "frontend", "WEB-2").threads[0].stack).toEqual({ pos: 4, total: 4 });
  });

  test("a merged stack PR keeps its slot with no number, in, out of or with no layers", () => {
    for (const keep of [true, false, null]) {
      const stack =
        keep === null
          ? null
          : {
              base: "main",
              layers: [
                ...(keep ? [{ number: 10, state: "merged" }] : []),
                { number: 11, state: "open" },
                { number: 12, state: "open" },
              ],
            };
      const own = (n: number) =>
        [10, 11, 12].map((x) => pr(x, x === n ? "created" : "stack", x === 10 ? "merged" : "open", stack));
      const tree = build([
        shell("b", "WEB-2 B", { pullRequests: own(11) }),
        shell("c", "WEB-3 C", { pullRequests: own(12) }),
        shell("a", "WEB-1 A", { pullRequests: own(10) }),
      ]);
      expect(tree[0].groups.map((b) => [b.label, b.threads[0].stack?.pos])).toEqual([
        ["WEB-1", null],
        ["WEB-2", 1],
        ["WEB-3", 2],
      ]);
    }
  });

  test("merged PRs in the T3 slots keep a stack with one open PR", () => {
    const stack = {
      base: "main",
      layers: [
        { number: 10, state: "merged" },
        { number: 11, state: "merged" },
        { number: 12, state: "open" },
      ],
    };
    const own = (n: number) =>
      [10, 11, 12].map((x) => pr(x, x === n ? "created" : "stack", x === 12 ? "open" : "merged", stack));
    const tree = build([
      shell("c", "WEB-3 C", { pullRequests: own(12) }),
      shell("b", "WEB-2 B", { pullRequests: own(11) }),
      shell("a", "WEB-1 A", { pullRequests: own(10) }),
    ]);
    expect(tree[0].groups.map((b) => [b.label, b.stack?.id, b.stack?.total, b.threads[0].stack?.pos])).toEqual([
      ["WEB-1", "s12", 1, null],
      ["WEB-2", "s12", 1, null],
      ["WEB-3", "s12", 1, 1],
    ]);
  });

  test("slots of a closed PR do not make a stack", () => {
    const stack = {
      base: "main",
      layers: [10, 11].map((number) => ({ number, state: "closed" })),
    };
    const tree = build([shell("a", "WEB-1 A", { pullRequests: [pr(10, "created", "closed", stack)] })]);
    expect(tree[0].groups.map((b) => b.stack)).toEqual([undefined]);
  });

  test("an all-merged stack stays whole in the T3 slot order", () => {
    const stack = {
      base: "main",
      layers: [31, 30, 32].map((number) => ({ number, state: "merged" })),
    };
    const own = (n: number) => [30, 31, 32].map((x) => pr(x, x === n ? "created" : "stack", "merged", stack));
    const tree = build([
      shell("a", "WEB-1 A", { pullRequests: own(30) }),
      shell("b", "WEB-2 B", { pullRequests: own(31) }),
      shell("c", "WEB-3 C", { pullRequests: own(32) }),
    ]);
    expect(tree[0].groups.map((b) => [b.label, b.stack?.id, b.stack?.total, b.threads[0].stack?.pos])).toEqual([
      ["WEB-2", "s31", 0, null],
      ["WEB-1", "s31", 0, null],
      ["WEB-3", "s31", 0, null],
    ]);
  });

  test("the most recently synced stack layers win, whatever the thread order", () => {
    const layers = (ns: number[]) => ({ base: "main", layers: ns.map((number) => ({ number, state: "open" })) });
    const copy = (n: number, ns: number[], at: string) =>
      [10, 11, 12].map((x) => pr(x, x === n ? "agent" : "stack", "open", layers(ns), at));
    const stale = shell("a", "WEB-1 A", { pullRequests: copy(10, [10, 11, 12], "2026-11-12T08:00:00.000Z") });
    const fresh = shell("b", "WEB-1 B", { pullRequests: copy(11, [10, 12, 11], "2026-11-13T08:00:00.000Z") });
    for (const raws of [
      [stale, fresh],
      [fresh, stale],
    ]) {
      const tree = build(raws);
      const pos = (title: string) =>
        child(tree, "frontend", "WEB-1").threads.find((t) => t.title === title)?.stack?.pos;
      expect([pos("WEB-1 A"), pos("WEB-1 B")]).toEqual([1, 3]);
    }
  });

  test("a review thread with stack PRs stays in Reviews", () => {
    const tree = build([
      ...stacked(),
      shell("r", "Review #10 notes", { pullRequests: [pr(10, "stack"), pr(11, "stack")] }),
    ]);
    expect(titles(child(tree, "frontend", "Reviews").threads)).toEqual(["Review #10 notes"]);
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
        repository: "org/repo",
        n: 20,
        url: "https://github.com/org/repo/pull/20",
        state: "merged",
        draft: false,
        checks: null,
        review: null,
        conflicting: false,
        title: "x",
        head: "h",
        base: "b",
        stack: null,
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
    ["blocked", { status: "running", blockedOnThreadWait: true }, "blocked"],
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
    )[0].groups[0].threads;
    expect(t).toMatchObject({ key: "SHOP-1", settled: true, input: true, updatedAt: expect.any(String) });
    expect(t.prs).toEqual([
      {
        repository: "org/repo",
        n: 7,
        url: "https://github.com/org/repo/pull/7",
        state: "open",
        draft: true,
        checks: "failing",
        review: "changes-requested",
        conflicting: true,
        title: "x",
        head: "h",
        base: "b",
        stack: null,
        additions: null,
        deletions: null,
        changedFiles: null,
        labels: [],
      },
      {
        repository: "org/repo",
        n: 8,
        url: "https://github.com/org/repo/pull/8",
        state: "open",
        draft: false,
        checks: null,
        review: null,
        conflicting: false,
        title: "x",
        head: "h",
        base: "b",
        stack: null,
        additions: null,
        deletions: null,
        changedFiles: null,
        labels: [],
      },
    ]);
  });
});

describe("details", () => {
  const node = (raws: object[], id: string, spawners: Record<string, string> = {}, rules = defaultRules()) => {
    const walk = (ts: ThreadNode[]): ThreadNode[] => ts.flatMap((t) => [t, ...walk(t.children)]);
    const walkB = (b: Group): ThreadNode[] => [...walk(b.threads), ...b.groups.flatMap(walkB)];
    return buildTree(inputOf(raws, spawners), rules)
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
    test("null for a member that nests under its spawner", () => {
      expect(node([shell("sp", "Spawner"), shell("k", "SHOP-1 keyed")], "k", { k: "sp" }).detail.launchedBy).toBeNull();
    });
    test("set for a keyed thread when Lineage group is off", () => {
      const raws = [shell("sp", "Spawner"), shell("k", "SHOP-1 keyed")];
      expect(node(raws, "k", { k: "sp" }, NO_LINEAGE).detail.launchedBy).toEqual(spawner);
    });
    test("set on a loose thread when Lineage group is off and the spawner is in another project", () => {
      const raws = [shell("sp", "Spawner", { projectId: "p2" }), shell("k", "keyless")];
      expect(node(raws, "k", { k: "sp" }, NO_LINEAGE).detail.launchedBy).toEqual(spawner);
    });
    test("null when the spawner id is unknown", () => {
      const tree = buildTree(inputOf([shell("k", "keyless")], { k: "gone" }), NO_LINEAGE);
      expect(tree[0].threads[0].detail.launchedBy).toBeNull();
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
  const prsOf = (over: Over, raw: Record<string, unknown> = {}, settled = false) =>
    build(
      [shell("a", "SHOP-1 x", { pullRequests: [linked], ...raw })],
      {},
      { labelsOf: () => all, settled, ...over },
    )[0].groups[0].threads[0].prs;

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
  const nodeOf = (title: string, over: Partial<BuildInput> = {}) => {
    const [p] = build([shell("a", title)], {}, over);
    return [...p.groups.flatMap((g) => g.threads), ...p.threads][0];
  };

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
    return buildLinearTree(inputOf(raws, spawners, { linearOf, ...over }), defaultRules());
  };
  const ids = (b: Group[]) => b.map((x) => x.id);

  test("a keyed thread goes to its project, then its milestone", () => {
    const tree = buildL([shell("a", "SHOP-1 x")], { "SHOP-1": issue("x", ms("m", "2026-12-04")) });
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe("Proj x");
    expect(tree[0].threads).toEqual([]);
    expect(tree[0].groups[0].label).toBe("Mile m");
    expect(titles(tree[0].groups[0].threads)).toEqual(["SHOP-1 x"]);
  });

  test("a project without a milestone goes to No milestone", () => {
    const tree = buildL([shell("a", "SHOP-1 x")], { "SHOP-1": issue("x") });
    expect(tree[0].groups.map((b) => [b.id, b.label])).toEqual([["lm:x:none", NO_MILESTONE]]);
  });

  test("a keyed thread with null linear or no project goes to No project", () => {
    const tree = buildL([shell("a", "SHOP-1 x"), shell("b", "SHOP-2 y"), shell("c", "SHOP-3 z")], {
      "SHOP-2": issue(null),
      "SHOP-3": issue("x"),
    });
    expect(ids(tree)).toEqual(["lf:none", "lp:x"]);
    expect(tree[0].label).toBe(NO_PROJECT);
    expect(titles(tree[0].threads)).toEqual(["SHOP-1 x", "SHOP-2 y"]);
  });

  test("Reviews keeps key subgroups, as the T3 tree does", () => {
    const tree = buildL([shell("a", "Review #4 SHOP-1"), shell("b", "Review #5 SHOP-1"), shell("c", "Review #6")], {
      "SHOP-1": issue("x"),
    });
    expect(tree[0].id).toBe("lf:reviews");
    expect(tree[0].label).toBe("Reviews");
    expect(titles(tree[0].threads)).toEqual(["Review #6"]);
    expect(tree[0].groups.map((b) => [b.id, b.label, b.threads.length])).toEqual([["lf:reviews:SHOP-1", "SHOP-1", 2]]);
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
    expect(ids(tree[0].groups)).toEqual(["lm:soon", "lm:late", "lm:none", "lm:x:none"]);
  });

  test("milestones with the same date sort by oldest thread", () => {
    const tree = buildL([shell("a", "SHOP-1 x"), shell("b", "SHOP-2 x")], {
      "SHOP-1": issue("x", ms("second", "2026-12-04")),
      "SHOP-2": issue("x", ms("first", "2026-12-04")),
    });
    expect(ids(tree[0].groups)).toEqual(["lm:second", "lm:first"]);
  });

  test("projects, Reviews and No project sort together by oldest thread; loose rows come last; empty fallbacks go", () => {
    const raws = [
      shell("k", "no key"),
      shell("n", "SHOP-9 none"),
      shell("r", "Review #1"),
      shell("b", "SHOP-2 beta"),
      shell("a", "SHOP-1 alpha"),
    ];
    const answers = { "SHOP-1": issue("alpha"), "SHOP-2": issue("beta") };
    expect(ids(buildL(raws, answers))).toEqual(["lf:none", "lf:reviews", "lp:beta", "lp:alpha", "lf:loose"]);
    expect(ids(buildL([shell("a", "SHOP-1 alpha")], answers))).toEqual(["lp:alpha"]);
  });

  /** The thread titles of a branch: its key groups first, then its own threads. */
  const rows = (b: Group) => [...b.groups.flatMap((g) => titles(g.threads)), ...titles(b.threads)];

  const stackRaws = () => [
    shell("s2", "WEB-2 two", { pullRequests: [pr(11, "created"), pr(10, "stack")] }),
    shell("o", "WEB-9 other"),
    shell("s1", "WEB-1 one", { pullRequests: [pr(10, "created"), pr(11, "stack")] }),
  ];

  test("stack mates sit together in stack order inside a milestone", () => {
    const m = ms("m", "2026-12-04");
    const tree = buildL(stackRaws(), { "WEB-1": issue("x", m), "WEB-2": issue("x", m), "WEB-9": issue("x", m) });
    const [lm] = tree[0].groups;
    expect(lm.groups.map((g) => [g.id, g.label, g.stack, titles(g.threads)])).toEqual([
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
    expect(tree[0].groups.map((g) => [g.id, g.stack?.id, titles(g.threads)])).toEqual([
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
    expect(tree[0].groups.map(rows)).toEqual([["WEB-1 one", "WEB-2 two"], ["WEB-9 other"]]);
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
    expect(tree[0].groups.map((g) => [g.label, g.stack?.id, titles(g.threads)])).toEqual([
      ["PR stack #10", "s10", ["one", "two"]],
    ]);
    expect(titles(tree[0].threads)).toEqual(["other"]);
  });

  test("ids, Linear meta on groups, and t3Project on nodes and children", () => {
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
    );
    expect(ids(tree)).toEqual(["lp:x", "lf:reviews", "lf:loose"]);
    expect(ids(tree[0].groups)).toEqual(["lm:m", "lm:x:none"]);
    expect(tree.map((b) => b.kind)).toEqual(["linear-project", "review", "loose"]);
    expect(tree[0].linear).toEqual({ url: "https://linear.app/w/project/x" });
    expect(tree[0].groups[0].linear).toEqual({ date: "2026-12-04" });
    expect(tree[0].groups[1].linear).toEqual({ date: null });
    expect(tree[1].linear).toEqual({});
    expect(tree[0].groups[0].threads[0].t3Project).toEqual({ id: "p2", label: "backend" });
    expect(tree[0].groups[1].threads[0].t3Project).toEqual({ id: "p1", label: "frontend" });
    expect(tree[2].threads[1].t3Project).toEqual({ id: "p2", label: "backend" });
  });

  test("keyless stack threads of a group nest under its head", () => {
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
    expect(tree[0].groups).toEqual([]);
    expect(titles(tree[0].threads[0].children)).toEqual(["one", "two"]);
    expect(tree[0].threads[0].children[0].detail.launchedBy).toBeNull();
  });

  test("a keyless launched thread is loose and names its spawner", () => {
    const tree = buildLinearTree(inputOf([shell("p", "parent"), shell("c", "child")], { c: "p" }), NO_LINEAGE);
    expect(titles(tree[0].threads)).toEqual(["parent", "child"]);
    expect(tree[0].threads[0].children).toEqual([]);
    expect(tree[0].threads[1].detail.launchedBy?.title).toBe("parent");
  });

  test("a keyless thread nests under a keyless review", () => {
    const tree = buildL([shell("r", "Review #1"), shell("c", "child")], {}, { c: "r" });
    expect(ids(tree)).toEqual(["lf:reviews"]);
    expect(titles(tree[0].threads[0].children)).toEqual(["child"]);
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
    expect(rows(tree[0].groups[0])).toEqual(["WEB-1 one", "WEB-2 two", "WEB-8 o0", "WEB-9 o1", "WEB-7 o2"]);
    expect(titles(tree[0].groups[0].threads)).toEqual(["WEB-8 o0", "WEB-9 o1", "WEB-7 o2"]);
  });

  test("the T3 tree stays free of Linear fields", () => {
    const tree = build([shell("a", "SHOP-1 x")], {}, { linearOf: () => issue("x") });
    expect(tree[0].linear).toBeUndefined();
    expect(tree[0].groups[0].threads[0].t3Project).toBeUndefined();
  });
});

describe("suggested replies", () => {
  const DONE_AT = { status: "completed", latestRunCompletedAt: "2026-11-12T10:00:00.000Z" };
  const req = (kind: string) => ({ pendingRuntimeRequest: { id: "r", kind, createdAt: "2026-11-12T09:00:00.000Z" } });
  const MSG = "Tell me when PR #53 is merged.";
  const all = (b: Group[]): ThreadNode[] => b.flatMap(allThreads);
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

  test("a launched top-level thread gets its replies", () => {
    const raws = [shell("map", "Wayfinder map", DONE_AT), shell("mcp:t1", "ticket 001", DONE_AT)];
    const asked: string[][] = [];
    const tree = buildTree(
      inputOf(
        raws,
        { "mcp:t1": "map" },
        {
          lastMessagesOf: (ids) => (asked.push(ids), new Map(ids.map((id) => [id, MSG]))),
        },
      ),
      NO_LINEAGE,
    );
    expect(Object.fromEntries(all(tree).map((t) => [t.id, t.suggestedReplies]))).toEqual({
      map: ["merged"],
      "mcp:t1": ["merged"],
    });
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
  const runsIn = (b: Group[]) => b.flatMap((p) => allRuns(p));
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
      expect(labels(tree[0].groups)).toEqual(["SHOP-7"]);
    });

    test("a Review run goes to Reviews; a keyless run is loose in its project", () => {
      const tree = build(
        [step("a", "Review thread", "r1", "review"), step("b", "Work", "r2")],
        {},
        snap([run("r1", { title: "Review #12 SHOP-3 x" }), run("r2", { title: "Nightly" })]),
      );
      expect(child(tree, "frontend", "Reviews", "SHOP-3").threads[0].id).toBe("run:r1");
      expect(child(tree, "frontend").threads[0].id).toBe("run:r2");
    });

    test("step threads never show as loose rows, in any tree", () => {
      const raws = [step("a", "Plan", "r1", "plan", { settledAt: "2026-11-12T09:00:00.000Z" }), shell("x", "SHOP-5 y")];
      for (const tree of [
        build(raws, {}, snap([run("r1")])),
        build(raws, {}, { ...snap([run("r1")]), settled: true }),
        buildLinearTree(inputOf(raws, {}, snap([run("r1")])), defaultRules()),
      ]) {
        const tops = tree.flatMap((p) => [...p.threads, ...p.groups.flatMap((b) => b.threads)]);
        expect(tops.filter((t) => !t.run).map((t) => t.id)).toEqual(["x"]);
        expect(runsIn(tree)).toHaveLength(1);
      }
    });

    test("the Linear tree places a run by its key, with no launch nesting", () => {
      const raws = [shell("spawner", "Wayfinder"), step("a", "Plan", "r1", "plan")];
      const tree = buildLinearTree(
        inputOf(raws, { "run:r1": "spawner", a: "spawner" }, snap([run("r1", { title: "Nightly" })])),
        defaultRules(),
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

describe("Lineage groups", () => {
  const SETTLED = { settledAt: "2026-11-12T09:00:00.000Z", settledOverride: "settled" };
  const keys = (m: Record<string, string>) => ({ mapKeyOf: (id: string) => m[id] ?? null });
  const mapped = (raws: object[], m: Record<string, string>, spawners: Record<string, string> = {}) =>
    build(raws, spawners, keys(m));
  const loose = (tree: Group[]) => child(tree, "frontend").threads;
  const hrefOf = (id: string) => `t3code://threads/env-1/${id}`;
  const stack = (own: number) => [
    pr(own, "created"),
    ...[10, 11, 12].filter((n) => n !== own).map((n) => pr(n, "stack")),
  ];

  test("a keyless and a keyed launched thread both sit under the root", () => {
    const tree = build([shell("root", "root"), shell("a", "a"), shell("k", "SHOP-1 k")], { a: "root", k: "root" });
    expect(tree[0].groups).toEqual([]);
    const [head] = loose(tree);
    expect(titles(head.children)).toEqual(["a", "SHOP-1 k"]);
    expect(head.map).toEqual({ name: "root", header: false, href: null });
    expect(pinIdOf(head)).toBe("t:root");
  });

  test("a root with no visible member is a plain row", () => {
    const tree = mapped([shell("root", "root"), shell("a", "a", SETTLED)], { a: "/m/x", root: "/m/x" }, { a: "root" });
    expect(loose(tree)[0].map).toBeUndefined();
    expect(loose(tree)[0].children).toEqual([]);
  });

  test("members nest by spawner chain; a settled member is skipped", () => {
    const tree = build(
      [
        shell("root", "root"),
        shell("d", "dispatch"),
        shell("t2", "t2", SETTLED),
        shell("s", "start"),
        shell("t3", "t3"),
      ],
      { d: "root", s: "d", t2: "d", t3: "t2" },
    );
    const [head] = loose(tree);
    expect(titles(head.children)).toEqual(["dispatch"]);
    expect(titles(head.children[0].children)).toEqual(["start", "t3"]);
  });

  describe("Lineage header", () => {
    const raws = (...members: string[]) => [
      shell("root", "SHOP-1 root", SETTLED),
      ...members.map((id) => shell(id, id)),
    ];
    const spawners = { a: "root", b: "root" };

    test("a settled root gives a header with its id at the place of its key group", () => {
      const tree = build(raws("a", "b"), spawners);
      const [header] = child(tree, "frontend", "SHOP-1").threads;
      expect(header).toMatchObject({
        id: "root",
        prs: [],
        stack: null,
        lastRun: null,
        map: { name: "SHOP-1 root", header: true, href: hrefOf("root") },
      });
      expect(titles(header.children)).toEqual(["a", "b"]);
      expect(header.children.map((c) => c.detail.launchedBy)).toEqual([null, null]);
    });

    test("it shows also over one member, with the same id", () => {
      const tree = build(raws("a"), spawners);
      expect(child(tree, "frontend", "SHOP-1").threads.map((t) => t.id)).toEqual(["root"]);
    });

    test("an archived root is known by its table row", () => {
      const row = { title: "Old root", projectId: "p2", createdAt: "2026-11-12T07:00:00.000Z" };
      const tree = build([shell("a", "a")], { a: "gone" }, { rowOf: (id) => (id === "gone" ? row : null) });
      const [header] = child(tree, "backend").threads;
      expect(header).toMatchObject({ id: "gone", title: "Old root", map: { header: true } });
      expect(titles(header.children)).toEqual(["a"]);
    });

    test("an unknown spawner id makes the topmost known thread the root", () => {
      const tree = build([shell("a", "a"), shell("b", "b")], { b: "a", a: "gone" });
      const [head] = loose(tree);
      expect(head).toMatchObject({ id: "a", map: { header: false } });
      expect(titles(head.children)).toEqual(["b"]);
    });
  });

  describe("map look", () => {
    test("a root that is the map thread of one map takes the map", () => {
      const tree = mapped(
        [shell("chart", "Wayfinder: Search"), shell("t1", "SHOP-1 a"), shell("t2", "SHOP-2 b")],
        { t1: "/m/search", t2: "/m/search" },
        { t1: "chart", t2: "chart" },
      );
      expect(tree[0].groups).toEqual([]);
      const [head] = loose(tree);
      expect(head.map).toEqual({ name: "Search", header: false, href: null, key: "/m/search" });
      expect(pinIdOf(head)).toBe("map:/m/search");
      expect(titles(head.children)).toEqual(["SHOP-1 a", "SHOP-2 b"]);
    });

    test("a keyed root anchors its own label", () => {
      const tree = mapped([shell("r", "root"), shell("c", "c")], { r: "/m/own-map" }, { c: "r" });
      const [head] = loose(tree);
      expect(head.map).toEqual({ name: "Own map", header: false, href: null, key: "/m/own-map" });
      expect(titles(head.children)).toEqual(["c"]);
    });

    test("a program root gets no key and one Map header per map, oldest map first", () => {
      const raws = [shell("chart", "Charting"), shell("y", "y"), shell("x", "x"), shell("h", "helper")];
      const tree = mapped(raws, { x: "/m/k", y: "/m/l" }, { x: "chart", y: "chart", h: "chart" });
      const [head] = loose(tree);
      expect(head.map).toEqual({ name: "Charting", header: false, href: null });
      expect(pinIdOf(head)).toBe("t:chart");
      expect(head.children.map((c) => c.id)).toEqual(["map:/m/l", "map:/m/k", "h"]);
      expect(head.children.slice(0, 2).map((c) => [c.map?.key, c.map?.name, c.map?.href])).toEqual([
        ["/m/l", "L", hrefOf("chart")],
        ["/m/k", "K", hrefOf("chart")],
      ]);
      expect(titles(head.children[0].children)).toEqual(["y"]);
      expect(head.children[0].children[0].detail.launchedBy).toBeNull();
    });

    test("a settled program root gives a Lineage header over the Map headers", () => {
      const tree = mapped(
        [shell("chart", "Charting", SETTLED), shell("x", "x"), shell("y", "y")],
        { x: "/m/k", y: "/m/l" },
        { x: "chart", y: "chart" },
      );
      const [header] = loose(tree);
      expect(header).toMatchObject({ id: "chart", map: { header: true } });
      expect(header.map?.key).toBeUndefined();
      expect(header.children.map((c) => c.id)).toEqual(["map:/m/k", "map:/m/l"]);
    });

    test("a settled map thread inside a group gives a Map header with its id at its place", () => {
      const tree = mapped(
        [shell("root", "root"), shell("chart", "Wayfinder: Search", SETTLED), shell("t1", "a"), shell("t2", "b")],
        { t1: "/m/search", t2: "/m/search" },
        { chart: "root", t1: "chart", t2: "chart" },
      );
      const [head] = loose(tree);
      const [header] = head.children;
      expect(header).toMatchObject({ id: "chart", map: { name: "Search", header: true, href: hrefOf("chart") } });
      expect(titles(header.children)).toEqual(["a", "b"]);
    });

    test("a settled map thread in another project gives a Map header with its project", () => {
      const tree = mapped(
        [shell("root", "root"), shell("chart", "Wayfinder", { ...SETTLED, projectId: "p2" }), shell("t1", "a")],
        { t1: "/m/x" },
        { chart: "root", t1: "chart" },
      );
      const [header] = loose(tree)[0].children;
      expect(header).toMatchObject({ id: "chart", t3Project: { id: "p2", label: "backend" } });
    });

    test("a sub-map nests in the parent group at its map thread", () => {
      const tree = mapped(
        [shell("chart", "Wayfinder"), shell("t", "ticket"), shell("s", "sub ticket")],
        { t: "/m/p", s: "/m/s" },
        { t: "chart", s: "t" },
      );
      const [head] = loose(tree);
      const [t] = head.children;
      expect(t.map).toMatchObject({ header: false, key: "/m/s" });
      expect(titles(t.children)).toEqual(["sub ticket"]);
    });

    test("a settled sub-map thread puts its Map header in the parent group", () => {
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
  });

  describe("PR stack", () => {
    test("the rail carries the stack number", () => {
      const withNumber = (own: number) => [
        pr(own, "created", "open", { number: 42, base: "main" }),
        ...[10, 11].filter((n) => n !== own).map((n) => pr(n, "stack")),
      ];
      const tree = build(
        [
          shell("root", "root"),
          shell("a", "a", { pullRequests: withNumber(10) }),
          shell("b", "b", { pullRequests: withNumber(11) }),
        ],
        { a: "root", b: "root" },
      );
      expect(loose(tree)[0].children.map((c) => c.rail?.number)).toEqual([42, 42]);
    });

    test("a keyless stack mate with no spawner joins the group; a keyed non-member stays", () => {
      const tree = build(
        [
          shell("root", "root"),
          shell("other", "WEB-9 other", { pullRequests: stack(12) }),
          shell("mate", "mate", { pullRequests: stack(11) }),
          shell("m", "SHOP-1 member", { pullRequests: stack(10) }),
        ],
        { m: "root" },
      );
      const [head] = loose(tree);
      expect(titles(head.children)).toEqual(["SHOP-1 member", "mate"]);
      expect(head.children.map((c) => c.rail)).toEqual([
        { id: "s10", total: 3, base: null },
        { id: "s10", total: 3, base: null },
      ]);
      expect(labels(tree[0].groups)).toEqual(["WEB-9"]);
    });

    test("in a stack of two groups, each member stays and mates go to the lowest member", () => {
      const tree = build(
        [
          shell("c1", "Group one"),
          shell("c2", "Group two"),
          shell("m1", "SHOP-1 a", { pullRequests: stack(10) }),
          shell("m2", "SHOP-2 b", { pullRequests: stack(11) }),
          shell("mate", "mate", { pullRequests: stack(12) }),
        ],
        { m1: "c1", m2: "c2" },
      );
      const [one, two] = loose(tree);
      expect(titles(one.children)).toEqual(["SHOP-1 a", "mate"]);
      expect(one.children.every((c) => c.rail)).toBe(true);
      expect(titles(two.children)).toEqual(["SHOP-2 b"]);
      expect(two.children[0].rail).toBeUndefined();
    });

    test("mates that spawned each other sit together at the topmost mate, not nested", () => {
      const tree = build(
        [
          shell("root", "root"),
          shell("s3", "s3", { pullRequests: stack(12) }),
          shell("s1", "s1", { pullRequests: stack(10) }),
          shell("s2", "s2", { pullRequests: stack(11) }),
          shell("kid", "kid"),
        ],
        { s1: "root", s2: "s1", s3: "s2", kid: "s2" },
      );
      const [head] = loose(tree);
      expect(titles(head.children)).toEqual(["s1", "s2", "s3"]);
      expect(head.children.every((c) => c.rail)).toBe(true);
      expect(titles(head.children[1].children)).toEqual(["kid"]);
    });

    test("a root in the stack stays the head and its member mates nest under it", () => {
      const tree = build(
        [
          shell("root", "root", { pullRequests: stack(10) }),
          shell("s1", "s1", { pullRequests: stack(11) }),
          shell("s2", "s2", { pullRequests: stack(12) }),
        ],
        { s1: "root", s2: "s1" },
      );
      expect(labels(tree[0].groups)).toEqual(["PR stack #10"]);
      const [head] = child(tree, "frontend", "PR stack #10").threads;
      expect(head.id).toBe("root");
      expect(titles(head.children)).toEqual(["s1", "s2"]);
      expect(head.children.every((c) => c.rail)).toBe(true);
    });
  });

  test("a member from another project gets its project", () => {
    const tree = build([shell("root", "root"), shell("t1", "a", { projectId: "p2" }), shell("t2", "b")], {
      t1: "root",
      t2: "root",
    });
    const [head] = loose(tree);
    expect(head.children.map((c) => c.t3Project)).toEqual([{ id: "p2", label: "backend" }, undefined]);
  });

  test("with Lineage group off, no group shows and launchedBy is set", () => {
    const tree = buildTree(inputOf([shell("root", "root"), shell("a", "a")], { a: "root" }), NO_LINEAGE);
    const [root, a] = loose(tree);
    expect(root.map).toBeUndefined();
    expect(root.children).toEqual([]);
    expect(a.detail.launchedBy?.title).toBe("root");
  });

  test("a step thread is never a member", () => {
    const raws = [
      shell("root", "root"),
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
        { t1: "root", st: "root" },
        {
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
      defaultRules(),
    );
    expect(titles(loose(tree).filter((t) => t.map)[0].children)).toEqual(["a"]);
    expect(allRuns(tree[0])).toHaveLength(1);
  });

  describe("Linear tree", () => {
    const answers: Record<string, LinearIssue> = {
      "SHOP-1": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
      "SHOP-2": { project: { id: "y", name: "Proj y", url: "u" }, milestone: null },
    };
    const buildL = (raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) =>
      buildLinearTree(inputOf(raws, spawners, { linearOf: (k) => answers[k], ...over }), defaultRules());

    test("the group follows the root's key; a member in another Linear project stays", () => {
      const tree = buildL([shell("root", "SHOP-1 root"), shell("t2", "SHOP-2 b")], { t2: "root" });
      expect(tree.map((b) => b.id)).toEqual(["lp:x"]);
      const [head] = tree[0].groups[0].threads;
      expect(titles(head.children)).toEqual(["SHOP-2 b"]);
      expect(head.children[0].t3Project?.id).toBe("p1");
    });

    test("a settled root puts the header at the root's place", () => {
      const tree = buildL([shell("root", "SHOP-1 root", SETTLED), shell("t2", "SHOP-2 b")], { t2: "root" });
      expect(tree.map((b) => b.id)).toEqual(["lp:x"]);
      expect(tree[0].groups[0].threads[0]).toMatchObject({ id: "root", map: { header: true } });
    });

    test("a keyless root goes to the Linear project its members share", () => {
      const m = { id: "m1", name: "M1", targetDate: null };
      const shared: Record<string, LinearIssue> = {
        "SHOP-1": { project: { id: "x", name: "Proj x", url: "u" }, milestone: m },
        "SHOP-3": { project: { id: "x", name: "Proj x", url: "u" }, milestone: m },
      };
      const tree = buildLinearTree(
        inputOf(
          [shell("chart", "Wayfinder"), shell("t1", "SHOP-1 a"), shell("t3", "SHOP-3 c")],
          { t1: "chart", t3: "chart" },
          { linearOf: (k) => shared[k] },
        ),
        defaultRules(),
      );
      expect(tree.map((b) => b.id)).toEqual(["lp:x"]);
      expect(tree[0].groups.map((g) => g.id)).toEqual(["lm:m1"]);
      expect(titles(tree[0].groups[0].threads[0].children)).toEqual(["SHOP-1 a", "SHOP-3 c"]);
    });

    test("a keyless program root goes to the Linear project its members share", () => {
      const shared: Record<string, LinearIssue> = {
        "SHOP-1": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
        "SHOP-3": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
      };
      const tree = buildLinearTree(
        inputOf(
          [shell("chart", "Wayfinder"), shell("t1", "SHOP-1 a"), shell("t3", "SHOP-3 c")],
          { t1: "chart", t3: "chart" },
          { linearOf: (k) => shared[k], ...keys({ t1: "/m/x", t3: "/m/y" }) },
        ),
        defaultRules(),
      );
      expect(tree.map((b) => b.id)).toEqual(["lp:x"]);
      expect(tree[0].groups[0].threads[0].children.map((c) => c.id)).toEqual(["map:/m/x", "map:/m/y"]);
    });
  });
});

describe("PR branches and stack place", () => {
  const prOf = (over: Record<string, unknown>) => decodeThread(shell("a", "x", { pullRequests: [over] }))!.prs[0];

  test("decode reads the head and base branch", () => {
    expect(prOf(pr(1, "created"))).toMatchObject({ head: "h", base: "b" });
    expect(prOf({ number: 1 })).toMatchObject({ head: null, base: null });
  });

  const withStack = (own: number, number: number | null, layers: number[]) =>
    prNode(
      prOf({
        ...pr(own, "created"),
        stack: {
          base: "main",
          ...(number !== null && { number }),
          layers: layers.map((n) => ({ number: n, state: "open" })),
        },
      }),
      [],
    );

  test("prNode gives the place in the stack slots", () => {
    expect(withStack(12, 87, [11, 12, 13]).stack).toEqual({ number: 87, pos: 2, total: 3 });
  });

  test("prNode gives no stack when the PR is not in its slots or the stack has no number", () => {
    expect(withStack(14, 87, [11, 12, 13]).stack).toBeNull();
    expect(withStack(12, null, [11, 12, 13]).stack).toBeNull();
    expect(prNode(prOf(pr(1, "created")), []).stack).toBeNull();
  });
});

describe("decodeListResult", () => {
  const entry = {
    projectId: "p1",
    host: "github.com",
    repository: "org/repo",
    number: 5,
    title: "ABC-1 thing",
    url: "https://github.com/org/repo/pull/5",
    headBranch: "abc-1-thing",
    baseBranch: "main",
    state: "open",
    isDraft: true,
    mergeability: "conflicting",
    additions: 0,
    deletions: 0,
    checksState: "failing",
    reviewDecision: "approved",
    stack: { number: 9, position: 2, size: 3, base: "main" },
  };

  test("maps an entry to a row", () => {
    expect(decodeListResult({ entries: [entry], errors: [] })).toEqual({
      rows: [
        {
          n: 5,
          url: entry.url,
          state: "open",
          draft: true,
          checks: "failing",
          review: "approved",
          conflicting: true,
          title: "ABC-1 thing",
          head: "abc-1-thing",
          base: "main",
          stack: { number: 9, pos: 2, total: 3 },
          additions: null,
          deletions: null,
          changedFiles: null,
          labels: [],
          host: "github.com",
          repository: "org/repo",
          projectId: "p1",
        },
      ],
      error: null,
    });
  });

  test("an entry with no stack, an unknown check or no number is lenient or dropped", () => {
    const { rows } = decodeListResult({
      entries: [{ ...entry, stack: undefined, checksState: "weird" }, { title: "no number" }, "junk"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stack: null, checks: null });
  });

  test("errors join string and message items; none gives null", () => {
    expect(decodeListResult({ entries: [], errors: ["a", { message: "b" }, { x: 1 }] }).error).toBe("a; b");
    expect(decodeListResult({ entries: [], errors: [] }).error).toBeNull();
    expect(decodeListResult(null)).toEqual({ rows: [], error: null });
  });
});
