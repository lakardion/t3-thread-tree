import { describe, expect, test } from "bun:test";

import { bandMates, bandsOf, graphActionMatches, mapsOf, NONE, sortBands, treeOrder } from "../src/page/graph-scope.ts";
import type { GraphPr } from "../src/shared/pr-graph-data.ts";
import type { Group, PrNode, ThreadNode } from "../src/shared/tree.ts";

const pr = (n: number, over: Partial<PrNode> = {}): PrNode =>
  ({ repository: "a/b", n, stack: null, ...over }) as PrNode;

const thread = (id: string, over: Partial<ThreadNode> = {}): ThreadNode =>
  ({ id, title: id, settled: false, prs: [], children: [], ...over }) as unknown as ThreadNode;

const project = (id: string, label: string, ...threads: ThreadNode[]): Group => ({
  id: `p:${id}`,
  label,
  kind: "project",
  groups: [],
  threads,
});

const linear = (label: string, ...threads: ThreadNode[]): Group => ({
  id: `lf:${label}`,
  label,
  kind: "linear-project",
  groups: [],
  threads,
});

describe("bandsOf", () => {
  test("a project tree gives one band per project with its graph members", () => {
    const bands = bandsOf([
      project("1", "Alpha", thread("a", { prs: [pr(1)] }), thread("b")),
      project("2", "Beta", thread("c", { prs: [pr(2)] })),
    ]);
    expect(bands.map((b) => [b.id, b.label, b.members.map((t) => t.id), b.threads.map((t) => t.id)])).toEqual([
      ["1", "Alpha", ["a"], ["a", "b"]],
      ["2", "Beta", ["c"], ["c"]],
    ]);
  });

  test("a Linear tree bands by the T3 project of each thread", () => {
    const t = (id: string, p: string, prs: PrNode[]) => thread(id, { t3Project: { id: p, label: `P${p}` }, prs });
    const bands = bandsOf([
      linear("L1", t("a", "1", [pr(1)])),
      linear("L2", t("b", "1", [pr(2)]), t("c", "2", [pr(3)])),
    ]);
    expect(bands.map((b) => [b.id, b.members.map((x) => x.id)])).toEqual([
      ["1", ["a", "b"]],
      ["2", ["c"]],
    ]);
  });

  test("settled threads, step threads and subthreads: settled and step are left out, subthreads count", () => {
    const [band] = bandsOf([
      project(
        "1",
        "Alpha",
        thread("a", { prs: [pr(1)], children: [thread("sub", { prs: [pr(2)] })] }),
        thread("s", { prs: [pr(3)], settled: true }),
        thread("st", { prs: [pr(4)], step: "build" }),
      ),
    ]);
    expect(band.members.map((t) => t.id)).toEqual(["a", "sub"]);
    expect(band.threads.map((t) => t.id)).toEqual(["a", "sub"]);
  });

  test("a project with no known name goes to No project", () => {
    const [band] = bandsOf([project("gone", "gone", thread("a", { prs: [pr(1)] }))]);
    expect(band).toMatchObject({ id: NONE, label: "No project" });
  });
});

describe("mapsOf", () => {
  test("lists map thread rows and Map headers by name, with the project", () => {
    const header = thread("h", { map: { name: "Zed", header: true, href: null, key: "zed" } });
    const maps = mapsOf([
      project(
        "1",
        "Alpha",
        thread("m", { map: { name: "Beta map", header: false, href: null, key: "beta" } }),
        thread("multi", { map: { name: "multi", header: false, href: null }, children: [header] }),
      ),
    ]);
    expect(maps.map((m) => [m.key, m.name, m.head.id, m.project.label])).toEqual([
      ["beta", "Beta map", "m", "Alpha"],
      ["zed", "Zed", "h", "Alpha"],
    ]);
  });
});

describe("bandMates", () => {
  test("keeps the mates whose stack holds a band PR", () => {
    const stack = (number: number) => ({ number, pos: 1, total: 2 });
    const mates = [
      pr(10, { stack: stack(5) }),
      pr(11, { stack: stack(6) }),
      pr(12, { repository: "x/y", stack: stack(5) }),
    ] as GraphPr[];
    expect(bandMates(mates, [pr(1, { stack: stack(5) })]).map((m) => m.n)).toEqual([10]);
  });
});

describe("sortBands", () => {
  const bands = [
    { id: "a", label: "Alpha", open: 1 },
    { id: NONE, label: "No project", open: 9 },
    { id: "b", label: "Beta", open: 3 },
    { id: "c", label: "Cee", open: 3 },
  ];
  const ids = (sort: "title" | "open" | "tree", order: string[] = []) =>
    sortBands(bands, sort, (b) => b.open, order).map((b) => b.id);
  test("title sorts A to Z", () => expect(ids("title")).toEqual(["a", "b", "c", NONE]));
  test("open sorts most first, then by title", () => expect(ids("open")).toEqual(["b", "c", "a", NONE]));
  test("tree follows the order, the rest by title, No project last", () =>
    expect(ids("tree", ["c", "a"])).toEqual(["c", "a", "b", NONE]));
});

describe("treeOrder", () => {
  test("pinned projects lead in pinned order, then the stored list", () => {
    const orders = { projects: ["p:1", "p:2", "p:3"], "projects#pin": ["p:3", "p:2"] };
    expect(treeOrder(orders, new Set(["p:2", "p:3", "t:x"]))).toEqual(["3", "2", "1"]);
  });
  test("no stored order gives the pins, or nothing", () => {
    expect(treeOrder({}, new Set(["p:2"]))).toEqual(["2"]);
    expect(treeOrder({}, new Set())).toEqual([]);
  });
});

describe("graphActionMatches", () => {
  test("every word must be in 'pr graph'", () => {
    expect(graphActionMatches("")).toBe(true);
    expect(graphActionMatches("graph")).toBe(true);
    expect(graphActionMatches("PR gra")).toBe(true);
    expect(graphActionMatches("pr bug")).toBe(false);
    expect(graphActionMatches("thread")).toBe(false);
  });
});
