import { describe, expect, test } from "bun:test";

import { recency, sortTree, vtName } from "../src/page/view.ts";
import { NO_KEY, REVIEWS, type Branch, type ThreadNode } from "../src/shared/tree.ts";

const T = (n: number) => `2026-11-12T12:00:${String(n).padStart(2, "0")}.000Z`;
const thread = (id: string, run: number | null = null, children: ThreadNode[] = []): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  status: "working",
  phrase: "working",
  since: null,
  raw: "working",
  updatedAt: T(0),
  lastRun: run === null ? null : T(run),
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

describe("recency", () => {
  test("is the newest run of a thread and its subthreads", () => {
    expect(recency(thread("a", 1, [thread("c", 5), thread("d", 3)]))).toBe(Date.parse(T(5)));
  });
  test("is -Infinity when nothing ran", () => {
    expect(recency(thread("a", null, [thread("c")]))).toBe(-Infinity);
  });
});

describe("sortTree", () => {
  test("sorts threads newest first, null last, ties in input order", () => {
    const [p] = sortTree([
      project("p", [
        branch("g", [thread("old", 1), thread("none"), thread("new", 9), thread("tie1", 4), thread("tie2", 4)]),
      ]),
    ]);
    expect(ids(p.branches[0].threads)).toEqual(["new", "tie1", "tie2", "old", "none"]);
  });

  test("sorts groups by their newest thread, a subthread included", () => {
    const [p] = sortTree([
      project("p", [
        branch("g1", [thread("a", 2)]),
        branch("g2", [thread("b", 1, [thread("c", 8)])]),
        branch("g3", [thread("d", 5)]),
      ]),
    ]);
    expect(ids(p.branches)).toEqual(["g2", "g3", "g1"]);
  });

  test("keeps Reviews first and No issue key last, and sorts inside them", () => {
    const [p] = sortTree([
      project("p", [
        branch(NO_KEY, [thread("n1", 1), thread("n2", 9)]),
        branch("g", [thread("a", 5)]),
        branch(REVIEWS, [], [branch("r1", [thread("x", 1)]), branch("r2", [thread("y", 2), thread("z", 7)])]),
      ]),
    ]);
    expect(ids(p.branches)).toEqual([REVIEWS, "g", NO_KEY]);
    expect(ids(p.branches[0].branches)).toEqual(["r2", "r1"]);
    expect(ids(p.branches[0].branches[0].threads)).toEqual(["z", "y"]);
    expect(ids(p.branches[2].threads)).toEqual(["n2", "n1"]);
  });

  test("moves a stack run as one block and keeps its inner order", () => {
    const [p] = sortTree([
      project("p", [
        branch("s1", [thread("a", 1), thread("b", 2)], [], "st"),
        branch("s2", [thread("c", 3), thread("d", 9)], [], "st"),
        branch("g", [thread("e", 5)]),
        branch("h", [thread("f", 4)]),
      ]),
    ]);
    expect(ids(p.branches)).toEqual(["s1", "s2", "g", "h"]);
    expect(ids(p.branches[0].threads)).toEqual(["a", "b"]);
    expect(ids(p.branches[1].threads)).toEqual(["c", "d"]);
    const [q] = sortTree([
      project("p", [
        branch("g", [thread("e", 10)]),
        branch("s1", [thread("a", 1)], [], "st"),
        branch("s2", [thread("c", 3), thread("d", 9)], [], "st"),
      ]),
    ]);
    expect(ids(q.branches)).toEqual(["g", "s1", "s2"]);
    const [r] = sortTree([
      project("p", [
        branch("g", [thread("e", 2)]),
        branch("s1", [thread("a", 1)], [], "st"),
        branch("s2", [thread("c", 3), thread("d", 9)], [], "st"),
      ]),
    ]);
    expect(ids(r.branches)).toEqual(["s1", "s2", "g"]);
  });

  test("keeps the thread order in a stack run of one group", () => {
    const [p] = sortTree([
      project("p", [branch("g", [thread("e", 2)]), branch("s1", [thread("a", 1), thread("b", 9)], [], "st")]),
    ]);
    expect(ids(p.branches)).toEqual(["s1", "g"]);
    expect(ids(p.branches[0].threads)).toEqual(["a", "b"]);
  });

  test("keeps subthread order and project order", () => {
    const out = sortTree([
      project("p1", [branch("g", [thread("a", 1, [thread("c1", 1), thread("c2", 9)])])]),
      project("p2", [branch("g", [thread("b", 9)])]),
    ]);
    expect(ids(out)).toEqual(["p1", "p2"]);
    expect(ids(out[0].branches[0].threads[0].children)).toEqual(["c1", "c2"]);
  });

  test("does not change the input", () => {
    const input = [project("p", [branch("g", [thread("a", 1), thread("b", 2)])])];
    sortTree(input);
    expect(ids(input[0].branches[0].threads)).toEqual(["a", "b"]);
  });
});

describe("vtName", () => {
  test("replaces characters that a CSS name cannot hold", () => {
    expect(vtName("t", "env:1/abc.d")).toBe("t-env_1_abc_d");
    expect(vtName("s", "stack:p:1")).toBe("s-stack_p_1");
  });
});
