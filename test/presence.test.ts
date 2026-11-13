import { describe, expect, test } from "bun:test";

import { merge, type Entry } from "../src/page/presence.tsx";

const id = (s: string) => s;
const shown = (...keys: string[]): Entry<string>[] => keys.map((key) => ({ key, item: key }));

describe("merge", () => {
  test("a new item is added with enter", () => {
    expect(merge(shown("a", "b"), ["a", "b", "c"], id, true)).toEqual([
      { key: "a", item: "a" },
      { key: "b", item: "b" },
      { key: "c", item: "c", phase: "enter" },
    ]);
  });

  test("a removed item keeps its slot with leave and its last data", () => {
    const out = merge(shown("a", "b", "c"), ["a", "c"], id, true);
    expect(out.map((e) => [e.key, e.phase])).toEqual([
      ["a", undefined],
      ["b", "leave"],
      ["c", undefined],
    ]);
    expect(out[1].item).toBe("b");
  });

  test("a removed first item stays first", () => {
    expect(merge(shown("a", "b"), ["b"], id, true).map((e) => e.key)).toEqual(["a", "b"]);
  });

  test("two removed neighbours stay in order", () => {
    expect(merge(shown("a", "b", "c", "d"), ["a", "d"], id, true).map((e) => e.key)).toEqual(["a", "b", "c", "d"]);
  });

  test("an item that returns during its leave becomes enter", () => {
    const leaving = merge(shown("a", "b"), ["a"], id, true);
    const back = merge(leaving, ["a", "b"], id, true);
    expect(back.map((e) => [e.key, e.phase])).toEqual([
      ["a", undefined],
      ["b", "enter"],
    ]);
  });

  test("without animate, a removed item drops and no entry has a phase", () => {
    const out = merge(shown("a", "b"), ["b", "c"], id, false);
    expect(out.map((e) => [e.key, e.phase])).toEqual([
      ["b", undefined],
      ["c", undefined],
    ]);
  });

  test("a reorder keeps the current order", () => {
    expect(merge(shown("a", "b", "c"), ["c", "a", "b"], id, true).map((e) => e.key)).toEqual(["c", "a", "b"]);
  });
});
