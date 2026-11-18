import { describe, expect, test } from "bun:test";

import { nextStop, refocusIndex, stopsIn } from "../src/page/stops.ts";

type Fake = { id: string; skip?: boolean; hidden?: boolean };
const root = (els: Fake[]) =>
  ({
    querySelectorAll: () =>
      els.map((e) => ({ id: e.id, closest: () => (e.skip ? {} : null), checkVisibility: () => !e.hidden })),
  }) as unknown as ParentNode;

describe("stopsIn", () => {
  test("keeps the DOM order and drops inert, closing and hidden rows", () => {
    const stops = stopsIn(
      root([{ id: "a" }, { id: "inert", skip: true }, { id: "b" }, { id: "hid", hidden: true }, { id: "c" }]),
    );
    expect(stops.map((s) => (s as unknown as Fake).id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextStop", () => {
  test("moves in the middle and stops at both ends", () => {
    expect(nextStop(3, 1, 1)).toBe(2);
    expect(nextStop(3, 1, -1)).toBe(0);
    expect(nextStop(3, 2, 1)).toBeNull();
    expect(nextStop(3, 0, -1)).toBeNull();
  });
});

describe("refocusIndex", () => {
  test("follows an id that moved", () => {
    expect(refocusIndex(["b", "c", "a"], { id: "a", index: 0 })).toBe(2);
  });
  test("picks the nearest of duplicate ids", () => {
    expect(refocusIndex(["a", "x", "x", "a"], { id: "a", index: 2 })).toBe(3);
  });
  test("falls back to the old index when the id left, clamped to the end", () => {
    expect(refocusIndex(["a", "b", "c"], { id: "gone", index: 1 })).toBe(1);
    expect(refocusIndex(["a", "b"], { id: "gone", index: 5 })).toBe(1);
  });
  test("is -1 with no stops", () => {
    expect(refocusIndex([], { id: "a", index: 0 })).toBe(-1);
  });
});
