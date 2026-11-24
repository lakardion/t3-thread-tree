import { describe, expect, test } from "bun:test";

import { foldIds } from "../src/page/format.ts";
import { applyOrder } from "../src/page/order.ts";
import {
  closedCounts,
  FLAT,
  flatLists,
  flatten,
  folds,
  itemIds,
  pathFolds,
  recency,
  sectionHolding,
  sectionList,
  sectionOf,
  sections,
  sequence,
  sortFlat,
  sortTree,
  vtName,
} from "../src/page/view.ts";
import {
  allThreads,
  LINEAR_LOOSE,
  NO_KEY,
  REVIEWS,
  type Branch,
  type Status,
  type ThreadNode,
} from "../src/shared/tree.ts";

const T = (n: number) => `2026-11-12T12:00:${String(n).padStart(2, "0")}.000Z`;
const thread = (
  id: string,
  run: number | null = null,
  children: ThreadNode[] = [],
  status: Status = "working",
): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  linear: null,
  status,
  phrase: status,
  since: null,
  raw: status,
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

describe("flatten", () => {
  const sample = () => [
    project("p1", [
      branch(REVIEWS, [], [branch("r1", [thread("rv")])]),
      branch("g1", [thread("a", 1, [thread("sub")]), thread("b")]),
      branch("s1", [thread("c")], [], "st"),
      branch("s2", [thread("d")], [], "st"),
      branch("g2", [thread("e")]),
      branch(NO_KEY, [thread("n")]),
    ]),
    project("p2", [branch("g3", [thread("f")])]),
  ];
  const out = flatten(sample());

  test("goes project, then Reviews, groups and No issue key, in order", () => {
    expect(ids(out)).toEqual(["t:rv", "t:a", "t:b", "stack:p1:st", "t:e", "t:n", "t:f"]);
  });
  test("flags review threads and names the project", () => {
    const flags = out.flatMap((u) => (u.kind === "thread" ? [[u.id, u.review, u.project.id]] : []));
    expect(flags[0]).toEqual(["t:rv", true, "p1"]);
    expect(flags.at(-1)).toEqual(["t:f", false, "p2"]);
  });
  test("makes a stack run one unit and leaves subthreads in place", () => {
    const stack = out.find((u) => u.kind === "stack");
    expect(stack?.kind === "stack" && ids(stack.run)).toEqual(["s1", "s2"]);
    expect(out.some((u) => u.id === "t:sub")).toBe(false);
  });
});

describe("sortFlat", () => {
  test("sorts across projects, a stack by its newest thread, and keeps ties", () => {
    const units = flatten([
      project("p1", [branch("g1", [thread("a", 1), thread("b", 5)]), branch("s1", [thread("c", 9)], [], "st")]),
      project("p2", [branch("g2", [thread("d", 5), thread("e", 7)])]),
    ]);
    expect(ids(sortFlat(units))).toEqual(["stack:p1:st", "t:e", "t:b", "t:d", "t:a"]);
  });
});

describe("sections", () => {
  const unit = (id: string, status: Status) =>
    flatten([project("p", [branch(`g${id}`, [thread(id, 1, [], status)])])])[0];
  test("orders sections, hides empty ones, and maps statuses", () => {
    const units = [
      unit("a", "done"),
      unit("b", "interrupted"),
      unit("c", "starting"),
      unit("d", "snoozed"),
      unit("e", "idle"),
      unit("f", "waiting"),
      unit("g", "needs-input"),
    ];
    expect(sections(units).map((s) => [s.key, ids(s.units)])).toEqual([
      ["needs-input", ["t:g"]],
      ["failed", ["t:b"]],
      ["working", ["t:c", "t:f"]],
      ["idle", ["t:d", "t:e"]],
      ["done", ["t:a"]],
    ]);
  });
  test("puts a stack in the section of its most urgent thread", () => {
    const [stack] = flatten([
      project("p", [
        branch("s1", [thread("a", 1, [], "done")], [], "st"),
        branch("s2", [thread("b", 1, [], "your-turn")], [], "st"),
      ]),
    ]);
    expect(sections([stack]).map((s) => s.key)).toEqual(["your-turn"]);
  });
  test("puts a unit in the section of its subthread when that is more urgent", () => {
    const [u] = flatten([project("p", [branch("g", [thread("a", 1, [thread("c", 1, [], "your-turn")], "idle")])])]);
    expect(sections([u]).map((s) => s.key)).toEqual(["your-turn"]);
  });
  test("places a unit by a subthread at any depth", () => {
    const deep = flatten([
      project("p", [branch("g", [thread("a", 1, [thread("b", 1, [thread("c", 1, [], "working")], "idle")], "idle")])]),
    ])[0];
    expect(sections([deep]).map((s) => s.key)).toEqual(["working"]);
    expect(sections([unit("x", "idle"), deep]).map((s) => [s.key, ids(s.units)])).toEqual([
      ["working", ["t:a"]],
      ["idle", ["t:x"]],
    ]);
  });
  test("does not place a unit by a settled subthread", () => {
    const settled = { ...thread("c", 1, [], "needs-input"), settled: true };
    const [u] = flatten([project("p", [branch("g", [thread("a", 1, [settled], "done")])])]);
    expect(sections([u]).map((s) => s.key)).toEqual(["done"]);
  });
  test("places a unit with only settled threads by all of them", () => {
    const child = { ...thread("c", 1, [], "needs-input"), settled: true };
    const [u] = flatten([project("p", [branch("g", [{ ...thread("a", 1, [child], "done"), settled: true }])])]);
    expect(sections([u]).map((s) => s.key)).toEqual(["needs-input"]);
  });
  test("places a stack by a subthread of its thread", () => {
    const [stack] = flatten([
      project("p", [branch("s1", [thread("a", 1, [thread("c", 1, [], "needs-input")], "done")], [], "st")]),
    ]);
    expect(sections([stack]).map((s) => s.key)).toEqual(["needs-input"]);
  });
  test("sequence adds a header with a count before each section, or none without grouping", () => {
    const units = [unit("a", "done"), unit("b", "done")];
    expect(sequence(units, "none")).toEqual(units);
    expect(sequence(units, "status").map((i) => [i.kind, i.id])).toEqual([
      ["section", "sec:done"],
      ["thread", "t:a"],
      ["thread", "t:b"],
    ]);
    const header = sequence(units, "status")[0];
    expect(header.kind === "section" && header.count).toBe(2);
  });
  test("sequence counts the matching threads, subthreads included, without settled and context rows", () => {
    const needs = (id: string, kids: ThreadNode[] = []) => thread(id, 1, kids, "needs-input");
    const [a, stack] = flatten([
      project("p", [
        branch("g", [thread("a", 1, [needs("c", [needs("d")])], "idle")]),
        branch("s1", [needs("s1")], [], "st"),
        branch("s2", [thread("s2", 1, [], "done")], [], "st"),
        branch("s3", [{ ...needs("s3"), settled: true }], [], "st"),
      ]),
    ]);
    const header = sequence([a, stack], "status")[0];
    expect(header.kind === "section" && header.count).toBe(3);
  });
  test("folds a stack row only when it and its subthreads are context rows", () => {
    const needs = (kids: ThreadNode[] = []) => thread("n", 1, kids, "needs-input");
    expect(folds(thread("a", 1, [], "done"), ["needs-input"])).toBe(true);
    expect(folds(thread("a", 1, [needs()], "done"), ["needs-input"])).toBe(false);
    expect(folds({ ...needs(), settled: true }, ["needs-input"])).toBe(true);
    expect(folds(needs(), ["needs-input"])).toBe(false);
  });
  test("sectionOf gives the statuses of the header above a unit", () => {
    const units = [unit("a", "done"), unit("b", "idle")];
    const items = sequence(units, "status");
    expect(sectionOf(items, items[1])).toEqual(["idle", "snoozed"]);
    expect(sectionOf(items, items[0])).toBeNull();
    expect(sectionOf(units, units[0])).toBeNull();
  });
  describe("waiting sections", () => {
    const waiting = (
      id: string,
      since: number | null,
      status: Status = "your-turn",
      children: ThreadNode[] = [],
      run = 1,
    ) =>
      flatten([
        project("p", [
          branch(`g${id}`, [{ ...thread(id, run, children, status), since: since === null ? null : T(since) }]),
        ]),
      ])[0];
    const first = (units: ReturnType<typeof flatten>) => ids(sections(units)[0].units);
    test("sorts Needs input, Plan ready and Your turn by the oldest since first", () => {
      for (const status of ["needs-input", "plan-ready", "your-turn"] as const)
        expect(first([waiting("a", 5, status), waiting("b", 2, status), waiting("c", 9, status)])).toEqual([
          "t:b",
          "t:a",
          "t:c",
        ]);
    });
    test("puts a unit with no since last and keeps ties in input order", () => {
      expect(
        first([waiting("a", null), waiting("b", 3), waiting("c", 3), waiting("d", null), waiting("e", 1)]),
      ).toEqual(["t:e", "t:b", "t:c", "t:a", "t:d"]);
    });
    test("sorts a stack by the oldest since of its threads in the section statuses", () => {
      const [stack] = flatten([
        project("p", [
          branch(
            "s1",
            [
              { ...thread("x", 1, [], "your-turn"), since: T(7) },
              { ...thread("z", 1, [], "your-turn"), since: T(3) },
              { ...thread("y", 1, [], "done"), since: T(1) },
            ],
            [],
            "st",
          ),
        ]),
      ]);
      expect(first([waiting("a", 5), stack, waiting("b", 9)])).toEqual(["stack:p:st", "t:a", "t:b"]);
    });
    test("sorts a unit by the since of its subthread", () => {
      const sub = { ...thread("c", 1, [], "your-turn"), since: T(1) };
      expect(first([waiting("a", 5, "your-turn", [sub]), waiting("b", 3)])).toEqual(["t:a", "t:b"]);
    });
    test("does not sort a unit by the since of a settled subthread", () => {
      const sub = { ...thread("c", 1, [], "your-turn"), since: T(1), settled: true };
      expect(first([waiting("a", 5, "your-turn", [sub]), waiting("b", 3)])).toEqual(["t:b", "t:a"]);
    });
    test("keeps the input order in other sections", () => {
      const units = [waiting("a", 5, "working"), waiting("b", 2, "working")];
      expect(first(units)).toEqual(["t:a", "t:b"]);
    });
    test("sorts by Wait for the manual and the last-updated order", () => {
      const units = [waiting("a", 5), waiting("b", 2), waiting("c", 9)];
      expect(first(units)).toEqual(["t:b", "t:a", "t:c"]);
      expect(first(sortFlat(units))).toEqual(["t:b", "t:a", "t:c"]);
      const tied = [waiting("d", 4), waiting("e", 4, "your-turn", [], 9)];
      expect(first(tied)).toEqual(["t:d", "t:e"]);
      expect(first(sortFlat(tied))).toEqual(["t:e", "t:d"]);
    });
    test("keeps the input order without grouping", () => {
      const units = [waiting("a", 5), waiting("b", 2)];
      expect(sequence(units, "none")).toEqual(units);
    });
    test("puts a row that stops waiting back at its stored place", () => {
      const units = [waiting("a", 5), waiting("b", 2), waiting("c", 9, "working")];
      const stored = ["t:c", "t:a", "t:b"];
      const [, working] = sections(applyOrder(units, (u) => u.id, stored));
      expect(ids(working.units)).toEqual(["t:c"]);
      const stopped = [waiting("a", 5, "working"), units[1], units[2]];
      expect(sections(applyOrder(stopped, (u) => u.id, stored)).map((s) => [s.key, ids(s.units)])).toEqual([
        ["your-turn", ["t:b"]],
        ["working", ["t:c", "t:a"]],
      ]);
    });
  });
  test("itemIds lists a stack with its threads", () => {
    const [stack] = flatten([project("p", [branch("s1", [thread("a")], [], "st")])]);
    expect(itemIds(stack)).toEqual(["stack:p:st", "a"]);
  });
});

describe("flatLists", () => {
  const units = flatten([project("p", [branch("g", [thread("a", 1, [], "done"), thread("b", 1, [], "working")])])]);
  test("holds all unit ids under the flat key when ungrouped", () => {
    expect([...flatLists(sequence(units, "none"))]).toEqual([["flat", ["t:a", "t:b"]]]);
  });
  test("gives a waiting section no list and keeps its ids out of the flat list", () => {
    const mixed = flatten([
      project("p", [branch("g", [thread("a", 1, [], "your-turn"), thread("b", 1, [], "working")])]),
    ]);
    expect([...flatLists(sequence(mixed, "status"))]).toEqual([
      ["flat", ["t:b"]],
      ["flat:working", ["t:b"]],
    ]);
  });
  test("adds the unit ids of each section when grouped", () => {
    expect([...flatLists(sequence(units, "status"))]).toEqual([
      ["flat", ["t:b", "t:a"]],
      ["flat:working", ["t:b"]],
      ["flat:done", ["t:a"]],
    ]);
  });
});

describe("closed sections", () => {
  const units = flatten([
    project("p", [
      branch("g", [thread("a", 1, [], "working"), thread("b", 1, [], "idle"), thread("c", 1, [], "done")]),
    ]),
  ]);
  const shut = new Set(["idle"]);
  test("keeps the header with the open count and drops the units", () => {
    const items = sequence(units, "status", shut);
    expect(items.map((i) => i.id)).toEqual(["sec:working", "t:a", "sec:idle", "sec:done", "t:c"]);
    expect(items.find((i) => i.id === "sec:idle")).toMatchObject({ open: false, count: 1 });
    expect(items.find((i) => i.id === "sec:done")).toMatchObject({ open: true, count: 1 });
  });
  test("gives its units no drag", () => {
    const lists = flatLists(sequence(units, "status", shut));
    expect([...lists.values()].flat()).not.toContain("t:b");
    expect(lists.get("flat:idle")).toEqual([]);
  });
  test("does nothing with Group by None", () => {
    expect(sequence(units, "none", shut)).toEqual(units);
  });
});

describe("hidden snoozed threads", () => {
  const units = flatten([project("p", [branch("g", [thread("s", 1, [thread("d", 1, [], "done")], "snoozed")])])]);
  test("a snoozed parent with a done child lands in Done, as a context row", () => {
    const items = sequence(units, "status", new Set(), false);
    expect(items.map((i) => i.id)).toEqual(["sec:done", "t:s"]);
    expect(items[0]).toMatchObject({ count: 1 });
    expect(sectionOf(items, items[1])).toEqual(["done"]);
  });
  test("a snoozed thread still places in Idle and snoozed by default", () => {
    expect(sequence(units, "status").map((i) => i.id)).toEqual(["sec:idle", "t:s"]);
  });
});

describe("closedCounts", () => {
  const some = (...st: Status[]) => st.map((s, i) => thread(`t${i}`, null, [], s));
  test("is empty with 4 threads", () => {
    expect(closedCounts(some("working", "working", "done", "done"))).toEqual([]);
  });
  test("counts a status group in section order, with the first status, a lower-case label, and no empty group", () => {
    const ts = some("done", "interrupted", "needs-input", "failed", "your-turn", "needs-input");
    expect(closedCounts(ts)).toEqual([
      { status: "needs-input", label: "needs input", n: 2 },
      { status: "your-turn", label: "your turn", n: 1 },
      { status: "failed", label: "failed", n: 2 },
      { status: "done", label: "done", n: 1 },
    ]);
  });
  test("counts subthreads toward the threshold", () => {
    const ts = [thread("a", null, some("working", "working", "working", "working"))];
    expect(closedCounts(allThreads(branch("b", ts))).length).toBe(1);
  });
});

describe("pathFolds", () => {
  const tree = [
    project("p1", [branch("g1", [thread("a")])]),
    project("p2", [
      branch(REVIEWS, [], [branch("r", [thread("x")])]),
      branch("s1", [thread("b", null, [thread("c")])], [], "st"),
    ]),
  ];
  test("lists the branches from the project down", () => expect(pathFolds(tree, "x")).toEqual(["p2", REVIEWS, "r"]));
  test("adds the rail of a stack, and finds a subthread", () =>
    expect(pathFolds(tree, "c")).toEqual(["p2", "s1", "rail:st"]));
  test("is empty for an unknown thread", () => expect(pathFolds(tree, "zz")).toEqual([]));
});

describe("sectionHolding", () => {
  const units = flatten([
    project("p", [branch("g", [thread("a", null, [], "done")]), branch("h", [thread("b", null, [thread("c")])])]),
  ]);
  test("is the section of the unit that holds the thread", () => {
    expect(sectionHolding(units, true, "a")).toBe("done");
    expect(sectionHolding(units, true, "c")).toBe("working");
  });
  test("is null for an unknown thread", () => expect(sectionHolding(units, true, "zz")).toBeNull());
});

describe("Linear tree", () => {
  const lin = (b: Branch): Branch => ({ ...b, linear: {} });
  const tree = () => [
    lin(
      branch(
        "lp:a",
        [],
        [lin(branch("lm:m1", [thread("old", 1), thread("new", 5)])), lin(branch("lm:m2", [thread("x", 9)]))],
      ),
    ),
    lin(branch("lp:b", [], [lin(branch("lm:m3", [thread("y", 20)]))])),
    lin(
      branch("lf:reviews", [], [branch("lf:reviews:K", [thread("r1", 2)]), branch("lf:reviews:L", [thread("r2", 8)])]),
    ),
    lin(branch("lf:none", [thread("n1", 3), thread("n2", 7)])),
  ];

  test("sortTree keeps project and milestone order and sorts threads newest first", () => {
    const out = sortTree(tree());
    expect(ids(out)).toEqual(["lp:a", "lp:b", "lf:reviews", "lf:none"]);
    expect(ids(out[0].branches)).toEqual(["lm:m1", "lm:m2"]);
    expect(ids(out[0].branches[0].threads)).toEqual(["new", "old"]);
    expect(ids(out[3].threads)).toEqual(["n2", "n1"]);
  });

  test("sortTree sorts the Reviews subgroups newest first", () => {
    expect(ids(sortTree(tree())[2].branches)).toEqual(["lf:reviews:L", "lf:reviews:K"]);
  });

  const stacked = () =>
    lin(
      branch(
        "lp:s",
        [],
        [lin(branch("lm:m", [thread("p", 1)], [branch("lm:m:K", [thread("a", 3), thread("b", 2)], [], "st")]))],
      ),
    );

  test("sortTree keeps the stack key groups of a milestone in stack order, against recency", () => {
    const p = lin(
      branch(
        "lp:s",
        [],
        [
          lin(
            branch(
              "lm:m",
              [thread("p", 1)],
              [branch("lm:m:K1", [thread("a", 1)], [], "st"), branch("lm:m:K2", [thread("b", 9)], [], "st")],
            ),
          ),
        ],
      ),
    );
    expect(ids(sortTree([p])[0].branches[0].branches)).toEqual(["lm:m:K1", "lm:m:K2"]);
  });

  test("sortTree keeps the stack branches of a fallback group as is", () => {
    const fallback = (id: string) =>
      lin(
        branch(
          id,
          [],
          [
            branch(`${id}:K1`, [thread("a", 1), thread("c", 5)], [], "st"),
            branch(`${id}:K2`, [thread("b", 9)], [], "st"),
          ],
        ),
      );
    for (const id of ["lf:none", LINEAR_LOOSE]) {
      const [out] = sortTree([fallback(id)]);
      expect(ids(out.branches)).toEqual([`${id}:K1`, `${id}:K2`]);
      expect(ids(out.branches[0].threads)).toEqual(["a", "c"]);
    }
  });

  test("foldIds and pathFolds reach the rail of a stack in a milestone", () => {
    expect(foldIds(stacked())).toEqual(["lm:m", "rail:st"]);
    expect(pathFolds([stacked()], "b")).toEqual(["lp:s", "lm:m", "lm:m:K", "rail:st"]);
  });

  test("foldIds and pathFolds cover the milestones", () => {
    expect(foldIds(tree()[0])).toEqual(["lm:m1", "lm:m2"]);
    expect(pathFolds(tree(), "x")).toEqual(["lp:a", "lm:m2"]);
    expect(pathFolds(tree(), "n1")).toEqual(["lf:none"]);
  });
});

describe("Linear flat", () => {
  const lin = (b: Branch, date?: string): Branch => ({ ...b, label: b.id, linear: date ? { date } : {} });
  const named = (b: Branch, label: string): Branch => ({ ...b, label });
  const tree = (): Branch[] => [
    named(
      lin(
        branch(
          "lp:a",
          [],
          [
            named(lin(branch("lm:m1", [thread("old", 1), thread("new", 5, [thread("kid")])]), "2026-12-04"), "M1"),
            named(lin(branch("lm:a:none", [thread("x", 9)])), "No milestone"),
            named(lin(branch("lm:m9", [])), "Empty"),
          ],
        ),
      ),
      "P",
    ),
    named(
      lin(
        branch(
          "lf:reviews",
          [],
          [branch("lf:reviews:K", [thread("r1", 2)]), branch("lf:reviews:L", [thread("r2", 8)])],
        ),
      ),
      "Reviews",
    ),
    named(lin(branch("lf:none", [thread("n1", 3), thread("n2", 7)])), "No project"),
    named(lin(branch(LINEAR_LOOSE, [thread("k1", 4)])), ""),
  ];
  const seq = (shut: string[] = [], units = flatten(tree())) => sequence(units, "linear", new Set(shut), true, tree());
  const heads = (items: ReturnType<typeof seq>) =>
    items.flatMap((i) => (i.kind === "section" && i.label ? [`${i.label}|${i.count}|${i.date ?? ""}`] : []));

  test("flatten keeps the No project and keyless threads", () => {
    expect(ids(flatten(tree()))).toEqual(["t:old", "t:new", "t:x", "t:r1", "t:r2", "t:n1", "t:n2", "t:k1"]);
  });

  test("a stack in a milestone or in No project is one stack unit under its section", () => {
    const rail = (id: string, t: string) => branch(id, [thread(t, 4)], [], "st");
    const projects = [
      named(lin(branch("lp:s", [], [named(lin(branch("lm:m", [thread("p", 1)], [rail("lm:m:K", "a")])), "M")])), "P"),
      named(lin(branch("lf:none", [], [rail("lf:none:K", "n")])), "No project"),
    ];
    const units = flatten(projects);
    expect(units.map((u) => [u.kind, u.id])).toEqual([
      ["stack", "stack:lp:s:st"],
      ["thread", "t:p"],
      ["stack", "stack:lf:none:st"],
    ]);
    const items = sequence(units, "linear", new Set(), true, projects);
    expect(items.map((i) => (i.kind === "section" ? i.label : i.id))).toEqual([
      "P · M",
      "stack:lp:s:st",
      "t:p",
      "No project",
      "stack:lf:none:st",
    ]);
  });

  test("flatten marks every Reviews unit as review", () => {
    const review = flatten(tree()).flatMap((u) => (u.kind === "thread" ? [[u.t.id, u.review]] : []));
    expect(review.filter(([, r]) => r).map(([id]) => id)).toEqual(["r1", "r2"]);
  });

  test("flatten ignores a milestone named like a fallback", () => {
    const p = lin(branch("lp:z", [], [named(lin(branch("lm:z", [thread("w")])), REVIEWS)]));
    expect(flatten([p]).map((u) => u.kind === "thread" && u.review)).toEqual([false]);
  });

  test("sequence makes one section per milestone and fallback, in tree order, with counts and date", () => {
    expect(heads(seq())).toEqual(["P · M1|3|2026-12-04", "P · No milestone|1|", "Reviews|2|", "No project|2|"]);
  });

  test("keyless threads come last as loose rows: a section with no label that a fold never shuts", () => {
    const items = seq([LINEAR_LOOSE]);
    expect(items.at(-2)).toMatchObject({ kind: "section", key: LINEAR_LOOSE, label: "", open: true });
    expect(ids(items).at(-1)).toBe("t:k1");
    expect(flatLists(items).get(sectionList(LINEAR_LOOSE))).toEqual(["t:k1"]);
  });

  test("sequence keeps the unit order inside a section, for manual and updated sort", () => {
    const m1 = (units: ReturnType<typeof flatten>) => ids(seq([], units).slice(1, 3));
    expect(m1(flatten(tree()))).toEqual(["t:old", "t:new"]);
    expect(m1(sortFlat(flatten(tree())))).toEqual(["t:new", "t:old"]);
  });

  test("a shut section keeps its header and count, and no units", () => {
    const items = seq(["lm:m1"]);
    expect(heads(items)[0]).toBe("P · M1|3|2026-12-04");
    expect(ids(items)).not.toContain("t:old");
    expect(items[0]).toMatchObject({ kind: "section", open: false });
  });

  test("a Linear section has no statuses, so no context rows", () => {
    const items = seq();
    expect(items[0]).toMatchObject({ kind: "section", statuses: null });
    expect(sectionOf(items, items[1])).toBeNull();
  });

  test("flatLists has one list per section, all units under FLAT", () => {
    const lists = flatLists(seq());
    expect(lists.get(FLAT)).toHaveLength(8);
    expect(lists.get(sectionList("lm:m1"))).toEqual(["t:old", "t:new"]);
    expect(lists.get(sectionList("lf:reviews"))).toEqual(["t:r1", "t:r2"]);
  });

  test("sectionHolding finds the milestone of a subthread", () => {
    expect(sectionHolding(flatten(tree()), true, "kid", "linear", tree())).toBe("lm:m1");
    expect(sectionHolding(flatten(tree()), true, "zz", "linear", tree())).toBeNull();
  });
});

describe("runs in the flat view", () => {
  const runNode = (id: string, status: Status, children: ThreadNode[] = []): ThreadNode => ({
    ...thread(id, null, children, status),
    run: { runId: id, workflow: "w", state: "running", steps: [], detail: null },
  });
  const secOf = (units: ReturnType<typeof flatten>, id: string) =>
    sections(units).find((s) => s.units.some((u) => u.id === `t:${id}`))?.key;
  const units = (...threads: ThreadNode[]) => flatten([project("p", [branch("g", threads)])]);

  test("a run with an open question goes to Needs input, even with a working step thread", () => {
    expect(secOf(units(runNode("r", "needs-input", [thread("s", null, [], "working")])), "r")).toBe("needs-input");
  });

  test("a child run with an open question places the unit", () => {
    const child = runNode("c", "needs-input");
    expect(secOf(units(runNode("r", "working", [child, thread("s", null, [], "working")])), "r")).toBe("needs-input");
  });

  test("a running run alone goes to Working", () => {
    expect(secOf(units(runNode("r", "working")), "r")).toBe("working");
  });

  test("a running run with a needs-input step thread goes to Needs input", () => {
    expect(secOf(units(runNode("r", "working", [thread("s", null, [], "needs-input")])), "r")).toBe("needs-input");
  });

  test("the header count leaves the run node out", () => {
    const [head] = sequence(units(runNode("r", "working", [thread("s", null, [], "working")])), "status");
    expect(head).toMatchObject({ kind: "section", key: "working", count: 1 });
  });

  test("linearSections keeps a run unit, also in a Reviews subgroup", () => {
    const lin = (b: Branch): Branch => ({ ...b, linear: {} });
    const projects = [
      lin(branch("lp:a", [], [lin(branch("lm:m1", [runNode("r", "working")]))])),
      lin(branch("lf:reviews", [], [branch("lf:reviews:K", [runNode("v", "working")])])),
    ];
    const items = sequence(flatten(projects), "linear", new Set(), true, projects);
    expect(items.filter((i) => i.kind === "thread").map((i) => i.id)).toEqual(["t:r", "t:v"]);
  });
});
