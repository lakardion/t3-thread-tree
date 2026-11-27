import { describe, expect, test } from "bun:test";

import {
  countHeader,
  emptyKind,
  favicon,
  hasCatchUpLine,
  holdNew,
  needsYou,
  needsYouTip,
  needsYouThreads,
  type Held,
  noMemory,
  type NotifyMemory,
  releaseHeld,
  nextTarget,
  notifyEvents,
  onlyNeedsYou,
  openNextQueue,
  remember,
  tabTitle,
  upNextList,
  waits,
  withoutSnoozed,
} from "../src/page/needs-you.ts";
import type { RunItem } from "../src/shared/runs.ts";
import type { Group, Conn, Status, ThreadNode, Tree } from "../src/shared/tree.ts";

const thread = (id: string, status: Status, children: ThreadNode[] = []): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  linear: null,
  status,
  phrase: status,
  since: null,
  raw: status,
  updatedAt: "2026-11-12T12:00:00.000Z",
  lastRun: null,
  settled: false,
  review: false,
  input: false,
  snoozedUntil: null,
  stack: null,
  prs: [],
  detail: {} as ThreadNode["detail"],
  children,
});
const branch = (id: string, threads: ThreadNode[], groups: Group[] = []): Group => ({
  id,
  label: id,
  kind: "key",
  groups,
  threads,
});
const ids = (ts: { id: string }[]) => ts.map((t) => t.id);
const base0 = { workflow: "flow", runTitle: "Run", href: "http://t3/x" };
const question = (id: string, since = "2026-11-12T10:00:00.000Z"): RunItem => ({
  ...base0,
  kind: "question",
  id: `q:${id}:ask`,
  runId: id,
  title: `Question ${id}`,
  line: `Question ${id}`,
  since,
  href: `http://t3/${id}`,
  name: "ask",
  choices: ["Yes", "No"],
  threadHref: null,
});
const paused = (id: string, since = "2026-11-12T10:00:00.000Z"): RunItem => ({
  ...base0,
  kind: "paused",
  id: `p:${id}`,
  runId: id,
  runTitle: `Run ${id}`,
  title: `Run ${id}`,
  line: "boom",
  since,
  href: `http://t3/${id}`,
  detail: "boom\nmore",
  retired: false,
});

describe("countHeader", () => {
  test("buckets the eleven statuses, nested threads included", () => {
    const tree = [
      branch("p", [
        thread("a", "needs-input"),
        thread("b", "working"),
        thread("c", "starting"),
        thread("d", "blocked"),
        thread("e", "plan-ready"),
        thread("f", "your-turn"),
        thread("g", "done"),
        thread("h", "failed"),
        thread("i", "snoozed", [thread("j", "interrupted")]),
        thread("k", "idle"),
      ]),
    ];
    expect(countHeader(tree)).toEqual({ needYou: 3, working: 3, yourTurn: 1, stopped: 2 });
  });

  test("an empty tree gives zeros", () => {
    expect(countHeader([])).toEqual({ needYou: 0, working: 0, yourTurn: 0, stopped: 0 });
  });
});

describe("hasCatchUpLine", () => {
  const catchUp = { state: "queued", pick: "claude" } as const;
  test("true for a waiting or failed thread with a Catch-up", () => {
    for (const s of ["needs-input", "plan-ready", "your-turn", "failed"] as const)
      expect(hasCatchUpLine({ status: s, catchUp })).toBe(true);
  });
  test("false for other statuses or no Catch-up", () => {
    expect(hasCatchUpLine({ status: "working", catchUp })).toBe(false);
    expect(hasCatchUpLine({ status: "done", catchUp })).toBe(false);
    expect(hasCatchUpLine({ status: "needs-input" })).toBe(false);
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
    expect(out[0].groups[0].id).toBe("g");
    expect(ids(out[0].groups[0].threads)).toEqual(["a"]);
  });

  test("does not change the input", () => {
    const tree = [branch("p", [thread("s", "idle", [thread("m", "your-turn"), thread("w", "working")])])];
    const copy = structuredClone(tree);
    onlyNeedsYou(tree);
    expect(tree).toEqual(copy);
  });
});

describe("withoutSnoozed", () => {
  test("drops a snoozed thread and keeps the others", () => {
    const out = withoutSnoozed([branch("p", [thread("a", "snoozed"), thread("b", "idle")])]);
    expect(ids(out[0].threads)).toEqual(["b"]);
  });

  test("keeps a snoozed parent with a kept child, and trims the other children", () => {
    const parent = thread("s", "snoozed", [thread("m", "working"), thread("z", "snoozed")]);
    const out = withoutSnoozed([branch("p", [parent])]);
    expect(ids(out[0].threads)).toEqual(["s"]);
    expect(ids(out[0].threads[0].children)).toEqual(["m"]);
  });

  test("drops a group and a project that hold only snoozed threads", () => {
    const tree = [branch("p1", [], [branch("g1", [thread("a", "snoozed")])]), branch("p2", [thread("b", "snoozed")])];
    expect(withoutSnoozed(tree)).toEqual([]);
  });

  test("keeps a thread with a pending request, which has status needs-input", () => {
    const out = withoutSnoozed([branch("p", [thread("a", "needs-input")])]);
    expect(ids(out[0].threads)).toEqual(["a"]);
  });
});

describe("emptyKind", () => {
  const live = [branch("p", [thread("a", "idle")])];
  const asleep = [branch("p", [thread("a", "snoozed")])];

  test("needs: Needs you is on and threads remain", () => {
    expect(emptyKind(live, true, true)).toBe("needs");
  });

  test("snoozed: all threads are snoozed and hidden, with or without Needs you", () => {
    expect(emptyKind(asleep, false, true)).toBe("snoozed");
    expect(emptyKind(asleep, false, false)).toBe("snoozed");
  });

  test("none: no threads at all", () => {
    expect(emptyKind([], true, false)).toBe("none");
    expect(emptyKind([], false, true)).toBe("none");
  });
});

describe("needsYouThreads", () => {
  test("keeps needs-input, plan-ready and your-turn, nested included, and drops the rest", () => {
    const tree = [
      branch("p", [
        thread("a", "needs-input", [thread("n", "plan-ready")]),
        thread("b", "your-turn"),
        thread("c", "working"),
      ]),
    ];
    expect(needsYouThreads(tree).map((t) => t.id)).toEqual(["a", "n", "b"]);
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
    expect(needsYouThreads(tree)).toHaveLength(countHeader(tree).needYou);
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
    linearKey: "ok",
    linear: null,
    settled: "",
    projects: [branch("p", threads)],
    runs: null,
    workflows: null,
    workflowScan: null,
    t3Origin: null,
  });
  const base = (...pairs: [string, Status][]): NotifyMemory => ({
    threads: new Map<string, Status>(pairs),
    runs: null,
  });

  test("the first live tree is the baseline, settled threads included", () => {
    const { events, next } = notifyEvents(
      noMemory,
      tree("up", [mk("a", "needs-input"), mk("b", "failed", { settled: true })]),
    );
    expect(events).toEqual([]);
    expect([...(next.threads ?? [])]).toEqual([
      ["a", "needs-input"],
      ["b", "failed"],
    ]);
  });

  test("a tree that is not up sends nothing and keeps the baseline", () => {
    const last = base(["a", "working"]);
    for (const conn of ["down", "connecting", "no-token", "unauthorized"] as const) {
      const r = notifyEvents(last, tree(conn, [mk("a", "needs-input")]));
      expect(r.events).toEqual([]);
      expect(r.next).toBe(last);
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
    expect(gone.next.threads?.get("a")).toBe("failed");
    expect(notifyEvents(gone.next, tree("up", [mk("a", "failed")])).events).toEqual([]);
  });

  describe("run items", () => {
    const withRuns = (runs: RunItem[] | null, threads: ThreadNode[] = []): Tree => ({ ...tree("up", threads), runs });

    test("the first runs snapshot is the baseline, not a burst of events", () => {
      const first = notifyEvents(noMemory, tree("up", [mk("a", "working")]));
      const loading = notifyEvents(first.next, withRuns(null, [mk("a", "working")]));
      expect(loading.events).toEqual([]);
      expect(loading.next.runs).toBeNull();
      const loaded = notifyEvents(loading.next, withRuns([question("q1"), paused("p1")], [mk("a", "working")]));
      expect(loaded.events).toEqual([]);
      expect(loaded.next.runs?.size).toBe(2);
    });

    test("a new run item sends one event, the same item again sends none", () => {
      const last = notifyEvents(noMemory, withRuns([question("q1")])).next;
      const r = notifyEvents(last, withRuns([question("q1"), paused("p1")]));
      expect(r.events).toEqual([
        { kind: "run", id: "p:p1", status: "paused-run", title: "Run p1", url: "http://t3/p1" },
      ]);
      expect(notifyEvents(r.next, withRuns([question("q1"), paused("p1")])).events).toEqual([]);
    });

    test("an item that leaves and returns with a new Wait notifies again", () => {
      const last = notifyEvents(noMemory, withRuns([paused("p1")])).next;
      const gone = notifyEvents(last, withRuns([]));
      const back = notifyEvents(gone.next, withRuns([{ ...paused("p1"), since: "2026-11-12T11:00:00.000Z" }]));
      expect(back.events).toHaveLength(1);
    });

    test("a question event carries the question title", () => {
      const last = notifyEvents(noMemory, withRuns([])).next;
      const [e] = notifyEvents(last, withRuns([question("q1")])).events;
      expect(e).toMatchObject({ kind: "run", status: "run-question", title: "Question q1" });
    });

    test("threads and run items together give one summary at three", () => {
      const last = notifyEvents(noMemory, withRuns([], [mk("a", "working")])).next;
      const r = notifyEvents(last, withRuns([question("q1"), paused("p1")], [mk("a", "failed")]));
      expect(r.events).toEqual([{ kind: "summary", count: 3 }]);
    });
  });
});

describe("waits", () => {
  test("true when a nested thread is in Needs you", () => {
    expect(waits(branch("g", [thread("a", "done", [thread("b", "plan-ready")])]))).toBe(true);
    expect(waits(branch("p", [], [branch("g", [thread("a", "needs-input")])]))).toBe(true);
    expect(waits(branch("g", [thread("a", "your-turn")]))).toBe(true);
  });
  test("false for other statuses and for settled threads", () => {
    expect(waits(branch("g", [thread("a", "working"), thread("b", "done")]))).toBe(false);
    expect(waits(branch("g", [{ ...thread("a", "needs-input"), settled: true }]))).toBe(false);
  });
});

describe("openNextQueue", () => {
  const w = (id: string, status: Status, since: string | null, extra: Partial<ThreadNode> = {}): ThreadNode => ({
    ...thread(id, status),
    since,
    ...extra,
  });
  test("orders by oldest since, no since last, ties in tree order", () => {
    const projects = [
      branch("p", [
        w("a", "your-turn", "2026-11-12T10:00:00.000Z"),
        w("b", "needs-input", null),
        w("c", "plan-ready", "2026-11-12T09:00:00.000Z"),
        w("d", "needs-input", "2026-11-12T10:00:00.000Z"),
      ]),
    ];
    expect(ids(openNextQueue(projects))).toEqual(["c", "a", "d", "b"]);
  });
  test("includes subthreads and leaves out settled and other statuses", () => {
    const projects = [
      branch("p", [
        w("a", "working", null, { children: [w("n", "needs-input", "2026-11-12T10:00:00.000Z")] }),
        w("s", "needs-input", "2026-11-12T09:00:00.000Z", { settled: true }),
        w("f", "failed", "2026-11-12T08:00:00.000Z"),
      ]),
    ];
    expect(ids(openNextQueue(projects))).toEqual(["n"]);
  });
  test("is empty for an empty tree", () => {
    expect(openNextQueue([])).toEqual([]);
  });
});

describe("nextTarget and remember", () => {
  const q = ["a", "b", "c"].map((id, i) => ({ ...thread(id, "needs-input"), since: `2026-11-12T0${i}:00:00.000Z` }));
  test("walks the queue, then starts again at the top", () => {
    let seen = new Set<string>();
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const t = nextTarget(q, seen)!;
      order.push(t.id);
      seen = remember(q, seen, t);
    }
    expect(order).toEqual(["a", "b", "c", "a"]);
    expect(seen.size).toBe(1);
  });
  test("a new since makes an opened thread a target again", () => {
    const seen = remember(q, new Set(), q[0]);
    expect(nextTarget(q, seen)?.id).toBe("b");
    expect(nextTarget([{ ...q[0], since: "2026-11-13T00:00:00.000Z" }, ...q.slice(1)], seen)?.id).toBe("a");
  });
  test("is null for an empty queue", () => {
    expect(nextTarget([], new Set())).toBeNull();
  });
});

describe("run items", () => {
  const runs = [paused("p1", "2026-11-12T09:00:00.000Z"), question("q1", "2026-11-12T11:00:00.000Z")];
  const th = { ...thread("a", "needs-input"), since: "2026-11-12T10:00:00.000Z" };

  test("count in the Needs-you count", () => {
    expect(countHeader([branch("p", [th])], runs).needYou).toBe(3);
    expect(countHeader([], runs).needYou).toBe(2);
  });

  test("needsYouThreads lists them with the run page and the Catch-up line", () => {
    const [p1, q1] = needsYouThreads([], runs);
    expect(p1).toEqual({
      id: "p:p1",
      title: "Run p1",
      environmentId: "",
      since: "2026-11-12T09:00:00.000Z",
      status: "paused-run",
      url: "http://t3/p1",
      catchUp: { state: "done", ask: "boom" },
    });
    expect(q1).toMatchObject({ status: "run-question", catchUp: { state: "done", ask: "Question q1" } });
  });

  test("the queue mixes them with threads by Wait", () => {
    expect(ids(openNextQueue([branch("p", [th])], runs))).toEqual(["p:p1", "a", "q:q1:ask"]);
  });

  test("the Up next rows name the workflow and have no Linear key", () => {
    const rows = upNextList([], openNextQueue([], runs), null, null).rows;
    expect(rows.map((r) => [r.status, r.phrase, r.project, r.key])).toEqual([
      ["paused-run", "Paused run", "flow", null],
      ["run-question", "Run question", "flow", null],
    ]);
  });

  test("the skip memory keys an item by id and since", () => {
    const queue = openNextQueue([], runs);
    const seen = remember(queue, new Set(), queue[0]);
    expect(nextTarget(queue, seen)?.id).toBe("q:q1:ask");
    const moved = [{ ...queue[0], since: "2026-11-13T00:00:00.000Z" }, queue[1]];
    expect(nextTarget(moved, seen)?.id).toBe("p:p1");
  });
});

describe("tabTitle", () => {
  test("plain for 0, counted otherwise", () => {
    expect(tabTitle(0)).toBe("Thread tree");
    expect(tabTitle(5)).toBe("(5) Thread tree");
  });
});

describe("favicon", () => {
  const svg = '<svg><path fill="#fff"/></svg>';
  const decode = (u: string) => decodeURIComponent(u.slice("data:image/svg+xml,".length));
  test("is an encoded SVG data URL with no raw #", () => {
    const u = favicon(svg, 0);
    expect(u.startsWith("data:image/svg+xml,")).toBe(true);
    expect(u.includes("#")).toBe(false);
  });
  test("is the plain icon for 0 and adds one dot otherwise", () => {
    expect(decode(favicon(svg, 0))).toBe(svg);
    const dotted = decode(favicon(svg, 3));
    expect(dotted.split("<circle").length - 1).toBe(1);
    expect(dotted.startsWith("<svg><path")).toBe(true);
  });
});

describe("needsYouTip", () => {
  const tip = (needYou: number, yourTurn: number) => needsYouTip({ needYou, working: 0, yourTurn, stopped: 0 });
  test("names the your-turn part of the count", () => {
    expect(tip(6, 5)).toBe("6 need you (5 your turn)");
    expect(tip(3, 3)).toBe("3 need you (3 your turn)");
    expect(tip(5, 0)).toBe("5 need you");
    expect(tip(0, 0)).toBe("");
  });
});

describe("upNextList", () => {
  const w = (id: string, status: Status, since: string, extra: Partial<ThreadNode> = {}): ThreadNode => ({
    ...thread(id, status),
    since,
    ...extra,
  });
  const linear = { workspace: "acme", teams: [] };
  const projects = [
    branch("one", [w("a", "needs-input", "2026-11-12T09:00:00.000Z", { key: "ONE-1" })]),
    branch("two", [
      w("p", "working", "2026-11-12T08:00:00.000Z", { children: [w("n", "your-turn", "2026-11-12T10:00:00.000Z")] }),
    ]),
  ];
  const queue = openNextQueue(projects);
  test("lists the queue in order with the project label of each thread, subthreads included", () => {
    const { rows } = upNextList(projects, queue, null, null);
    expect(rows.map((r) => [r.id, r.project, r.status])).toEqual([
      ["a", "one", "needs-input"],
      ["n", "two", "your-turn"],
    ]);
  });
  test("a Linear tree gives the T3 project of each thread", () => {
    const t3 = (id: string, label: string) => ({
      ...w(id, "needs-input", "2026-11-12T09:00:00.000Z"),
      t3Project: { id: label, label },
    });
    const tree = [branch("lp:x", [], [branch("lm:m", [t3("a", "frontend"), t3("b", "backend")])])];
    expect(upNextList(tree, openNextQueue(tree), null, null).rows.map((r) => r.project)).toEqual([
      "frontend",
      "backend",
    ]);
  });
  test("sets the Linear URL only with Linear and a key", () => {
    expect(upNextList(projects, queue, null, linear).rows.map((r) => [r.key, r.linearUrl])).toEqual([
      ["ONE-1", "https://linear.app/acme/issue/ONE-1"],
      [null, null],
    ]);
    expect(upNextList(projects, queue, null, null).rows[0].linearUrl).toBeNull();
  });
  test("gives the id of the target, or null with none", () => {
    expect(upNextList(projects, queue, queue[1], null).targetId).toBe("n");
    expect(upNextList(projects, queue, null, null).targetId).toBeNull();
  });
});

describe("Catch-up on the payloads", () => {
  const catchUp = {
    state: "done" as const,
    pick: "claude" as const,
    did: "d",
    ask: "a?",
    options: ["x"],
    doneLike: true,
  };
  const w = (over: Partial<ThreadNode> = {}): ThreadNode => ({
    ...thread("a", "needs-input"),
    href: "t3code://threads/e/a",
    since: "2026-11-12T09:00:00.000Z",
    ...over,
  });
  const line = { state: "done" as const, did: "d", ask: "a?", options: ["x"], question: undefined };

  test("each payload carries the Catch-up without pick and doneLike", () => {
    const tree = [branch("p", [w({ catchUp })])];
    expect(needsYouThreads(tree)[0].catchUp).toEqual(line);
    expect(upNextList(tree, openNextQueue(tree), null, null).rows[0].catchUp).toEqual(line);
    const live: Tree = {
      conn: "up",
      lastUpdate: null,
      linearKey: "ok",
      linear: null,
      settled: "",
      projects: tree,
      runs: null,
      workflows: null,
      workflowScan: null,
      t3Origin: null,
    };
    const [e] = notifyEvents({ threads: new Map([["a", "working"]]), runs: null }, live).events;
    expect(e.kind === "thread" && e.catchUp).toEqual(line);
  });
  test("a node with no Catch-up gives no key", () => {
    const tree = [branch("p", [w()])];
    expect("catchUp" in needsYouThreads(tree)[0]).toBe(false);
    expect("catchUp" in upNextList(tree, openNextQueue(tree), null, null).rows[0]).toBe(false);
  });
});

describe("releaseHeld", () => {
  const event = {
    kind: "thread" as const,
    threadId: "a",
    environmentId: "e",
    title: "a",
    status: "needs-input" as const,
  };
  const held = (): Held => new Map([["a", { event, at: 1000 }]]);
  const live = (t: ThreadNode[], conn: Conn = "up"): Tree => ({
    conn,
    lastUpdate: null,
    linearKey: "ok",
    linear: null,
    settled: "",
    projects: [branch("p", t)],
    runs: null,
    workflows: null,
    workflowScan: null,
    t3Origin: null,
  });
  const node = (over: Partial<ThreadNode> = {}) => ({ ...thread("a", "needs-input"), ...over });
  const cu = (state: "queued" | "running" | "done" | "failed") => ({ state, pick: "claude" as const, did: "d" });

  test("keeps the event until its Catch-up is done", () => {
    for (const state of ["queued", "running"] as const) {
      const r = releaseHeld(held(), live([node({ catchUp: cu(state) })]), 2000);
      expect(r.send).toEqual([]);
      expect(r.held.size).toBe(1);
    }
    expect(releaseHeld(held(), live([node()]), 2000).held.size).toBe(1);
  });
  test("sends the event with its Catch-up when done or failed", () => {
    for (const state of ["done", "failed"] as const) {
      const r = releaseHeld(held(), live([node({ catchUp: cu(state) })]), 2000);
      expect(r.send).toHaveLength(1);
      expect(r.send[0].catchUp?.state).toBe(state);
      expect(r.held.size).toBe(0);
    }
  });
  test("sends the event as it is at the hold limit", () => {
    const tree = live([node({ catchUp: cu("running") })]);
    expect(releaseHeld(held(), tree, 15_999).send).toEqual([]);
    const r = releaseHeld(held(), tree, 16_000);
    expect(r.send).toEqual([event]);
    expect(r.held.size).toBe(0);
  });
  test("drops the event when the status changes, the thread settles or leaves the tree", () => {
    for (const t of [[node({ status: "working" })], [node({ settled: true })], []]) {
      const r = releaseHeld(held(), live(t), 2000);
      expect(r.send).toEqual([]);
      expect(r.held.size).toBe(0);
    }
  });
  test("a tree that is not up keeps every event", () => {
    const r = releaseHeld(held(), live([], "down"), 99_000);
    expect(r.send).toEqual([]);
    expect(r.held.size).toBe(1);
  });
});

describe("run nodes", () => {
  const run = (id: string, children: ThreadNode[]): ThreadNode => ({
    ...thread(id, "needs-input", children),
    run: { runId: id, workflow: "w", state: "asks", steps: [], detail: null },
  });
  const projects = [branch("p", [run("r", [thread("s", "needs-input")])])];

  test("countHeader counts the step thread, not the run", () => {
    expect(countHeader(projects)).toEqual({ needYou: 1, working: 0, yourTurn: 0, stopped: 0 });
  });

  test("openNextQueue queues the step thread, not the run", () => {
    expect(ids(openNextQueue(projects))).toEqual(["s"]);
  });
});

describe("onlyNeedsYou and run nodes", () => {
  const run = (children: ThreadNode[]): ThreadNode => ({
    ...thread("r", "needs-input", children),
    run: { runId: "r", workflow: "w", state: "asks", steps: [], detail: null },
  });
  test("a run with no waiting step thread is dropped; with one it stays through that thread", () => {
    expect(onlyNeedsYou([branch("p", [run([thread("s", "working")])])])).toEqual([]);
    const kept = onlyNeedsYou([branch("p", [run([thread("s", "needs-input"), thread("w", "working")])])]);
    expect(ids(kept[0].threads[0].children)).toEqual(["s"]);
  });
});

describe("Map groups", () => {
  const map = { name: "m", header: false, href: null };
  const header = (id: string, children: ThreadNode[]): ThreadNode => ({
    ...thread(id, "done", children),
    map: { ...map, header: true },
  });
  const head = (id: string, status: Status, children: ThreadNode[]): ThreadNode => ({
    ...thread(id, status, children),
    map,
  });

  test("a header is not a thread in any count or queue", () => {
    const projects = [branch("p", [header("h", [thread("a", "needs-input"), thread("b", "working")])])];
    expect(countHeader(projects)).toEqual({ needYou: 1, working: 1, yourTurn: 0, stopped: 0 });
    expect(ids(openNextQueue(projects))).toEqual(["a"]);
    expect(waits(projects[0])).toBe(true);
  });

  test("onlyNeedsYou keeps a header through a waiting member and drops it with none", () => {
    const kept = onlyNeedsYou([branch("p", [header("h", [thread("a", "needs-input"), thread("b", "working")])])]);
    expect(ids(kept[0].threads)).toEqual(["h"]);
    expect(ids(kept[0].threads[0].children)).toEqual(["a"]);
    expect(onlyNeedsYou([branch("p", [header("h", [thread("b", "working")])])])).toEqual([]);
  });

  test("a map thread with no member left shows as a plain row", () => {
    const [p] = withoutSnoozed([branch("p", [head("m", "working", [thread("s", "snoozed")])])]);
    expect(p.threads[0].id).toBe("m");
    expect(p.threads[0].map).toBeUndefined();
    const [q] = withoutSnoozed([branch("p", [head("m", "working", [thread("s", "working")])])]);
    expect(q.threads[0].map).toEqual(map);
  });

  test("withoutSnoozed drops a header with no member left", () => {
    expect(withoutSnoozed([branch("p", [header("h", [thread("s", "snoozed")])])])).toEqual([]);
  });

  test("a snoozed map thread stays while a member stays", () => {
    const [p] = withoutSnoozed([branch("p", [head("m", "snoozed", [thread("s", "working")])])]);
    expect(p.threads[0].map).toEqual(map);
  });
});

describe("holdNew", () => {
  const ev = (id: string) => ({
    kind: "thread" as const,
    threadId: id,
    environmentId: "e",
    title: id,
    status: "needs-input" as const,
  });
  const run = { kind: "run" as const, id: "r", title: "r", status: "run-question" as const, url: "u" };
  const old = (): Held => new Map([["a", { event: ev("a"), at: 1 }]]);

  test("holds thread events and sends the others, with the Catch-up on or not known", () => {
    for (const on of [true, undefined]) {
      const r = holdNew([ev("b"), run], old(), on, 5);
      expect(r.send).toEqual([run]);
      expect([...r.held]).toEqual([
        ["a", { event: ev("a"), at: 1 }],
        ["b", { event: ev("b"), at: 5 }],
      ]);
    }
  });

  test("with the Catch-up off, sends every event and the held ones, and holds none", () => {
    const r = holdNew([ev("b"), run], old(), false, 5);
    expect(r.send).toEqual([ev("b"), run, ev("a")]);
    expect(r.held.size).toBe(0);
  });
});
