import { describe, expect, test } from "bun:test";

import { moveRule, ruleChanges } from "../src/page/grouping.ts";
import type { Rule } from "../src/page/prefs.ts";

const base = (): Rule[] => [
  { id: "map", on: true },
  { id: "review", on: true },
  { id: "stack", on: true },
  { id: "key", on: true },
  { id: "nest", on: false },
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

  test("each off rule and nest on give one line", () => {
    const lines = {
      map: "Map members leave their map and go to the next rule.",
      review: "Review threads go to their stack or key group, or stay loose.",
      stack: "Stacked threads no longer group by stack.",
      key: "Threads with a key no longer group by key.",
    };
    for (const [id, line] of Object.entries(lines))
      expect(ruleChanges(set(base(), id as Rule["id"], false), false)).toEqual([line]);
    expect(ruleChanges(set(base(), "nest", true), false)).toEqual(["Launched threads nest under their spawner."]);
  });
});

describe("moveRule", () => {
  test("moves among the middle rules and keeps map first and nest last", () => {
    expect(ids(moveRule(base(), 0, 2))).toEqual(["map", "stack", "key", "review", "nest"]);
  });
});
