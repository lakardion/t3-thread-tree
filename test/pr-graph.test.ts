import { describe, expect, test } from "bun:test";

import type { MapGraphData } from "../src/shared/map-graph.ts";
import { buildPrGraph } from "../src/shared/pr-graph.ts";
import type { PrNode, ThreadNode } from "../src/shared/tree.ts";

const pr = (n: number, over: Partial<PrNode> = {}): PrNode => ({
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
    const e = (to: number) => g.edges.find((x) => x.to === to)!;
    expect(e(1)).toEqual({ from: "main", to: 1, kind: "main" });
    expect(e(3)).toEqual({ from: 1, to: 3, kind: "base" });
    expect(e(4).kind).toBe("dim");
    expect(e(5).kind).toBe("dim");
    expect(e(6)).toEqual({ from: { branch: "gone" }, to: 6, kind: "base" });
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
    expect(g.edges.find((x) => x.to === 2)!.kind).toBe("stack");
    expect(g.edges.find((x) => x.to === 3)!.kind).toBe("base");
  });

  test("a foreign base gives one branch node, one main edge, and an edge per child", () => {
    const g = chain();
    expect(g.branches).toEqual([{ branch: "gone", col: 1, row: expect.any(Number) }]);
    expect(g.edges.filter((x) => x.from === "main" && typeof x.to === "object")).toEqual([
      { from: "main", to: { branch: "gone" }, kind: "main" },
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
    expect(g.edges.find((e) => e.to === 4)!.from).toBe(3);
    const open = buildPrGraph(
      head(node("a", { prs: [pr(1, { head: "x" }), pr(2, { head: "x", state: "merged" }), pr(4, { base: "x" })] })),
      null,
    );
    expect(open.edges.find((e) => e.to === 4)!.from).toBe(1);
  });

  test("anomalies stay empty", () => {
    expect(chain().anomalies).toEqual([]);
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
