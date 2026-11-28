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
    { id: "lineage", on: true },
    { id: "review", on: true },
    { id: "stack", on: true },
    { id: "key", on: true },
  ];
  const parse = (v: unknown) => ruleList().parse(JSON.stringify(v));

  test("nothing stored: the defaults", () => {
    expect(ruleList().parse(null)).toEqual(defaults);
  });

  test("round-trips an order and its switches", () => {
    const c = ruleList();
    const rules: Rule[] = [
      { id: "lineage", on: false },
      { id: "key", on: true },
      { id: "stack", on: false },
      { id: "review", on: true },
    ];
    expect(c.parse(c.format(rules))).toEqual(rules);
  });

  test("bad JSON or a non-array reads as the defaults", () => {
    expect(ruleList().parse("{")).toEqual(defaults);
    expect(ruleList().parse("{}")).toEqual(defaults);
  });

  test("unknown and repeated ids drop, a bad switch reads as the default, missing ids go last", () => {
    expect(
      parse([
        { id: "x", on: true },
        { id: "key", on: false },
        { id: "key", on: true },
        { id: "review", on: 1 },
      ]),
    ).toEqual([
      { id: "lineage", on: true },
      { id: "key", on: false },
      { id: "review", on: true },
      { id: "stack", on: true },
    ]);
  });

  test("lineage is forced first", () => {
    expect(
      ids(
        parse([
          { id: "key", on: true },
          { id: "lineage", on: true },
        ]),
      ),
    ).toEqual(["lineage", "key", "review", "stack"]);
  });

  describe("migration", () => {
    test("a stored map reads as lineage at the first place", () => {
      expect(
        parse([
          { id: "map", on: true },
          { id: "review", on: true },
        ])[0],
      ).toEqual({ id: "lineage", on: true });
      expect(
        parse([
          { id: "review", on: true },
          { id: "map", on: false },
        ]),
      ).toEqual([
        { id: "lineage", on: false },
        { id: "review", on: true },
        { id: "stack", on: true },
        { id: "key", on: true },
      ]);
    });

    test("map off and nest on: lineage on", () => {
      expect(
        parse([
          { id: "map", on: false },
          { id: "nest", on: true },
        ])[0],
      ).toEqual({ id: "lineage", on: true });
    });

    test("map and nest both off: lineage off", () => {
      expect(
        parse([
          { id: "map", on: false },
          { id: "nest", on: false },
        ])[0],
      ).toEqual({ id: "lineage", on: false });
    });

    test("only nest stored: lineage follows it", () => {
      expect(parse([{ id: "nest", on: false }])[0]).toEqual({ id: "lineage", on: false });
      expect(parse([{ id: "nest", on: true }])[0]).toEqual({ id: "lineage", on: true });
    });

    test("nest drops", () => {
      expect(
        ids(
          parse([
            { id: "nest", on: true },
            { id: "map", on: true },
          ]),
        ),
      ).toEqual(["lineage", "review", "stack", "key"]);
    });
  });
});

describe("rulesParam", () => {
  test("joins the ids that are on, in order; none gives an empty text", () => {
    expect(
      rulesParam([
        { id: "lineage", on: true },
        { id: "key", on: false },
        { id: "review", on: true },
      ]),
    ).toBe("lineage,review");
    expect(rulesParam([{ id: "lineage", on: false }])).toBe("");
  });
});
