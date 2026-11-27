import { describe, expect, test } from "bun:test";

import { isGraphMember, parseScope } from "../src/shared/pr-graph-data.ts";

describe("parseScope", () => {
  test("all", () => {
    expect(parseScope("all")).toEqual({ kind: "all" });
  });
  test("project ids, also none", () => {
    expect(parseScope("project:p1")).toEqual({ kind: "project", id: "p1" });
    expect(parseScope("project:none")).toEqual({ kind: "project", id: "none" });
  });
  test("map keys keep a colon inside", () => {
    expect(parseScope("map:/wiki/design-system")).toEqual({ kind: "map", key: "/wiki/design-system" });
    expect(parseScope("map:https://x.dev/a:b")).toEqual({ kind: "map", key: "https://x.dev/a:b" });
  });
  test("empty id or key, unknown prefix and null give null", () => {
    for (const s of ["project:", "map:", "bad", "all:", "ALL", "", null]) expect(parseScope(s)).toBeNull();
  });
});

describe("isGraphMember", () => {
  const base = { live: true, settled: false, step: false, prs: [1] };
  test("live, not settled, not a step, with a PR", () => {
    expect(isGraphMember(base)).toBe(true);
  });
  test("each other case is out", () => {
    expect(isGraphMember({ ...base, live: false })).toBe(false);
    expect(isGraphMember({ ...base, settled: true })).toBe(false);
    expect(isGraphMember({ ...base, step: true })).toBe(false);
    expect(isGraphMember({ ...base, prs: [] })).toBe(false);
  });
});
