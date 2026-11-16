import { describe, expect, test } from "bun:test";

import {
  countAttention,
  needsYou,
  needsYouThreads,
  notifyEvents,
  onlyNeedsYou,
  type Statuses,
  waits,
} from "../src/page/attention.ts";
import type { Branch, Conn, Status, ThreadNode, Tree } from "../src/shared/tree.ts";

const thread = (id: string, status: Status, children: ThreadNode[] = []): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  status,
  phrase: status,
  since: null,
  raw: status,
  updatedAt: "2026-11-12T12:00:00.000Z",
  lastRun: null,
  settled: false,
  input: false,
  snoozedUntil: null,
  stack: null,
  prs: [],
  detail: {} as ThreadNode["detail"],
  children,
});
const branch = (id: string, threads: ThreadNode[], branches: Branch[] = []): Branch => ({
  id,
  label: id,
  branches,
  threads,
});
const ids = (ts: ThreadNode[]) => ts.map((t) => t.id);

describe("countAttention", () => {
  test("buckets the eleven statuses, nested threads included", () => {
    const tree = [
      branch("p", [
        thread("a", "needs-input"),
        thread("b", "working"),
        thread("c", "starting"),
        thread("d", "waiting"),
        thread("e", "plan-ready"),
        thread("f", "your-turn"),
        thread("g", "done"),
        thread("h", "failed"),
        thread("i", "snoozed", [thread("j", "interrupted")]),
        thread("k", "idle"),
      ]),
    ];
    expect(countAttention(tree)).toEqual({ needYou: 2, working: 3, yourTurn: 1, stopped: 2 });
  });

  test("an empty tree gives zeros", () => {
    expect(countAttention([])).toEqual({ needYou: 0, working: 0, yourTurn: 0, stopped: 0 });
  });
});

describe("needsYou", () => {
  test("true for the three statuses", () => {
    expect(needsYou("needs-input")).toBe(true);
    expect(needsYou("plan-ready")).toBe(true);
    expect(needsYou("your-turn")).toBe(true);
  });
  test("false for working and done", () => {
    expect(needsYou("working")).toBe(false);
    expect(needsYou("done")).toBe(false);
  });
});

describe("onlyNeedsYou", () => {
  test("drops a thread with no match", () => {
    const out = onlyNeedsYou([branch("p", [thread("a", "working"), thread("b", "your-turn")])]);
    expect(ids(out[0].threads)).toEqual(["b"]);
  });

  test("keeps a spawner when a nested thread matches, with only the matches", () => {
    const spawner = thread("s", "idle", [thread("m1", "working"), thread("m2", "your-turn")]);
    const out = onlyNeedsYou([branch("p", [spawner])]);
    expect(ids(out[0].threads)).toEqual(["s"]);
    expect(ids(out[0].threads[0].children)).toEqual(["m2"]);
  });

  test("keeps a matching thread and drops its children that do not match", () => {
    const out = onlyNeedsYou([branch("p", [thread("a", "needs-input", [thread("c", "working")])])]);
    expect(ids(out[0].threads)).toEqual(["a"]);
    expect(out[0].threads[0].children).toEqual([]);
  });

  test("drops a group with no thread left, and a project with no group left", () => {
    const tree = [branch("p1", [], [branch("g1", [thread("a", "working")])]), branch("p2", [thread("b", "done")])];
    expect(onlyNeedsYou(tree)).toEqual([]);
  });

  test("keeps the nested group and the project of a match", () => {
    const tree = [branch("p", [], [branch("g", [thread("a", "plan-ready")])])];
    const out = onlyNeedsYou(tree);
    expect(out[0].id).toBe("p");
    expect(out[0].branches[0].id).toBe("g");
    expect(ids(out[0].branches[0].threads)).toEqual(["a"]);
  });

  test("does not change the input", () => {
    const tree = [branch("p", [thread("s", "idle", [thread("m", "your-turn"), thread("w", "working")])])];
    const copy = structuredClone(tree);
    onlyNeedsYou(tree);
    expect(tree).toEqual(copy);
  });
});

describe("needsYouThreads", () => {
  test("keeps needs-input and plan-ready, nested included, and drops the rest", () => {
    const tree = [
      branch("p", [
        thread("a", "needs-input", [thread("n", "plan-ready")]),
        thread("b", "your-turn"),
        thread("c", "working"),
      ]),
    ];
    expect(needsYouThreads(tree).map((t) => t.id)).toEqual(["a", "n"]);
  });

  test("drops settled threads", () => {
    const tree = [branch("p", [{ ...thread("a", "needs-input"), settled: true }, thread("b", "needs-input")])];
    expect(needsYouThreads(tree).map((t) => t.id)).toEqual(["b"]);
  });

  test("decodes the environment id from the href", () => {
    const tree = [branch("p", [{ ...thread("a", "needs-input"), href: "t3code://threads/env%201/a", since: "s" }])];
    expect(needsYouThreads(tree)).toEqual([
      { id: "a", title: "a", environmentId: "env 1", since: "s", status: "needs-input" },
    ]);
  });

  test("has the length of the need-you count", () => {
    const tree = [branch("p", [thread("a", "needs-input"), thread("b", "plan-ready", [thread("c", "needs-input")])])];
    expect(needsYouThreads(tree)).toHaveLength(countAttention(tree).needYou);
  });
});

describe("notifyEvents", () => {
  const mk = (id: string, status: Status, over: Partial<ThreadNode> = {}): ThreadNode => ({
    ...thread(id, status),
    href: `t3code://threads/env%201/${id}`,
    ...over,
  });
  const tree = (conn: Conn, threads: ThreadNode[]): Tree => ({
    conn,
    lastUpdate: null,
    linear: null,
    projects: [branch("p", threads)],
  });
  const base = (...pairs: [string, Status][]): Statuses => new Map(pairs);

  test("the first live tree is the baseline, settled threads included", () => {
    const { events, nextStatuses } = notifyEvents(
      null,
      tree("up", [mk("a", "needs-input"), mk("b", "failed", { settled: true })]),
    );
    expect(events).toEqual([]);
    expect([...(nextStatuses ?? [])]).toEqual([
      ["a", "needs-input"],
      ["b", "failed"],
    ]);
  });

  test("a tree that is not up sends nothing and keeps the baseline", () => {
    const last = base(["a", "working"]);
    for (const conn of ["down", "connecting", "no-token", "unauthorized"] as const) {
      const r = notifyEvents(last, tree(conn, [mk("a", "needs-input")]));
      expect(r.events).toEqual([]);
      expect(r.nextStatuses).toBe(last);
    }
  });

  test("one event for each thread that enters, up to two", () => {
    const last = base(["a", "working"], ["b", "working"]);
    const { events } = notifyEvents(last, tree("up", [mk("a", "needs-input"), mk("b", "plan-ready")]));
    expect(events).toEqual([
      { kind: "thread", threadId: "a", environmentId: "env 1", title: "a", status: "needs-input" },
      { kind: "thread", threadId: "b", environmentId: "env 1", title: "b", status: "plan-ready" },
    ]);
  });

  test("three or more threads give one summary", () => {
    const last = base(["a", "working"], ["b", "working"], ["c", "working"]);
    const { events } = notifyEvents(
      last,
      tree("up", [mk("a", "needs-input"), mk("b", "failed"), mk("c", "plan-ready")]),
    );
    expect(events).toEqual([{ kind: "summary", count: 3 }]);
  });

  test("a new thread counts only in a trigger status", () => {
    const last = base(["a", "working"]);
    expect(notifyEvents(last, tree("up", [mk("a", "working"), mk("n", "failed")])).events).toHaveLength(1);
    expect(notifyEvents(last, tree("up", [mk("a", "working"), mk("n", "working")])).events).toEqual([]);
  });

  test("no event for an unchanged trigger status, your-turn or working", () => {
    const last = base(["a", "needs-input"], ["b", "working"], ["c", "working"]);
    const { events } = notifyEvents(
      last,
      tree("up", [mk("a", "needs-input"), mk("b", "your-turn"), mk("c", "working")]),
    );
    expect(events).toEqual([]);
  });

  test("a nested thread that enters counts", () => {
    const last = base(["a", "working"], ["c", "working"]);
    const { events } = notifyEvents(last, tree("up", [{ ...mk("a", "working"), children: [mk("c", "failed")] }]));
    expect(events.map((e) => (e.kind === "thread" ? e.threadId : ""))).toEqual(["c"]);
  });

  test("a settled thread that enters sends nothing", () => {
    const last = base(["a", "working"]);
    expect(notifyEvents(last, tree("up", [mk("a", "failed", { settled: true })])).events).toEqual([]);
  });

  test("an id that left the tree stays in the baseline", () => {
    const last = base(["a", "failed"]);
    const gone = notifyEvents(last, tree("up", []));
    expect(gone.nextStatuses?.get("a")).toBe("failed");
    expect(notifyEvents(gone.nextStatuses, tree("up", [mk("a", "failed")])).events).toEqual([]);
  });
});

describe("waits", () => {
  test("true when a nested thread needs input or has a plan ready", () => {
    expect(waits(branch("g", [thread("a", "done", [thread("b", "plan-ready")])]))).toBe(true);
    expect(waits(branch("p", [], [branch("g", [thread("a", "needs-input")])]))).toBe(true);
  });
  test("false for other statuses and for settled threads", () => {
    expect(waits(branch("g", [thread("a", "working"), thread("b", "your-turn")]))).toBe(false);
    expect(waits(branch("g", [{ ...thread("a", "needs-input"), settled: true }]))).toBe(false);
  });
});
