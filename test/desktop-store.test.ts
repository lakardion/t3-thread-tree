import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseBounds,
  parseNeedsYou,
  parseNotify,
  parseOpenNext,
  parseSettings,
  readJson,
  writeJson,
} from "../src/desktop/store.ts";

const screens = [
  { x: 0, y: 0, width: 1000, height: 800 },
  { x: 1000, y: 0, width: 1000, height: 800 },
];

describe("parseSettings", () => {
  test("defaults when empty", () => {
    expect(parseSettings(undefined)).toEqual({ muted: false });
  });
  test("keeps a boolean", () => {
    expect(parseSettings({ muted: true })).toEqual({ muted: true });
  });
  test("takes the default for a wrong type", () => {
    expect(parseSettings({ muted: "yes" })).toEqual({ muted: false });
  });
});

describe("parseNotify", () => {
  const thread = { kind: "thread", threadId: "t", environmentId: "e", title: "T", status: "failed" } as const;
  test("round-trips events and drops extra fields", () => {
    expect(
      parseNotify([
        { ...thread, extra: 1 },
        { kind: "summary", count: 3, extra: 1 },
      ]),
    ).toEqual([thread, { kind: "summary", count: 3 }]);
    expect(parseNotify([])).toEqual([]);
  });
  test("rejects bad input", () => {
    const bad: unknown[] = [
      "x",
      Array.from({ length: 11 }, () => thread),
      [{ ...thread, kind: "other" }],
      [{ ...thread, status: "working" }],
      [{ ...thread, title: 1 }],
      [{ kind: "summary", count: 0 }],
      [{ kind: "summary", count: 1.5 }],
    ];
    for (const raw of bad) expect(parseNotify(raw)).toBeNull();
  });
});

describe("parseOpenNext", () => {
  test("accepts a string and null", () => {
    expect(parseOpenNext("Title")).toBe("Title");
    expect(parseOpenNext(null)).toBeNull();
  });
  test("rejects a number and a too-long string", () => {
    expect(parseOpenNext(1)).toBeUndefined();
    expect(parseOpenNext("x".repeat(501))).toBeUndefined();
  });
});

describe("parseBounds", () => {
  test("is empty for junk or zero size", () => {
    expect(parseBounds("x", screens)).toEqual({});
    expect(parseBounds({ x: 0, y: 0, width: 0, height: 500 }, screens)).toEqual({});
  });
  test("keeps an on-screen rect whole", () => {
    const r = { x: 10, y: 20, width: 300, height: 400 };
    expect(parseBounds(r, screens)).toEqual(r);
  });
  test("drops the position of a rect off all screens", () => {
    expect(parseBounds({ x: 5000, y: 5000, width: 300, height: 400 }, screens)).toEqual({ width: 300, height: 400 });
  });
  test("keeps a rect on the second screen", () => {
    const r = { x: 1200, y: 50, width: 300, height: 400 };
    expect(parseBounds(r, screens)).toEqual(r);
  });
});

describe("readJson and writeJson", () => {
  const dir = mkdtempSync(join(tmpdir(), "desktop-store-"));
  test("round trips a value", () => {
    const file = join(dir, "a.json");
    writeJson(file, { a: 1 });
    expect(readJson(file)).toEqual({ a: 1 });
  });
  test("is undefined for a missing file", () => {
    expect(readJson(join(dir, "missing.json"))).toBeUndefined();
  });
  test("is undefined for bad JSON", () => {
    const file = join(dir, "bad.json");
    writeFileSync(file, "{nope");
    expect(readJson(file)).toBeUndefined();
  });
});

describe("parseNeedsYou", () => {
  const item = {
    id: "a",
    title: "t",
    environmentId: "e",
    since: "2026-11-12T12:00:00.000Z",
    status: "needs-input" as const,
  };
  test("round-trips a valid list and drops extra fields", () => {
    expect(
      parseNeedsYou([
        { ...item, extra: 1 },
        { ...item, since: null },
      ]),
    ).toEqual([item, { ...item, since: null }]);
  });
  test("accepts 500 items and rejects 501", () => {
    expect(parseNeedsYou(Array.from({ length: 500 }, () => item))).toHaveLength(500);
    expect(parseNeedsYou(Array.from({ length: 501 }, () => item))).toBeNull();
  });
  test("rejects a non-array, a non-string field and a numeric since", () => {
    expect(parseNeedsYou("x")).toBeNull();
    expect(parseNeedsYou([{ ...item, id: 1 }])).toBeNull();
    expect(parseNeedsYou([{ ...item, since: 5 }])).toBeNull();
    expect(parseNeedsYou([null])).toBeNull();
  });
  test("rejects a missing or other status", () => {
    expect(parseNeedsYou([{ ...item, status: undefined }])).toBeNull();
    expect(parseNeedsYou([{ ...item, status: "failed" }])).toBeNull();
  });
});
