import { expect, test } from "bun:test";

import { choiceLabels, nextWeekdayAt9, pick } from "../workflows/lib/catch-up-rules.ts";

const next = (y: number, m: number, d: number, h: number) => nextWeekdayAt9(new Date(y, m - 1, d, h));
const at9 = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();

test("nextWeekdayAt9 takes the next day on Monday to Thursday", () => {
  expect(next(2026, 11, 30, 8).getTime()).toBe(at9(2026, 12, 1));
});

test("nextWeekdayAt9 skips the weekend", () => {
  expect(next(2026, 12, 4, 10).getTime()).toBe(at9(2026, 12, 7));
  expect(next(2026, 12, 5, 10).getTime()).toBe(at9(2026, 12, 7));
  expect(next(2026, 12, 6, 10).getTime()).toBe(at9(2026, 12, 7));
});

test("pick maps each choice to the ids to settle and snooze", () => {
  const done = ["a", "b"];
  const waiting = ["c"];
  expect(pick(0, done, waiting)).toEqual({ settle: done, snooze: waiting });
  expect(pick(1, done, waiting)).toEqual({ settle: done, snooze: [] });
  expect(pick(2, done, waiting)).toEqual({ settle: [], snooze: ["a", "b", "c"] });
  expect(pick(3, done, waiting)).toEqual({ settle: [], snooze: [] });
});

test("choiceLabels has four unique labels", () => {
  const labels = choiceLabels(2, 1, "Tue Dec 01 2026");
  expect(new Set(labels).size).toBe(4);
  expect(labels[2]).toContain("3");
});
