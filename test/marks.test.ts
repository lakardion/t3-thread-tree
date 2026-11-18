import { describe, expect, test } from "bun:test";

import {
  changedLines,
  foldHead,
  hasMore,
  hhmm,
  markOf,
  markRows,
  shortRows,
  type BriefAction,
  type Mark,
  type Snapshot,
} from "../src/shared/brief.ts";
import type { PrNode, ThreadNode } from "../src/shared/tree.ts";

const AT = "2026-11-13T12:00:00.000Z";
const SINCE = "2026-11-13T10:00:00.000Z";

const node = (id: string, over: Partial<ThreadNode> = {}) =>
  ({ id, title: `Thread ${id}`, status: "your-turn", since: null, settled: false, prs: [], ...over }) as ThreadNode;
const pr = (over: Partial<PrNode> = {}) =>
  ({ n: 12, state: "open", draft: false, checks: "passing", review: null, conflicting: false, ...over }) as PrNode;
const act = (kind: BriefAction["kind"], ids: string[], prNumber?: number): BriefAction => ({
  kind,
  title: kind,
  reason: "r",
  threadIds: ids,
  prompt: null,
  ...(prNumber && { pr: prNumber }),
});
const liveOf = (...nodes: ThreadNode[]) => new Map(nodes.map((n) => [n.id, n]));
const snap = (statuses: Snapshot["statuses"] = {}, since: Snapshot["since"] = {}): Snapshot => ({ statuses, since });

describe("markOf answer", () => {
  const waiting = node("A", { status: "needs-input", since: SINCE });
  test("open while the thread waits; done when it stops or leaves", () => {
    expect(markOf(act("answer", ["A"]), liveOf(waiting), snap({}, { A: SINCE }))).toBeNull();
    expect(markOf(act("answer", ["A"]), liveOf(node("A")), snap())).toBe("done");
    expect(markOf(act("answer", ["A"]), liveOf(), snap())).toBe("done");
    expect(markOf(act("answer", ["A"]), liveOf(node("A", { settled: true })), snap())).toBe("done");
  });
  test("changed when it still waits but since moved", () => {
    expect(markOf(act("answer", ["A"]), liveOf(waiting), snap({}, { A: "2026-11-13T09:00:00.000Z" }))).toBe("changed");
  });
  test("changed when the status moved with the same since", () => {
    const plan = node("A", { status: "plan-ready", since: SINCE });
    expect(markOf(act("answer", ["A"]), liveOf(plan), snap({ A: "needs-input" }, { A: SINCE }))).toBe("changed");
  });
  test("done wins over changed", () => {
    expect(markOf(act("answer", ["A"]), liveOf(node("A", { since: SINCE })), snap({}, { A: null }))).toBe("done");
  });
});

describe("markOf fix and merge", () => {
  const on = (over: Partial<PrNode>) => liveOf(node("A", { prs: [pr(over)] }));
  test("fix is done when checks pass, when merged and when the PR is gone; open while broken", () => {
    const fix = act("fix", ["A"], 12);
    expect(markOf(fix, on({ checks: "failing" }), snap())).toBeNull();
    expect(markOf(fix, on({ conflicting: true }), snap())).toBeNull();
    expect(markOf(fix, on({ review: "changes-requested" }), snap())).toBeNull();
    expect(markOf(fix, on({}), snap())).toBe("done");
    expect(markOf(fix, on({ state: "merged", checks: "failing" }), snap())).toBe("done");
    expect(markOf(fix, liveOf(node("A")), snap())).toBe("done");
  });
  test("merge is done when merged or closed or gone; open while open", () => {
    const merge = act("merge", ["A"], 12);
    expect(markOf(merge, on({}), snap())).toBeNull();
    expect(markOf(merge, on({ state: "merged" }), snap())).toBe("done");
    expect(markOf(merge, on({ state: "closed" }), snap())).toBe("done");
    expect(markOf(merge, liveOf(node("A")), snap())).toBe("done");
  });
  test("they are never changed", () => {
    expect(markOf(act("fix", ["A"], 12), on({ checks: "failing" }), snap({ A: "done" }))).toBeNull();
  });
});

describe("markOf model kinds", () => {
  test("changed when a linked status differs from the snapshot; open when the same", () => {
    expect(markOf(act("review", ["A"]), liveOf(node("A")), snap({ A: "your-turn" }))).toBeNull();
    expect(markOf(act("review", ["A"]), liveOf(node("A")), snap({ A: "failed" }))).toBe("changed");
  });
  test("done when every linked thread is gone or settled; with one gone the live one decides", () => {
    expect(markOf(act("clean-up", ["A", "B"]), liveOf(node("B", { settled: true })), snap())).toBe("done");
    expect(markOf(act("unblock", ["A", "B"]), liveOf(node("B")), snap({ B: "your-turn" }))).toBeNull();
    expect(markOf(act("unblock", ["A", "B"]), liveOf(node("B")), snap({ B: "failed" }))).toBe("changed");
  });
});

describe("markRows", () => {
  test("open, then changed, then done; stable inside each; keeps the brief place", () => {
    const actions = [act("answer", ["D1"]), act("review", ["C1"]), act("review", ["O1"]), act("answer", ["D2"])];
    const live = liveOf(node("D1"), node("C1"), node("O1"), node("D2"));
    const rows = markRows(actions, live, snap({ C1: "failed", O1: "your-turn" }));
    expect(rows.map((r) => [r.i, r.mark])).toEqual([
      [2, null],
      [1, "changed"],
      [0, "done"],
      [3, "done"],
    ]);
  });
});

const rowsOf = (...marks: (Mark | null)[]) => marks.map((mark, i) => ({ a: act("review", [`T${i}`]), i, mark }));

describe("shortRows", () => {
  test("the first 3 open rows", () => {
    expect(shortRows(rowsOf(null, null, null, null, null), false).map((r) => r.i)).toEqual([0, 1, 2]);
  });
  test("marked rows stay behind", () => {
    expect(shortRows(rowsOf(null, null, "changed", "done"), false).map((r) => r.i)).toEqual([0, 1]);
    expect(shortRows(rowsOf("changed", "done"), false)).toEqual([]);
  });
  test("all shows every row in order", () => {
    expect(shortRows(rowsOf(null, "changed", "done", null), true).map((r) => r.i)).toEqual([0, 1, 2, 3]);
  });
});

describe("hasMore", () => {
  test("more than 3 rows or any marked row", () => {
    expect(hasMore(rowsOf(null, null, null))).toBe(false);
    expect(hasMore(rowsOf(null, null, null, null))).toBe(true);
    expect(hasMore(rowsOf(null, null, "done"))).toBe(true);
    expect(hasMore(rowsOf(null, null, "changed"))).toBe(true);
  });
});

describe("foldHead", () => {
  test("counts Actions, then done and changed", () => {
    const marks: (Mark | null)[] = [...Array(6).fill(null), "done", "done", "done", "changed"];
    expect(foldHead(rowsOf(...marks))).toBe("10 Actions · 3 done · 1 changed");
  });
  test("leaves out zero parts and uses the singular", () => {
    expect(foldHead(rowsOf(null, null, null, null))).toBe("4 Actions");
    expect(foldHead(rowsOf("done"))).toBe("1 Action · 1 done");
  });
});

describe("changedLines", () => {
  test("one line per live linked thread whose status differs", () => {
    const live = liveOf(node("A", { status: "failed" }), node("B"));
    const a = act("review", ["A", "B", "C"]);
    expect(changedLines(a, live, snap({ A: "working", B: "your-turn" }), AT)).toEqual([
      `Changed since ${hhmm(AT)}: Thread A was working, now failed`,
    ]);
  });
});
