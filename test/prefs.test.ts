import { describe, expect, test } from "bun:test";

import { flag, idSet, oneOf } from "../src/page/prefs.ts";

describe("flag", () => {
  test("reads the default when nothing is stored", () => {
    expect(flag(true).parse(null)).toBe(true);
    expect(flag(false).parse(null)).toBe(false);
  });
  test("reads 1 and 0, and other text as the opposite of the default", () => {
    expect(flag(true).parse("0")).toBe(false);
    expect(flag(true).parse("x")).toBe(true);
    expect(flag(false).parse("1")).toBe(true);
    expect(flag(false).parse("x")).toBe(false);
  });
  test("writes 1 and 0", () => {
    expect(flag(true).format(true)).toBe("1");
    expect(flag(true).format(false)).toBe("0");
  });
});

describe("oneOf", () => {
  const c = oneOf(["tree", "flat"] as const, "tree");
  test("reads a known value, and anything else as the fallback", () => {
    expect(c.parse("flat")).toBe("flat");
    expect(c.parse("grid")).toBe("tree");
    expect(c.parse(null)).toBe("tree");
  });
});

describe("idSet", () => {
  test("round-trips a set", () => {
    const c = idSet();
    expect(c.parse(c.format(new Set(["a", "b"])))).toEqual(new Set(["a", "b"]));
  });
  test("reads the fallback for nothing, bad JSON or a non-array, and drops non-strings", () => {
    const c = idSet(["idle"]);
    expect(c.parse(null)).toEqual(new Set(["idle"]));
    expect(c.parse("{")).toEqual(new Set(["idle"]));
    expect(c.parse("{}")).toEqual(new Set(["idle"]));
    expect(c.parse('["a", 1]')).toEqual(new Set(["a"]));
  });
});
