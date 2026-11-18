import { describe, expect, test } from "bun:test";

import { addFocus, focusDrop, parseFocus, pruneFocus, removeFocus, replaceFocus } from "../src/page/focus.ts";

const live = (settled: string[] = [], ids = ["a", "b", "c", "d"]) =>
  new Map(ids.map((id) => [id, { settled: settled.includes(id) }]));

describe("addFocus", () => {
  test("appends", () => expect(addFocus(["a"], "b")).toEqual(["a", "b"]));
  test("holds at most 3", () => {
    const full = ["a", "b", "c"];
    expect(addFocus(full, "d")).toBe(full);
  });
  test("ignores a listed id", () => {
    const ids = ["a", "b"];
    expect(addFocus(ids, "a")).toBe(ids);
  });
});

describe("removeFocus", () => {
  test("closes the gap", () => expect(removeFocus(["a", "b", "c"], "b")).toEqual(["a", "c"]));
});

describe("replaceFocus", () => {
  test("puts the id at the slot", () => expect(replaceFocus(["a", "b", "c"], 1, "d")).toEqual(["a", "d", "c"]));
  test("ignores a listed id", () => {
    const ids = ["a", "b", "c"];
    expect(replaceFocus(ids, 1, "c")).toBe(ids);
  });
});

describe("pruneFocus", () => {
  test("drops settled and deleted threads", () =>
    expect(pruneFocus(["a", "b", "x"], live(["b"]), "up")).toEqual(["a"]));
  test("returns the same array when nothing drops", () => {
    const ids = ["a", "b"];
    expect(pruneFocus(ids, live(), "up")).toBe(ids);
  });
  test("keeps the list when the tree is not live", () => {
    const ids = ["a", "x"];
    for (const conn of ["down", "connecting", "no-token", "unauthorized"] as const)
      expect(pruneFocus(ids, live(["a"]), conn)).toBe(ids);
  });
});

describe("parseFocus", () => {
  test("reads a good list", () => expect(parseFocus('["a","b"]')).toEqual(["a", "b"]));
  test("reads no value as empty", () => expect(parseFocus(null)).toEqual([]));
  test("rejects bad input", () => {
    for (const raw of ["", "nope", "{}", '[1,"a"]', '"a"']) expect(parseFocus(raw)).toEqual([]);
  });
  test("rejects more than 3 ids", () => expect(parseFocus('["a","b","c","d"]')).toEqual([]));
  test("round trips", () => {
    const ids = ["a", "b", "c"];
    expect(parseFocus(JSON.stringify(ids))).toEqual(ids);
  });
});

describe("focusDrop", () => {
  const map = live(["s"], ["a", "b", "d", "s"]);
  test("adds on an empty slot", () => expect(focusDrop(["a"], map, 1, "d")).toBe("add"));
  test("asks on a filled slot with a live thread", () => expect(focusDrop(["a", "b"], map, 0, "d")).toBe("ask"));
  test("ignores a listed id", () => expect(focusDrop(["a", "b"], map, 1, "a")).toBeNull());
  test("ignores a settled id", () => expect(focusDrop(["a"], map, 1, "s")).toBeNull());
  test("ignores an unknown or non-string id", () => {
    expect(focusDrop(["a"], map, 1, "x")).toBeNull();
    expect(focusDrop(["a"], map, 1, 5)).toBeNull();
    expect(focusDrop(["a"], map, 1, undefined)).toBeNull();
  });
  test("ignores a filled slot whose thread is not loaded", () => expect(focusDrop(["x"], map, 0, "d")).toBeNull());
});
