import { describe, expect, test } from "bun:test";

import { onlyNeedsYou } from "../src/page/attention.ts";
import { applyOrder, arrange, parseOrders, prune, reorder, type Freeze } from "../src/page/order.ts";
import { NO_KEY, REVIEWS, type Branch, type Status, type ThreadNode } from "../src/shared/tree.ts";

const thread = (id: string, status: Status = "working", children: ThreadNode[] = []): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  status,
  phrase: status,
  since: null,
  raw: status,
  updatedAt: "2026-11-12T12:00:00.000Z",
  settled: false,
  input: false,
  snoozedUntil: null,
  stack: null,
  prs: [],
  detail: {} as ThreadNode["detail"],
  children,
});
const branch = (id: string, threads: ThreadNode[] = [], branches: Branch[] = [], stack?: string): Branch => ({
  id,
  label: id,
  ...(stack && { stack: { id: stack, total: 2, base: null } }),
  branches,
  threads,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

const project = (id: string, branches: Branch[]) => branch(id, [], branches);
const sample = () => [
  project("p:a", [
    branch("g:a1", [thread("t1"), thread("t2", "working", [thread("c1"), thread("c2")])]),
    branch("g:a2", [thread("t3")], [], "s0"),
    branch("g:a3", [thread("t4")], [], "s0"),
    branch("g:a4", [thread("t5")]),
    branch(REVIEWS, [], [branch("r1", [thread("t6")]), branch("r2", [thread("t7")])]),
    branch(NO_KEY, [thread("t8")]),
  ]),
  project("p:b", []),
];

describe("applyOrder", () => {
  const by = (x: string) => x;
  test("applies the stored order", () => {
    expect(applyOrder(["a", "b", "c"], by, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });
  test("puts a new id last, in base order", () => {
    expect(applyOrder(["a", "b", "c", "d"], by, ["c", "a"])).toEqual(["c", "a", "b", "d"]);
  });
  test("skips a vanished id", () => {
    expect(applyOrder(["a", "b"], by, ["x", "b", "a"])).toEqual(["b", "a"]);
  });
  test("keeps the base order with no stored order", () => {
    expect(applyOrder(["a", "b"], by, undefined)).toEqual(["a", "b"]);
  });
});

describe("arrange", () => {
  test("reorders project cards", () => {
    expect(ids(arrange(sample(), { projects: ["p:b", "p:a"] }).projects)).toEqual(["p:b", "p:a"]);
  });

  test("moves a stack run as one block and keeps its inner order", () => {
    const { projects, lists } = arrange(sample(), { "groups:p:a": ["g:a4", "stack:p:a:s0", "g:a1"] });
    expect(ids(projects[0].branches)).toEqual(["g:a4", "g:a2", "g:a3", "g:a1", REVIEWS, NO_KEY]);
    expect(lists.get("groups:p:a")).toEqual(["g:a4", "stack:p:a:s0", "g:a1"]);
  });

  test("keeps Reviews and No issue key last whatever the stored order", () => {
    const { projects } = arrange(sample(), { "groups:p:a": [NO_KEY, REVIEWS, "g:a4"] });
    expect(ids(projects[0].branches).slice(-2)).toEqual([REVIEWS, NO_KEY]);
  });

  test("reorders top-level threads, not subthreads", () => {
    const { projects } = arrange(sample(), { "threads:g:a1": ["t:t2", "t:t1"] });
    expect(ids(projects[0].branches[0].threads)).toEqual(["t2", "t1"]);
    expect(ids(projects[0].branches[0].threads[0].children)).toEqual(["c1", "c2"]);
  });

  test("reorders the groups of Reviews", () => {
    const { projects } = arrange(sample(), { [`groups:${REVIEWS}`]: ["r2", "r1"] });
    expect(ids(projects[0].branches.find((b) => b.label === REVIEWS)!.branches)).toEqual(["r2", "r1"]);
  });

  test("does not change the input", () => {
    const tree = sample();
    const before = JSON.stringify(tree);
    arrange(tree, { projects: ["p:b", "p:a"], "groups:p:a": ["g:a4"], "threads:g:a1": ["t:t2"] });
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe("arrange with a freeze", () => {
  const frozen = (list: string, tree: Branch[]): Freeze => {
    const { lists, units } = arrange(tree, {});
    return { list, ids: lists.get(list)!, units: units.get(list)! };
  };

  test("a removed unit stays at its frozen slot and a new unit goes last", () => {
    const list = "threads:g:a1";
    const freeze = frozen(list, [project("p:a", [branch("g:a1", [thread("x"), thread("y"), thread("z")])])]);
    const next = [project("p:a", [branch("g:a1", [thread("x"), thread("z"), thread("n")])])];
    const { projects } = arrange(next, {}, freeze);
    expect(ids(projects[0].branches[0].threads)).toEqual(["x", "y", "z", "n"]);
  });

  test("keeps a thread that no longer needs you, at its frozen slot", () => {
    const tree = [
      project("p:a", [branch("g:a1", [thread("x", "your-turn"), thread("y", "your-turn"), thread("z", "your-turn")])]),
    ];
    const freeze = frozen("threads:g:a1", onlyNeedsYou(tree));
    const pushed = [
      project("p:a", [branch("g:a1", [thread("x", "your-turn"), thread("y", "working"), thread("z", "your-turn")])]),
    ];
    const { projects } = arrange(onlyNeedsYou(pushed), {}, freeze);
    expect(ids(projects[0].branches[0].threads)).toEqual(["x", "y", "z"]);
  });

  test("a group that moved into another stack run renders once", () => {
    const before = [project("p:a", [branch("g:1", [thread("t1")], [], "s0"), branch("g:2", [thread("t2")], [], "s0")])];
    const freeze = frozen("groups:p:a", before);
    const after = [project("p:a", [branch("g:1", [thread("t1")], [], "s1"), branch("g:2", [thread("t2")], [], "s0")])];
    const { projects } = arrange(after, {}, freeze);
    expect(ids(projects[0].branches).toSorted()).toEqual(["g:1", "g:2"]);
  });
});

describe("reorder", () => {
  test("moves one id", () => {
    expect(reorder(["a", "b", "c"], ["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  test("keeps hidden ids in their slots", () => {
    expect(reorder(["a", "h", "b", "i", "c"], ["a", "b", "c"], 0, 2)).toEqual(["b", "h", "c", "i", "a"]);
  });
  test("drops an id removed during the drag", () => {
    expect(reorder(["a", "c"], ["a", "gone", "c"], 0, 2)).toEqual(["c", "a"]);
  });
});

describe("reorder with hidden and removed ids", () => {
  test("keeps the hidden id in its slot and drops the removed id", () => {
    expect(reorder(["a", "h", "b", "c"], ["a", "gone", "b", "c"], 0, 3)).toEqual(["b", "h", "c", "a"]);
  });
});

describe("parseOrders", () => {
  test("keeps entries that are arrays of strings", () => {
    expect(parseOrders('{"a":["x","y"],"b":"x","c":[1],"d":null}')).toEqual({ a: ["x", "y"] });
  });
  test("gives an empty object for bad input", () => {
    for (const raw of [null, "[]", "null", "7", "{oops"]) expect(parseOrders(raw)).toEqual({});
  });
});

describe("prune", () => {
  test("drops vanished ids and vanished lists", () => {
    const lists = new Map([["a", ["x", "z"]]]);
    expect(prune({ a: ["z", "gone", "x"], b: ["q"] }, lists)).toEqual({ a: ["z", "x"] });
  });
});
