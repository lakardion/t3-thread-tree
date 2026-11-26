import { describe, expect, test } from "bun:test";

import { prRule } from "../src/shared/pr-rule.ts";
import type { ThreadNode } from "../src/shared/tree.ts";

const pr = (over: object) =>
  ({
    n: 12,
    url: "u",
    state: "open",
    draft: false,
    checks: null,
    review: null,
    conflicting: false,
    title: "t",
    head: null,
    base: null,
    stack: null,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    labels: [],
    ...over,
  }) as ThreadNode["prs"][number];

const one = (prs: ThreadNode["prs"]) => prRule({ prs } as ThreadNode);
const ready = { review: "approved", checks: "passing" };

describe("prRule", () => {
  test("a fix names its steps in fixed order, joined, then push", () => {
    expect(one([pr({ checks: "failing" })])).toEqual({
      kind: "fix",
      pr: 12,
      prompt: "fix the failing checks, and push.",
    });
    expect(one([pr({ n: 7, checks: "failing", conflicting: true, review: "changes-requested" })])).toEqual({
      kind: "fix",
      pr: 7,
      prompt:
        "Rebase on main and resolve the conflicts, fix the failing checks, address the review comments, and push.",
    });
  });
  test("a closed PR gives no fix", () => {
    expect(one([pr({ state: "merged", checks: "failing" })])).toBeNull();
  });
  test("a merge needs an open, non-draft, approved, passing PR with no conflicts", () => {
    expect(one([pr(ready)])).toEqual({ kind: "merge", pr: 12, prompt: "Merge PR #12 and delete its branch." });
    expect(one([pr({ ...ready, draft: true })])).toBeNull();
    expect(one([pr({ ...ready, state: "closed" })])).toBeNull();
    expect(one([pr({ review: "review-required", checks: "passing" })])).toBeNull();
  });
  test("the first PR that matches wins", () => {
    expect(one([pr({ n: 1 }), pr({ n: 2, checks: "failing" }), pr({ n: 3, conflicting: true })])).toMatchObject({
      pr: 2,
    });
  });
  test("a fix wins over a merge", () => {
    expect(one([pr({ n: 1, ...ready }), pr({ n: 2, checks: "failing" })])).toMatchObject({ kind: "fix", pr: 2 });
  });
});
