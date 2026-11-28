import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scanFields, scanSettings } from "../src/server/workflow-start.ts";
import { choicesOf, decisionsOf, type GqlPull, itemsMarkdown, openItems } from "../workflows/lib/pr-comments.ts";

const note = (login: string | null, body: string, isMinimized = false) => ({
  author: login ? { login } : null,
  body,
  isMinimized,
});

const thread = (over: Partial<GqlPull["reviewThreads"]["nodes"][number]> = {}) => ({
  isResolved: false,
  isOutdated: false,
  path: "a.ts",
  line: 5,
  originalLine: 4,
  startLine: null,
  originalStartLine: null,
  comments: { nodes: [note("bob", "rename it")] },
  ...over,
});

const pull = (over: Partial<GqlPull> = {}): GqlPull => ({
  author: { login: "me" },
  reviewThreads: { nodes: [] },
  comments: { nodes: [] },
  reviews: { nodes: [] },
  ...over,
});

describe("openItems", () => {
  test("leaves out a resolved thread", () => {
    const pr = pull({ reviewThreads: { nodes: [thread({ isResolved: true }), thread()] } });
    expect(openItems(pr).map((i) => i.n)).toEqual([1]);
  });

  test("gives the range and the outdated flag of a thread", () => {
    const [item] = openItems(pull({ reviewThreads: { nodes: [thread({ startLine: 2, isOutdated: true })] } }));
    expect(item).toEqual({ n: 1, kind: "inline", ref: "a.ts:2-5", outdated: true, body: "bob: rename it" });
  });

  test("uses the original lines when the lines are null", () => {
    const [item] = openItems(pull({ reviewThreads: { nodes: [thread({ line: null, originalStartLine: 3 })] } }));
    expect(item?.ref).toBe("a.ts:3-4");
  });

  test("joins the comments of a thread", () => {
    const comments = { nodes: [note("bob", "a"), note(null, "b")] };
    const [item] = openItems(pull({ reviewThreads: { nodes: [thread({ comments })] } }));
    expect(item?.body).toBe("bob: a\n\nghost: b");
  });

  test("leaves out the PR author, minimized and blank comments", () => {
    const pr = pull({
      comments: { nodes: [note("me", "mine"), note("bob", "gone", true), note("bob", "  "), note("bob", "keep")] },
      reviews: { nodes: [note("me", "mine"), note("amy", "")] },
    });
    expect(openItems(pr).map((i) => i.body)).toEqual(["bob: keep"]);
  });

  test("numbers threads, then comments, then reviews", () => {
    const pr = pull({
      reviewThreads: { nodes: [thread()] },
      comments: { nodes: [note("bob", "c")] },
      reviews: { nodes: [note("amy", "r")] },
    });
    expect(openItems(pr).map((i) => [i.n, i.kind])).toEqual([
      [1, "inline"],
      [2, "comment"],
      [3, "review"],
    ]);
  });
});

describe("itemsMarkdown", () => {
  test("shows the ref and the outdated mark", () => {
    const pr = pull({
      reviewThreads: { nodes: [thread({ isOutdated: true })] },
      comments: { nodes: [note("bob", "c")] },
    });
    expect(itemsMarkdown(openItems(pr))).toBe(
      "[1] inline a.ts:5 (outdated: the code moved)\nbob: rename it\n\n[2] comment\nbob: c",
    );
  });
});

describe("decisionsOf", () => {
  const items = openItems(pull({ comments: { nodes: [note("a", "1"), note("b", "2")] } }));
  const v = (n: number, verdict: string) => ({ n, verdict });
  const ns = (found: { item: { n: number } }[]) => found.map((d) => d.item.n);

  test("gives one entry for a duplicate number", () => {
    const found = decisionsOf(items, [v(1, "NEEDS_DECISION"), { ...v(1, "NEEDS_DECISION"), extra: 1 }]);
    expect(found).toEqual([{ item: items[0], verdict: v(1, "NEEDS_DECISION") }]);
  });

  test("drops a number that was not fetched", () => {
    expect(decisionsOf(items, [v(9, "NEEDS_DECISION")])).toEqual([]);
  });

  test("ignores other verdicts and keeps the item order", () => {
    expect(ns(decisionsOf(items, [v(2, "NEEDS_DECISION"), v(1, "NEEDS_DECISION"), v(3, "VALID")]))).toEqual([1, 2]);
    expect(ns(decisionsOf(items, [v(2, "NEEDS_DECISION"), v(1, "VALID")]))).toEqual([2]);
  });
});

describe("choicesOf", () => {
  test("drops blank, skip and repeated labels, and puts skip last", () => {
    const labels = ["a", " a ", "", "skip", "b"].map((label) => ({ label }));
    expect(choicesOf(labels)).toEqual(["a", "b", "skip"]);
  });

  test("cuts to 80 characters before it removes repeats", () => {
    const long = "x".repeat(90);
    expect(choicesOf([{ label: long }, { label: `${long}y` }])).toEqual(["x".repeat(80), "skip"]);
  });
});

describe("workflow source", () => {
  const source = readFileSync(join(import.meta.dir, "../workflows/pr-comments.ts"), "utf8");
  const files = [{ source, workflows: ["pr-comments@1"] }];

  test("names the fields pr and project only", () => {
    expect(scanFields(files).get("pr-comments")).toEqual(["pr", "project"]);
  });

  test("has one setting, the extra prompt", () => {
    expect(scanSettings(files).get("pr-comments")).toEqual([
      { key: "settings/pr-comments/extra-prompt", field: "extra-prompt", type: "string" },
    ]);
  });
});
