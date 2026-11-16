import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseBounds, parseSettings, readJson, writeJson } from "../src/desktop/store.ts";

const screens = [
  { x: 0, y: 0, width: 1000, height: 800 },
  { x: 1000, y: 0, width: 1000, height: 800 },
];

describe("parseSettings", () => {
  test("defaults when empty", () => {
    expect(parseSettings(undefined)).toEqual({ alwaysOnTop: false });
  });
  test("keeps a boolean", () => {
    expect(parseSettings({ alwaysOnTop: true })).toEqual({ alwaysOnTop: true });
  });
  test("takes the default for a wrong type", () => {
    expect(parseSettings({ alwaysOnTop: "yes" })).toEqual({ alwaysOnTop: false });
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
