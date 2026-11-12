import { describe, expect, test } from "bun:test";
import { ago, phraseWith } from "../src/page/format.ts";

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
