import { describe, expect, test } from "bun:test";

import type { MapGraphData } from "../src/shared/map-graph.ts";
import { buildPrGraph, focusOf, GY, NH, pileLift } from "../src/shared/pr-graph.ts";
import type { PrNode, ThreadNode } from "../src/shared/tree.ts";

const pr = (n: number, over: Partial<PrNode> = {}): PrNode => ({
  repository: "a/b",
  n,
  url: `u${n}`,
  state: "open",
  draft: false,
  checks: null,
  review: null,
  conflicting: false,
  title: null,
  head: `h${n}`,
  base: "main",
  stack: null,
  additions: null,
  deletions: null,
  changedFiles: null,
  labels: [],
  ...over,
});

const node = (id: string, over: Partial<ThreadNode> = {}, createdAt: string | null = null): ThreadNode =>
  ({
    id,
    href: `t3://${id}`,
    title: id,
    status: "idle",
    settled: false,
    prs: [],
    children: [],
    detail: { createdAt },
    ...over,
  }) as unknown as ThreadNode;

const head = (...children: ThreadNode[]) =>
  node("head", { map: { name: "m", header: false, href: null, key: "m" }, children });

const data = (over: Partial<MapGraphData> = {}): MapGraphData => ({
  at: "",
  lanes: null,
  stacks: null,
  settled: [],
  rows: [],
  mates: [],
  behind: {},
  errors: [],
  ...over,
});

const row = (n: number, over: Partial<PrNode> = {}, threadId: string | null = null) => ({
  ...pr(n, over),
  threadId,
  threadHref: threadId && `t3://${threadId}`,
});

const lane = (n: number, keys: string[]) => ({
  n,
  label: "",
  explicit: true,
  keys: keys.map((key) => ({ key, base: "main" })),
});

const id = (n: number) => `a/b#${n}`;

const byN = (g: ReturnType<typeof buildPrGraph>, n: number) => g.nodes.find((x) => x.n === n)!;

describe("PR set", () => {
  test("union of tree links, rows and mates", () => {
    const g = buildPrGraph(head(node("a", { prs: [pr(1)] })), data({ rows: [row(2)], mates: [row(3)] }));
    expect(g.nodes.map((n) => n.n).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test("a live tree link beats a row, a row beats a settled link, a settled link beats a mate", () => {
    const live = node("a", { prs: [pr(1, { title: "tree" })] });
    const settled = node("b", { settled: true, prs: [pr(2, { title: "settled" }), pr(3, { title: "settled" })] });
    const g = buildPrGraph(
      head(live, settled),
      data({
        rows: [row(1, { title: "row" }), row(2, { title: "row" })],
        mates: [row(3, { title: "mate" })],
      }),
    );
    expect(byN(g, 1).title).toBe("tree");
    expect(byN(g, 2).title).toBe("row");
    expect(byN(g, 3).title).toBe("settled");
  });

  test("a settled tree node loses to its row", () => {
    const g = buildPrGraph(
      head(node("a", { settled: true, prs: [pr(1, { title: "old" })] })),
      data({ rows: [row(1, { title: "new" })] }),
    );
    expect(byN(g, 1).title).toBe("new");
  });

  test("the oldest member gets the PR", () => {
    const g = buildPrGraph(
      head(node("young", { prs: [pr(1)] }, "2026-02-01"), node("old", { prs: [pr(1)] }, "2026-01-01")),
      null,
    );
    expect(byN(g, 1).thread?.id).toBe("old");
  });

  test("a PR of a data.settled member only", () => {
    const g = buildPrGraph(
      head(),
      data({ settled: [{ id: "s", title: "S", status: "done", createdAt: null, href: "t3://s", prs: [pr(1)] }] }),
    );
    expect(byN(g, 1).thread).toEqual({ id: "s", href: "t3://s", title: "S", status: "done", live: false });
  });

  test("the thread of a row comes from the group, else from its threadHref", () => {
    const g = buildPrGraph(
      head(node("a", { status: "working" as never })),
      data({ rows: [row(1, {}, "a"), row(2, {}, "x")] }),
    );
    expect(byN(g, 1).thread).toMatchObject({ id: "a", status: "working", live: true });
    expect(byN(g, 2).thread).toEqual({ id: "x", href: "t3://x", title: "", status: "", live: false });
    expect(buildPrGraph(head(), data({ rows: [row(3)] })).nodes[0].thread).toBeNull();
  });

  test("a mate is outside, also a mate thread in the tree", () => {
    const g = buildPrGraph(head(node("mate", { prs: [pr(2)] })), data({ rows: [row(1)], mates: [row(2), row(3)] }));
    expect(byN(g, 1).outside).toBe(false);
    expect(byN(g, 2).outside).toBe(true);
    expect(byN(g, 3).outside).toBe(true);
  });

  test("a member that heads a sub-map is kept, its children are not", () => {
    const sub = node("sub", {
      prs: [pr(1)],
      map: { name: "s", header: false, href: null },
      children: [node("inner", { prs: [pr(2)] })],
    });
    expect(buildPrGraph(head(sub), null).nodes.map((n) => n.n)).toEqual([1]);
  });

  test("a nested map header and a run node are skipped with their subtrees", () => {
    const header = node("h", {
      map: { name: "x", header: true, href: null },
      children: [node("in", { prs: [pr(1)] })],
    });
    const run = node("r", { run: {} as never, children: [node("step", { prs: [pr(2)] })] });
    expect(buildPrGraph(head(header, run, node("ok", { prs: [pr(3)] })), null).nodes.map((n) => n.n)).toEqual([3]);
  });

  test("a subthread at any depth is a member", () => {
    const g = buildPrGraph(head(node("a", { children: [node("b", { prs: [pr(1)] })] })), null);
    expect(byN(g, 1).thread?.id).toBe("b");
  });

  test("data null: live links only", () => {
    const g = buildPrGraph(
      head(
        node("live", { prs: [pr(1)] }),
        node("old", { settled: true, prs: [pr(2)] }),
        node("none", { settled: true }),
      ),
      null,
    );
    expect(g.nodes.map((n) => n.n)).toEqual([1]);
    expect(g.nodes[0]).toMatchObject({ lane: null, outside: false });
    expect(g.noPr).toEqual([]);
  });
});

describe("lanes and key", () => {
  test("lane L<n> by key, outside with no lane key when lanes exist", () => {
    const g = buildPrGraph(
      head(node("a", { prs: [pr(1, { head: "abc-1-x" }), pr(2, { head: "xyz-9" }), pr(3, { title: "Fix DEF-2" })] })),
      data({ lanes: [lane(1, ["ABC-1"]), lane(2, ["DEF-2"])] }),
    );
    expect([1, 2, 3].map((n) => byN(g, n).lane)).toEqual([1, null, 2]);
    expect([1, 2, 3].map((n) => byN(g, n).outside)).toEqual([false, true, false]);
  });

  test("no lanes: nobody is outside", () => {
    const g = buildPrGraph(head(node("a", { prs: [pr(1)] })), data());
    expect(g.nodes[0]).toMatchObject({ lane: null, outside: false });
  });

  test("key: head branch, else title, else branch, else #n", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { head: "abc-1-x", title: "DEF-2" }),
            pr(2, { head: "plain", title: "DEF-2 x" }),
            pr(3, { head: "plain", title: "none" }),
            pr(4, { head: null, title: null }),
          ],
        }),
      ),
      null,
    );
    expect([1, 2, 3, 4].map((n) => byN(g, n).key)).toEqual(["ABC-1", "DEF-2", "plain", "#4"]);
  });
});

describe("PR id", () => {
  const two = () =>
    buildPrGraph(
      head(
        node("a", { prs: [pr(1, { head: "feat" })] }),
        node("b", { prs: [pr(1, { repository: "c/d", head: "feat" }), pr(2, { repository: "c/d", base: "feat" })] }),
      ),
      null,
    );

  test("two repos with the same number and head give two nodes, and a child links to its own repo", () => {
    const g = two();
    expect(g.nodes.map((n) => n.id).toSorted()).toEqual(["a/b#1", "c/d#1", "c/d#2"]);
    expect(g.edges.find((e) => e.to === "c/d#2")).toEqual({ from: "c/d#1", to: "c/d#2", kind: "base" });
  });

  test("a base that is the head of a PR in another repo is a foreign base", () => {
    const g = buildPrGraph(
      head(node("a", { prs: [pr(1, { head: "feat" }), pr(2, { repository: "c/d", base: "feat" })] })),
      null,
    );
    expect(g.edges.find((e) => e.to === "c/d#2")).toEqual({
      from: { repository: "c/d", branch: "feat" },
      to: "c/d#2",
      kind: "base",
    });
    expect(g.edges.some((e) => e.from === "a/b#1" && e.to === "c/d#2")).toBe(false);
  });

  test("two repos with the same foreign base give two branch nodes and no shared fan-out", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [pr(1, { base: "develop" }), pr(2, { repository: "c/d", base: "develop" })],
        }),
      ),
      null,
    );
    expect(g.branches.map((b) => b.repository).toSorted()).toEqual(["a/b", "c/d"]);
    expect(g.edges.find((e) => e.to === "c/d#2")).toMatchObject({ from: { repository: "c/d", branch: "develop" } });
  });

  test("open children of the same base name in two repos are no fan-out", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { base: "feat" }),
            pr(2, { base: "feat" }),
            pr(3, { repository: "c/d", base: "feat" }),
            pr(4, { repository: "c/d", base: "feat" }),
          ],
        }),
      ),
      null,
    );
    expect(g.anomalies.filter((a) => a.text.includes("open children")).map((a) => a.prs)).toEqual([
      ["a/b#1", "a/b#2"],
      ["c/d#3", "c/d#4"],
    ]);
    const one = buildPrGraph(
      head(node("a", { prs: [pr(1, { base: "feat" }), pr(3, { repository: "c/d", base: "feat" })] })),
      null,
    );
    expect(one.anomalies.filter((a) => a.text.includes("open children"))).toEqual([]);
  });
});

describe("edges", () => {
  const chain = () =>
    buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1),
            pr(2, { head: "h2", base: "h1", stack: { number: 7, pos: 2, total: 2 } }),
            pr(3, { base: "h1" }),
            pr(4, { base: "h1", state: "merged" }),
            pr(5, { base: "gone", state: "closed" }),
            pr(6, { base: "gone" }),
          ],
        }),
      ),
      null,
    );

  test("each edge kind", () => {
    const g = chain();
    const e = (n: number) => g.edges.find((x) => x.to === id(n))!;
    expect(e(1)).toEqual({ from: "main", to: id(1), kind: "main" });
    expect(e(3)).toEqual({ from: id(1), to: id(3), kind: "base" });
    expect(e(4).kind).toBe("dim");
    expect(e(5).kind).toBe("dim");
    expect(e(6)).toEqual({ from: { repository: "a/b", branch: "gone" }, to: id(6), kind: "base" });
  });

  test("stack kind needs one stack number on both PRs", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { stack: { number: 7, pos: 1, total: 2 } }),
            pr(2, { base: "h1", stack: { number: 7, pos: 2, total: 2 } }),
            pr(3, { base: "h1", stack: { number: 8, pos: 1, total: 1 } }),
          ],
        }),
      ),
      null,
    );
    expect(g.edges.find((x) => x.to === id(2))!.kind).toBe("stack");
    expect(g.edges.find((x) => x.to === id(3))!.kind).toBe("base");
  });

  test("a foreign base gives one branch node, one main edge, and an edge per child", () => {
    const g = chain();
    expect(g.branches).toEqual([{ repository: "a/b", branch: "gone", col: 1, row: expect.any(Number) }]);
    expect(g.edges.filter((x) => x.from === "main" && typeof x.to === "object")).toEqual([
      { from: "main", to: { repository: "a/b", branch: "gone" }, kind: "main" },
    ]);
    expect(g.edges.filter((x) => typeof x.from === "object")).toHaveLength(2);
  });

  test("the base PR is the open one, then the merged one, then the highest number", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { head: "x", state: "closed" }),
            pr(2, { head: "x", state: "merged" }),
            pr(3, { head: "x", state: "merged" }),
            pr(4, { base: "x" }),
          ],
        }),
      ),
      null,
    );
    expect(g.edges.find((e) => e.to === id(4))!.from).toBe(id(3));
    const open = buildPrGraph(
      head(node("a", { prs: [pr(1, { head: "x" }), pr(2, { head: "x", state: "merged" }), pr(4, { base: "x" })] })),
      null,
    );
    expect(open.edges.find((e) => e.to === id(4))!.from).toBe(id(1));
  });
});

describe("layout", () => {
  test("columns by depth", () => {
    const g = buildPrGraph(
      head(node("a", { prs: [pr(1), pr(2, { base: "h1" }), pr(3, { base: "h2" }), pr(4, { base: "gone" })] })),
      null,
    );
    expect([1, 2, 3, 4].map((n) => byN(g, n).col)).toEqual([1, 2, 3, 2]);
    expect(g.branches[0].col).toBe(1);
  });

  test("the first child keeps the row of its parent, the others take new rows", () => {
    const g = buildPrGraph(
      head(node("a", { prs: [pr(1), pr(2, { base: "h1" }), pr(3, { base: "h1" }), pr(4)] })),
      null,
    );
    expect([1, 2, 3, 4].map((n) => byN(g, n).row)).toEqual([0, 0, 1, 2]);
  });

  test("rows sort by lane (none last), then stack position, then number", () => {
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { head: "none-1" }),
            pr(2, { head: "l2-1" }),
            pr(3, { head: "l1-1", stack: { number: 1, pos: 2, total: 2 } }),
            pr(4, { head: "l1-2", stack: { number: 1, pos: 1, total: 2 } }),
            pr(5, { head: "l1-3" }),
          ],
        }),
      ),
      data({ lanes: [lane(1, ["L1-1", "L1-2", "L1-3"]), lane(2, ["L2-1"])] }),
    );
    const order = g.nodes.toSorted((a, b) => a.row - b.row).map((n) => n.n);
    expect(order).toEqual([4, 3, 5, 2, 1]);
  });

  test("merged stack members pile up at one spot, and the open rest chains on from the pile", () => {
    const s = (pos: number) => ({ stack: { number: 7, pos, total: 4 } });
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(2, { ...s(2), state: "merged" }),
            pr(1, { ...s(1), state: "merged" }),
            pr(3, s(3)),
            pr(4, { ...s(4), base: "h3" }),
            pr(5),
          ],
        }),
      ),
      null,
    );
    expect([1, 2, 3, 4, 5].map((n) => [byN(g, n).col, byN(g, n).row])).toEqual([
      [1, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [1, 1],
    ]);
    expect(g.edges.filter((e) => e.to === id(1) || e.to === id(2))).toEqual([{ from: "main", to: id(2), kind: "dim" }]);
    expect(g.edges.find((e) => e.to === id(3))).toEqual({ from: id(2), to: id(3), kind: "stack" });
  });

  test("a PR built on a hidden pile member chains on from the pile top", () => {
    const s = (pos: number) => ({ stack: { number: 7, pos, total: 3 } });
    const g = buildPrGraph(
      head(
        node("a", {
          prs: [
            pr(1, { ...s(1), state: "merged", head: "h1" }),
            pr(2, { ...s(2), state: "merged", head: "h2", base: "h1" }),
            pr(3, { ...s(3), base: "h2" }),
            pr(4, { base: "h1" }),
            pr(5, { base: "h4" }),
          ],
        }),
      ),
      null,
    );
    expect(g.edges.find((e) => e.to === id(4))).toMatchObject({ from: id(2) });
    expect(byN(g, 4)).toMatchObject({ col: byN(g, 2).col + 1 });
    expect(byN(g, 5)).toMatchObject({ col: byN(g, 2).col + 2 });
  });

  test("foreign branches go after the PR children of main", () => {
    const g = buildPrGraph(head(node("a", { prs: [pr(1, { base: "zzz" }), pr(2)] })), null);
    expect(byN(g, 2).row).toBe(0);
    expect(g.branches[0].row).toBe(1);
    expect(byN(g, 1).row).toBe(1);
  });

  test("a base cycle does not loop, and its nodes land in column 1 on new rows", () => {
    const g = buildPrGraph(
      head(node("a", { prs: [pr(1), pr(2, { head: "x", base: "y" }), pr(3, { head: "y", base: "x" })] })),
      null,
    );
    expect(byN(g, 2)).toMatchObject({ col: 1 });
    expect(byN(g, 3)).toMatchObject({ col: 1 });
    expect(new Set([2, 3].map((n) => byN(g, n).row)).size).toBe(2);
    expect(byN(g, 2).row).toBeGreaterThan(byN(g, 1).row);
  });
});

describe("Threads with no PR", () => {
  test("tree and settled members with no link, oldest first", () => {
    const g = buildPrGraph(
      head(
        node("young", {}, "2026-03-01"),
        node("linked", { prs: [pr(1)] }),
        node("old", { settled: true }, "2026-01-01"),
        node("undated"),
      ),
      data({ settled: [{ id: "s", title: "S", status: "done", createdAt: "2026-02-01", href: "t3://s", prs: [] }] }),
    );
    expect(g.noPr.map((t) => t.id)).toEqual(["old", "s", "young", "undated"]);
  });
});

describe("Anomalies", () => {
  const stackOf = (number: number, pos = 1) => ({ number, pos, total: 2 });
  const laneOf = (n: number, keys: { key: string; base: string }[], explicit = true) => ({
    n,
    label: "",
    explicit,
    keys,
  });
  const build = (prs: PrNode[], d: Partial<MapGraphData> | null = {}, over: Partial<ThreadNode> = {}) =>
    buildPrGraph(head(node("a", { prs, ...over })), d && data(d));
  const texts = (g: ReturnType<typeof buildPrGraph>) => g.anomalies.map((a) => a.text);

  describe("Fan-out", () => {
    test("a base other than main with 2 open children", () => {
      const g = build([pr(1, { head: "x" }), pr(2, { base: "x" }), pr(3, { base: "x" })]);
      expect(g.anomalies).toEqual([{ text: "x has 2 open children", prs: [id(2), id(3)] }]);
    });
    test("main with 2 children, or one child, or one open child, is not a hit", () => {
      expect(texts(build([pr(1), pr(2)]))).toEqual([]);
      expect(texts(build([pr(1, { head: "x" }), pr(2, { base: "x" })]))).toEqual([]);
      expect(texts(build([pr(1, { head: "x" }), pr(2, { base: "x" }), pr(3, { base: "x", state: "merged" })]))).toEqual(
        [],
      );
    });
    test("(planned) when each child lane key has the base from stack on", () => {
      const lanes = [
        laneOf(1, [
          { key: "K-2", base: "x" },
          { key: "K-3", base: "x" },
        ]),
      ];
      const g = build(
        [pr(1, { head: "x" }), pr(2, { head: "k-2-a", base: "x" }), pr(3, { head: "k-3-a", base: "x" })],
        {
          lanes,
        },
      );
      expect(texts(g)).toEqual(["x has 2 open children (planned)"]);
    });
  });

  describe("Closed parent", () => {
    test("one item for each open child of a closed PR", () => {
      const g = build([pr(1, { head: "x", state: "closed" }), pr(2, { base: "x" }), pr(3, { base: "x" })]);
      expect(g.anomalies.filter((a) => a.text.includes("closed"))).toEqual([
        { text: "#1 is closed, but #2 builds on it", prs: [id(1), id(2)] },
        { text: "#1 is closed, but #3 builds on it", prs: [id(1), id(3)] },
      ]);
    });
    test("a merged parent or a closed child is not a hit", () => {
      expect(texts(build([pr(1, { head: "x", state: "merged" }), pr(2, { base: "x" })]))).toEqual([]);
      expect(texts(build([pr(1, { head: "x", state: "closed" }), pr(2, { base: "x", state: "closed" })]))).toEqual([]);
    });
  });

  describe("Conflicts", () => {
    test("an open conflicting PR", () => {
      expect(build([pr(1, { conflicting: true })]).anomalies).toEqual([{ text: "#1 has conflicts", prs: [id(1)] }]);
    });
    test("a closed conflicting PR or an open clean PR is not a hit", () => {
      expect(texts(build([pr(1, { conflicting: true, state: "closed" }), pr(2)]))).toEqual([]);
    });
  });

  describe("Foreign base", () => {
    test("each PR on a foreign base", () => {
      expect(build([pr(1, { base: "zzz" }), pr(2, { base: "zzz", state: "closed" })]).anomalies).toEqual([
        { text: "#1 is based on zzz, which is not main or a map PR", prs: [id(1)] },
        { text: "#2 is based on zzz, which is not main or a map PR", prs: [id(2)] },
      ]);
    });
    test("main or a map PR is not a hit", () => {
      expect(texts(build([pr(1), pr(2, { base: "h1" })]))).toEqual([]);
    });
  });

  describe("Behind base", () => {
    test("an open stacked PR with behindBy above 0", () => {
      const g = build([pr(1, { stack: stackOf(7) })], { behind: { [id(1)]: 3 } });
      expect(g.anomalies).toEqual([{ text: "#1 is 3 commits behind its base", prs: [id(1)] }]);
    });
    test("no stack, 0 behind, no answer, closed or data null is not a hit", () => {
      expect(texts(build([pr(1)], { behind: { [id(1)]: 3 } }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7) })], { behind: { [id(1)]: 0 } }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7) })], { behind: {} }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7), state: "closed" })], { behind: { [id(1)]: 3 } }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7) })], null))).toEqual([]);
    });
  });

  describe("No thread", () => {
    test("an open PR with no thread", () => {
      expect(buildPrGraph(head(), data({ rows: [row(1)] })).anomalies).toEqual([
        { text: "#1 has no thread", prs: [id(1)] },
      ]);
    });
    test("a PR with a thread, a closed PR or an outside stack mate is not a hit", () => {
      expect(texts(build([pr(1)]))).toEqual([]);
      expect(texts(buildPrGraph(head(), data({ rows: [row(1, { state: "closed" })] })))).toEqual([]);
      expect(texts(buildPrGraph(head(), data({ mates: [row(1)] })))).toEqual([]);
    });
  });

  describe("Stopped thread", () => {
    test("failed and interrupted live threads", () => {
      expect(build([pr(1)], {}, { status: "failed" }).anomalies).toEqual([
        { text: "#1: its thread stopped", prs: [id(1)] },
      ]);
      expect(texts(build([pr(1)], {}, { status: "interrupted" }))).toEqual(["#1: its thread stopped"]);
    });
    test("a settled stopped thread, an idle thread or a closed PR is not a hit", () => {
      expect(texts(build([pr(1)], {}, { status: "failed", settled: true }))).toEqual([]);
      expect(texts(build([pr(1)], {}, { status: "idle" }))).toEqual([]);
      expect(texts(build([pr(1, { state: "closed" })], {}, { status: "failed" }))).toEqual([]);
    });
  });

  describe("Off the lane chain", () => {
    const keys = [
      { key: "K-1", base: "main" },
      { key: "K-2", base: "K-1" },
    ];
    const k = (n: number, key: string, over: Partial<PrNode> = {}) =>
      pr(n, { head: `${key.toLowerCase()}-a`, ...over });
    test("a base that is not the lane base", () => {
      const g = build([k(1, "K-1"), k(2, "K-2", { base: "other" })], { lanes: [laneOf(1, keys)] });
      expect(g.anomalies.filter((a) => a.text.includes("lane says"))).toEqual([
        { text: "#2 is based on other; the lane says K-1", prs: [id(2)] },
      ]);
    });
    test("the head of a non-closed PR of the previous key passes", () => {
      const g = build([k(1, "K-1"), k(2, "K-2", { base: "k-1-a" })], { lanes: [laneOf(1, keys)] });
      expect(texts(g).filter((t) => t.includes("lane says"))).toEqual([]);
    });
    test("main passes when the previous key has no PR or only merged PRs", () => {
      const lanes = [laneOf(1, keys)];
      expect(texts(build([k(2, "K-2")], { lanes }))).toEqual([]);
      expect(texts(build([k(1, "K-1", { state: "merged" }), k(2, "K-2")], { lanes }))).toEqual([]);
    });
    test("main does not pass while the previous key has an open PR", () => {
      const g = build([k(1, "K-1"), k(2, "K-2")], { lanes: [laneOf(1, keys)] });
      expect(texts(g)).toEqual(["#2 is based on main; the lane says K-1"]);
    });
    test("the stack on branch passes, another branch does not", () => {
      const lanes = [laneOf(1, [{ key: "K-1", base: "feat" }])];
      expect(texts(build([k(1, "K-1", { base: "feat" })], { lanes }))).toEqual([
        "#1 is based on feat, which is not main or a map PR",
      ]);
      expect(texts(build([k(1, "K-1", { base: "feat" }), pr(9, { head: "feat" })], { lanes }))).toEqual([]);
      expect(texts(build([k(1, "K-1", { base: "x" }), pr(9, { head: "x" })], { lanes })).join()).toContain(
        "#1 is based on x; the lane says feat",
      );
    });
    test("the head of another non-closed PR of the same key passes", () => {
      const lanes = [laneOf(1, [{ key: "K-1", base: "main" }])];
      const a = pr(1, { head: "k-1-a" });
      const b = pr(2, { head: "k-1-b", base: "k-1-a" });
      expect(texts(build([a, b], { lanes })).filter((t) => t.includes("lane says"))).toEqual([]);
      expect(texts(build([a, { ...b, base: "k-1-c" }], { lanes })).join()).toContain("#2 is based on k-1-c");
    });
    test("implicit lanes, outside PRs and data null give no hit", () => {
      const prs = [k(1, "K-1"), k(2, "K-2", { base: "other" })];
      expect(texts(build(prs, { lanes: [laneOf(1, keys, false)] })).join()).not.toContain("lane says");
      expect(texts(build([pr(3, { base: "main" })], { lanes: [laneOf(1, keys)] }))).toEqual([]);
      expect(texts(build(prs, null)).join()).not.toContain("lane says");
    });
  });

  describe("Stack across lanes", () => {
    const lanes = (explicit = true) => [
      laneOf(1, [{ key: "K-1", base: "main" }], explicit),
      laneOf(2, [{ key: "K-2", base: "main" }], explicit),
    ];
    test("one stack with nodes of 2 lanes", () => {
      const g = build([pr(1, { head: "k-1-a", stack: stackOf(7) }), pr(2, { head: "k-2-a", stack: stackOf(7, 2) })], {
        lanes: lanes(),
      });
      expect(g.anomalies.filter((a) => a.text.startsWith("Stack"))).toEqual([
        { text: "Stack #7 spans lanes L1, L2", prs: [id(1), id(2)] },
      ]);
    });
    test("one lane, another stack, implicit lanes or data null is not a hit", () => {
      const a = pr(1, { head: "k-1-a", stack: stackOf(7) });
      expect(
        texts(build([a, pr(2, { head: "k-1-b", stack: stackOf(7, 2) })], { lanes: lanes() })).join(),
      ).not.toContain("Stack #");
      expect(texts(build([a, pr(2, { head: "k-2-a", stack: stackOf(8) })], { lanes: lanes() })).join()).not.toContain(
        "Stack #",
      );
      const b = pr(2, { head: "k-2-a", stack: stackOf(7, 2) });
      expect(texts(build([a, b], { lanes: lanes(false) })).join()).not.toContain("Stack #");
      expect(texts(build([a, b], null)).join()).not.toContain("Stack #");
    });
  });

  describe("Key with several PRs", () => {
    const lanes = [laneOf(1, [{ key: "K-1", base: "main" }], false)];
    test("2 PRs that are not closed, with the closed ones listed", () => {
      const g = build([pr(1, { head: "k-1-a" }), pr(2, { head: "k-1-b" }), pr(3, { head: "k-1-c", state: "closed" })], {
        lanes,
      });
      expect(g.anomalies.filter((a) => a.text.startsWith("K-1"))).toEqual([
        { text: "K-1 has 2 PRs: #1, #2 (closed: #3)", prs: [id(1), id(2), id(3)] },
      ]);
    });
    test("a merged PR counts, a closed one does not", () => {
      expect(texts(build([pr(1, { head: "k-1-a", state: "merged" }), pr(2, { head: "k-1-b" })], { lanes }))).toEqual([
        "K-1 has 2 PRs: #1, #2",
      ]);
      expect(texts(build([pr(1, { head: "k-1-a" }), pr(2, { head: "k-1-b", state: "closed" })], { lanes }))).toEqual(
        [],
      );
    });
    test("a key of a member title counts, a keyless map gives none", () => {
      const prs = [pr(1, { head: "abc-5-a" }), pr(2, { head: "abc-5-b" })];
      expect(texts(build(prs, {}, { title: "ABC-5 thing" }))).toEqual(["ABC-5 has 2 PRs: #1, #2"]);
      expect(texts(build(prs, {}))).toEqual([]);
    });
  });

  describe("Missing from Stacks", () => {
    test("an open stacked PR that no chain lists", () => {
      const g = build([pr(1, { stack: stackOf(7) }), pr(2, { stack: stackOf(7, 2) })], { stacks: [{ prs: [1] }] });
      expect(g.anomalies).toEqual([{ text: "#2 is in a stack, but not in Stacks", prs: [id(2)] }]);
    });
    test("no Stacks section, no stack, closed or data null is not a hit", () => {
      expect(texts(build([pr(1, { stack: stackOf(7) })], { stacks: null }))).toEqual([]);
      expect(texts(build([pr(1)], { stacks: [] }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7), state: "closed" })], { stacks: [] }))).toEqual([]);
      expect(texts(build([pr(1, { stack: stackOf(7) })], null))).toEqual([]);
    });
  });
});

describe("pileLift", () => {
  test("a pile on row 0 opens down", () => {
    expect(pileLift(0, 5)).toBe(0);
    expect(pileLift(0, 1)).toBe(0);
  });

  test("a single card never lifts", () => {
    expect(pileLift(5, 1)).toBe(0);
  });

  test("a deep row gets the full centering lift", () => {
    expect(pileLift(9, 3)).toBe(NH + 4);
  });

  test("a high row is capped so the pile top stays on the canvas", () => {
    expect(pileLift(1, 20)).toBe(NH + GY);
  });
});

describe("focusOf", () => {
  const build = (prs: PrNode[], lanes: MapGraphData["lanes"] = null) =>
    buildPrGraph(head(node("a", { prs })), data({ lanes }));

  test("with no lanes, a chain shares the focus of its root", () => {
    const g = build([pr(1, { head: "h1" }), pr(2, { head: "h2", base: "h1" }), pr(3, { base: "h2" }), pr(4)]);
    expect([1, 2, 3, 4].map((n) => focusOf(g, id(n)))).toEqual([id(1), id(1), id(1), id(4)]);
  });

  test("a laned PR gives its lane, and a lane-less child of it too", () => {
    const g = build([pr(1, { head: "l1-1" }), pr(2, { base: "l1-1" })], [lane(1, ["L1-1"])]);
    expect(focusOf(g, id(1))).toBe("L1");
    expect(focusOf(g, id(2))).toBe("L1");
  });

  test("a branch pill has no focus", () => {
    expect(focusOf(build([pr(1)]), { repository: "a/b", branch: "x" })).toBeNull();
  });

  test("the top of a merged pile and the PR that chains on from it share a focus", () => {
    const s = (pos: number) => ({ stack: { number: 7, pos, total: 3 } });
    const g = build([
      pr(1, { ...s(1), state: "merged", head: "h1" }),
      pr(2, { ...s(2), state: "merged", head: "h2", base: "h1" }),
      pr(3, { ...s(3), base: "h2" }),
    ]);
    expect(focusOf(g, id(3))).toBe(focusOf(g, id(2)));
  });
});
