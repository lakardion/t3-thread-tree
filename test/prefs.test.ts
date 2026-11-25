import { describe, expect, test } from "bun:test";

import { flag, idSet, oneOf, ruleList, rulesParam, type Rule } from "../src/page/prefs.ts";

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

describe("ruleList", () => {
  const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
  const defaults: Rule[] = [
    { id: "map", on: true },
    { id: "review", on: true },
    { id: "stack", on: true },
    { id: "key", on: true },
    { id: "nest", on: false },
  ];

  test("nothing stored: the defaults, with Launch nesting on for the legacy flag", () => {
    expect(ruleList(false).parse(null)).toEqual(defaults);
    expect(
      ruleList(true)
        .parse(null)
        .find((r) => r.id === "nest")!.on,
    ).toBe(true);
  });

  test("round-trips an order and its switches", () => {
    const c = ruleList(false);
    const rules: Rule[] = [
      { id: "map", on: false },
      { id: "key", on: true },
      { id: "stack", on: false },
      { id: "review", on: true },
      { id: "nest", on: true },
    ];
    expect(c.parse(c.format(rules))).toEqual(rules);
  });

  test("a stored value ignores the legacy flag", () => {
    expect(ruleList(true).parse(JSON.stringify(defaults))).toEqual(defaults);
  });

  test("bad JSON or a non-array reads as the defaults", () => {
    expect(ruleList(false).parse("{")).toEqual(defaults);
    expect(ruleList(false).parse("{}")).toEqual(defaults);
  });

  test("unknown and repeated ids drop, a bad switch reads as the default, missing ids go last", () => {
    const rs = ruleList(false).parse(
      '[{"id":"x","on":true},{"id":"key","on":false},{"id":"key","on":true},{"id":"review","on":1}]',
    );
    expect(rs).toEqual([
      { id: "map", on: true },
      { id: "key", on: false },
      { id: "review", on: true },
      { id: "stack", on: true },
      { id: "nest", on: false },
    ]);
  });

  test("map is forced first and nest last", () => {
    const rs = ruleList(false).parse('[{"id":"nest","on":true},{"id":"key","on":true},{"id":"map","on":true}]');
    expect(ids(rs)).toEqual(["map", "key", "review", "stack", "nest"]);
  });
});

describe("rulesParam", () => {
  test("joins the ids that are on, in order; none gives an empty text", () => {
    expect(
      rulesParam([
        { id: "map", on: true },
        { id: "key", on: false },
        { id: "review", on: true },
      ]),
    ).toBe("map,review");
    expect(rulesParam([{ id: "map", on: false }])).toBe("");
  });
});
