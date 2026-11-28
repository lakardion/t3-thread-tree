import { describe, expect, test } from "bun:test";

import { moveRule, ruleChanges } from "../src/page/grouping.ts";
import type { Rule } from "../src/page/prefs.ts";

const base = (): Rule[] => [
  { id: "lineage", on: true },
  { id: "review", on: true },
  { id: "stack", on: true },
  { id: "key", on: true },
];
const ids = (rs: Rule[]) => rs.map((r) => r.id);
const set = (rs: Rule[], id: Rule["id"], on: boolean) => rs.map((r) => (r.id === id ? { ...r, on } : r));

describe("ruleChanges", () => {
  test("the default gives no line", () => expect(ruleChanges(base(), false)).toEqual([]));

  test("Reviews below PR stack", () => {
    const rs = moveRule(base(), 0, 1);
    expect(ruleChanges(rs, false)).toEqual(["A review thread in a PR stack shows in its stack, not in Reviews."]);
  });

  test("Issue key above PR stack differs for Linear", () => {
    const rs = moveRule(base(), 2, 1);
    expect(ruleChanges(rs, false)[0]).toContain("its key group");
    expect(ruleChanges(rs, true)[0]).toContain("its own milestone");
  });

  test("a swap with one rule off gives no swap line", () => {
    expect(ruleChanges(set(moveRule(base(), 0, 1), "review", false), false)).toHaveLength(1);
    expect(ruleChanges(set(moveRule(base(), 2, 1), "stack", false), false)).toHaveLength(1);
  });

  test("each off rule gives one line", () => {
    const lines = {
      lineage: "Launched threads no longer group under the thread that started them.",
      review: "Review threads go to their stack or key group, or stay loose.",
      stack: "Stacked threads no longer group by stack.",
      key: "Threads with a key no longer group by key.",
    };
    for (const [id, line] of Object.entries(lines))
      expect(ruleChanges(set(base(), id as Rule["id"], false), false)).toEqual([line]);
  });
});

describe("moveRule", () => {
  test("moves among the last three rules and keeps lineage first", () => {
    expect(ids(moveRule(base(), 0, 2))).toEqual(["lineage", "stack", "key", "review"]);
  });
});
