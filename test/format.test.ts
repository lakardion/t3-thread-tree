import { describe, expect, test } from "bun:test";
import { ago, folded, phraseWith, stripKey } from "../src/page/format.ts";
import type { Branch, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const before = (sec: number) => new Date(NOW - sec * 1000).toISOString();

describe("ago", () => {
  test.each([
    [0, "now"],
    [59, "now"],
    [60, "1m"],
    [59 * 60, "59m"],
    [60 * 60, "1h"],
    [23 * 3600, "23h"],
    [24 * 3600, "1d"],
    [-300, "now"],
  ])("%i s ago is %s", (sec, out) => {
    expect(ago(before(sec), NOW)).toBe(out);
  });
});

describe("phraseWith", () => {
  test("adds the time after the phrase", () => {
    expect(phraseWith({ status: "working", phrase: "Working", since: before(720) }, NOW)).toBe("Working 12m");
  });
  test("separates the time with a dot on needs-input", () => {
    expect(phraseWith({ status: "needs-input", phrase: "Approval", since: before(180) }, NOW)).toBe("Approval · 3m");
  });
  test("returns the phrase with no since", () => {
    expect(phraseWith({ status: "done", phrase: "Done", since: null }, NOW)).toBe("Done");
  });
});

describe("stripKey", () => {
  test.each([
    ["SHOP-412 · Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412: Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412 - Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412 Checkout", "SHOP-412", "Checkout"],
    ["Review #2088 SHOP-398", "SHOP-398", "Review #2088 SHOP-398"],
    ["SHOP-412", "SHOP-412", "SHOP-412"],
  ])("%s", (title, key, out) => {
    expect(stripKey(title, key)).toBe(out);
  });
});

describe("folded", () => {
  const thread = (key: string | null) => ({ id: `t-${key}`, key }) as ThreadNode;
  const group = (label: string, threads: ThreadNode[], branches: Branch[] = []): Branch => ({ id: label, label, branches, threads });

  test("a key group with one thread folds into it", () => {
    const t = thread("SHOP-1");
    expect(folded(group("SHOP-1", [t]))).toBe(t);
  });
  test("a key group with two threads does not fold", () => {
    expect(folded(group("SHOP-1", [thread("SHOP-1"), thread("SHOP-1")]))).toBeNull();
  });
  test("No issue key does not fold", () => {
    expect(folded(group("No issue key", [thread(null)]))).toBeNull();
  });
  test("a group with branches and no threads does not fold", () => {
    expect(folded(group("Reviews", [], [group("SHOP-1", [thread("SHOP-1")])]))).toBeNull();
  });
});
