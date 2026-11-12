import { describe, expect, test } from "bun:test";
import { buildTree, issueKey, statusOf, type BuildInput } from "../src/server/build-tree.ts";
import { decodeItem, decodeThread, type Thread } from "../src/server/t3.ts";
import { launchedIds } from "../src/server/lineage.ts";
import type { Branch, ThreadNode } from "../src/shared/tree.ts";

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

const pr = (number: number, source: string, state = "open") => ({
  host: "github.com",
  repository: "org/repo",
  number,
  url: `https://github.com/org/repo/pull/${number}`,
  source,
  linkedAt: "2026-11-12T08:00:00.000Z",
  snapshot: { state, title: "x", headBranch: "h", baseBranch: "b", isDraft: false, updatedAt: null, syncedAt: "2026-11-12T08:00:00.000Z" },
  stack: null,
});

function build(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) {
  const threads = raws.map((r) => decodeThread(r)!);
  return buildTree({
    threads,
    projects: new Map([["p1", "frontend"], ["p2", "backend"]]),
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
    expect(issueKey("Review #15708 JED-4319")).toBe("JED-4319");
    expect(issueKey("ENG-6081 then ENG-6082")).toBe("ENG-6081");
    expect(issueKey("combobox work")).toBeNull();
    expect(issueKey("x-123 lower")).toBeNull();
  });
});

describe("visibility", () => {
  test("settled, archived, deleted, subagent and side chat threads are hidden", () => {
    const tree = build([
      shell("a", "JED-1 open"),
      shell("b", "JED-2 settled", { settledAt: "2026-11-12T09:00:00.000Z", settledOverride: "settled" }),
      shell("c", "JED-3 archived", { archivedAt: "2026-11-12T09:00:00.000Z" }),
      shell("d", "JED-4 deleted", { deletedAt: "2026-11-12T09:00:00.000Z" }),
      shell("e", "JED-5 subagent", { lineage: { parentThreadId: "a", relationshipToParent: "subagent", rootThreadId: "a" } }),
      shell("f", "JED-6 side", { lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: "f", sideChat: true } }),
    ]);
    expect(labels(tree[0]!.branches)).toEqual(["JED-1"]);
  });

  test("settled toggle shows settled threads, never archived ones", () => {
    const tree = build(
      [
        shell("a", "JED-1 open"),
        shell("b", "JED-2 settled", { settledAt: "2026-11-12T09:00:00.000Z" }),
        shell("c", "JED-3 archived", { archivedAt: "2026-11-12T09:00:00.000Z" }),
      ],
      {},
      { settled: true },
    );
    expect(labels(tree[0]!.branches).sort()).toEqual(["JED-1", "JED-2"]);
  });

  test("snoozed threads stay visible, with their wake time", () => {
    const until = "2026-11-13T09:00:00.000Z";
    const [t] = build([shell("a", "JED-1", { snoozedUntil: until, status: "completed" })])[0]!.branches[0]!.threads;
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

describe("placement", () => {
  test("Reviews group by key, keyed groups, No issue key last", () => {
    const tree = build([
      shell("r1", "Review #15708 JED-4319"),
      shell("r2", "Review #15709 without key"),
      shell("k", "JED-4319 build the thing"),
      shell("n", "loose thread"),
    ]);
    const p = tree[0]!;
    expect(labels(p.branches)).toEqual(["JED-4319", "Reviews", "No issue key"]);
    expect(labels(child(tree, "frontend", "Reviews").branches)).toEqual(["No issue key", "JED-4319"]);
    expect(titles(child(tree, "frontend", "Reviews", "JED-4319").threads)).toEqual(["Review #15708 JED-4319"]);
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
    const tree = build([shell("a", "JED-4312 parent"), shell("mcp:b", "JED-4313 child")], { "mcp:b": "a" });
    expect(labels(tree[0]!.branches).sort()).toEqual(["JED-4312", "JED-4313"]);
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
  /** ENG-1 holds #10, ENG-2 #11, ENG-3 #12; each thread lists the stack. */
  const stacked = () => [
    shell("s3", "ENG-3 top", { pullRequests: [pr(12, "created"), pr(10, "stack"), pr(11, "stack")] }),
    shell("other", "ENG-9 unrelated"),
    shell("s1", "ENG-1 base", { pullRequests: [pr(10, "created"), pr(11, "stack"), pr(12, "stack")] }),
    shell("s2", "ENG-2 middle", { pullRequests: [pr(11, "created"), pr(10, "stack"), pr(12, "stack"), pr(99, "manual")] }),
  ];

  test("badge position and total", () => {
    const tree = build(stacked());
    const pos = (k: string) => child(tree, "frontend", k).threads[0]!.stack;
    expect(pos("ENG-1")).toEqual({ pos: 1, total: 3 });
    expect(pos("ENG-2")).toEqual({ pos: 2, total: 3 });
    expect(pos("ENG-3")).toEqual({ pos: 3, total: 3 });
    expect(pos("ENG-9")).toBeNull();
  });

  test("stack-mate groups sit together in stack order, at the newest member's slot", () => {
    expect(labels(build(stacked())[0]!.branches)).toEqual(["ENG-1", "ENG-2", "ENG-3", "ENG-9"]);
  });

  test("node PRs leave out stack links; closed PRs are not stack members", () => {
    const tree = build([
      ...stacked(),
      shell("c", "ENG-5 closed", { pullRequests: [pr(20, "created", "merged"), pr(21, "stack", "merged")] }),
    ]);
    expect(child(tree, "frontend", "ENG-2").threads[0]!.prs.map((p) => p.n)).toEqual([11, 99]);
    const closed = child(tree, "frontend", "ENG-5").threads[0]!;
    expect(closed.stack).toBeNull();
    expect(closed.prs).toEqual([{ n: 20, url: "https://github.com/org/repo/pull/20", state: "merged" }]);
  });
});

describe("status", () => {
  const s = (over: Record<string, unknown>) => statusOf(decodeThread(shell("a", "x", over)) as Thread, NOW);
  test("mapping table", () => {
    for (const st of ["running", "queued", "preparing", "starting"]) expect(s({ status: st })).toBe("running");
    expect(s({ status: "completed" })).toBe("completed");
    for (const st of ["cancelled", "failed", "interrupted"]) expect(s({ status: st })).toBe("cancelled");
    expect(s({ status: "idle" })).toBe("idle");
    expect(s({ status: "something-new" })).toBe("idle");
  });
  test("pending request wins over status and snooze; snooze wins over status", () => {
    const req = { id: "r", kind: "user_input", createdAt: "2026-11-12T09:00:00.000Z" };
    expect(s({ status: "running", pendingRuntimeRequest: req })).toBe("needs-input");
    expect(s({ pendingRuntimeRequest: req, snoozedUntil: "2026-11-13T00:00:00.000Z" })).toBe("needs-input");
    expect(s({ status: "running", snoozedUntil: "2026-11-13T00:00:00.000Z" })).toBe("snoozed");
    expect(s({ status: "completed", snoozedUntil: "2026-11-11T00:00:00.000Z" })).toBe("completed");
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
