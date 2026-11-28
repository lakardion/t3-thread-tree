import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { scanFields, scanSettings } from "../src/server/workflow-start.ts";
import { brief, decide, diffLines, type Finding, marker, reviewRequest } from "../workflows/lib/review-pr.ts";

const finding = (over: Partial<Finding> = {}): Finding => ({
  axis: "standards",
  severity: "minor",
  body: "text",
  ...over,
});

describe("decide", () => {
  test.each([
    [["blocker"], "changes"],
    [["nit", "major"], "changes"],
    [["minor", "nit"], "approve"],
    [[], "approve"],
  ] as const)("%j gives %s", (severities, decision) => {
    expect(decide(severities.map((severity) => finding({ severity })))).toBe(decision);
  });
});

describe("brief", () => {
  const input = { repo: "o/r", number: 7, title: "T", base: "main", head: "abc" };

  test("checks out detached and names both axes", () => {
    const text = brief(input);
    expect(text).toContain("gh pr checkout 7 -R o/r --detach");
    expect(text).toContain("git checkout --detach abc");
    expect(text).toContain("git diff origin/main...HEAD");
    expect(text).toContain("Standards");
    expect(text).toContain("Spec");
  });

  test("adds the focus and the checks only when set", () => {
    expect(brief(input)).not.toContain("Extra focus");
    expect(brief(input)).not.toContain("Also apply these checks");
    const full = brief({ ...input, text: "auth", checks: "docs/rules.md" });
    expect(full).toContain("Extra focus: auth");
    expect(full).toContain("Also apply these checks: docs/rules.md.");
  });
});

describe("diffLines", () => {
  const patch = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,3 +10,4 @@",
    " keep",
    "-gone",
    "+new one",
    "+new two",
    " keep",
    "diff --git a/b.ts b/b.ts",
    "--- a/b.ts",
    "+++ b/b.ts",
    "@@ -5,2 +5,2 @@",
    "-old",
    "+new",
    " keep",
    "diff --git a/c.ts b/c.ts",
    "--- a/c.ts",
    "+++ /dev/null",
    "@@ -1,1 +0,0 @@",
    "-deleted",
  ].join("\n");

  test("keeps an added line that starts with ++ as content", () => {
    const lines = diffLines(
      ["diff --git a/a.ts b/a.ts", "--- a/a.ts", "+++ b/a.ts", "@@ -1,1 +1,2 @@", " keep", "+++ added"].join("\n"),
    );
    expect([...(lines.get("a.ts") ?? [])]).toEqual([1, 2]);
  });

  test("gives the new-side lines of each hunk and skips deleted files", () => {
    const lines = diffLines(patch);
    expect([...lines.keys()]).toEqual(["a.ts", "b.ts"]);
    expect([...(lines.get("a.ts") ?? [])]).toEqual([10, 11, 12, 13]);
    expect([...(lines.get("b.ts") ?? [])]).toEqual([5, 6]);
  });
});

describe("reviewRequest", () => {
  const anchors = new Map([["a.ts", new Set([10, 11])]]);
  const make = (findings: Finding[]) =>
    reviewRequest(
      { decision: "changes", summary: "Sum", findings },
      { runId: "run1", reviewed: "abc", commitId: "abc", diffLines: anchors },
    );

  test("is a COMMENT review of the reviewed commit with the marker", () => {
    const request = make([]);
    expect(request.event).toBe("COMMENT");
    expect(request.commit_id).toBe("abc");
    expect(request.body).toContain("Sum");
    expect(request.body).toContain("Decision: changes");
    expect(request.body).toContain(marker("run1"));
  });

  test("anchors a finding inside the diff as an inline comment", () => {
    const request = make([finding({ severity: "major", file: "a.ts", line: 11, body: "bad" })]);
    expect(request.comments).toEqual([{ path: "a.ts", line: 11, side: "RIGHT", body: "**major · standards**\n\nbad" }]);
    expect(request.body).not.toContain("bad");
  });

  test("sends no commit_id when none is given, and still names the reviewed commit", () => {
    const request = reviewRequest(
      { decision: "approve", summary: "Sum", findings: [] },
      { runId: "run1", reviewed: "abc", diffLines: anchors },
    );
    expect("commit_id" in request).toBe(false);
    expect(request.body).toContain("Reviewed commit: abc");
  });

  test("puts a finding with null file and line in the body", () => {
    const request = make([finding({ file: null, line: null, body: "nulls" })]);
    expect(request.comments).toEqual([]);
    expect(request.body).toContain("nulls");
  });

  test("puts a finding outside the diff, or with no file or line, in the body", () => {
    const request = make([
      finding({ file: "a.ts", line: 99, body: "outside" }),
      finding({ file: "z.ts", line: 1, body: "other file" }),
      finding({ body: "general" }),
    ]);
    expect(request.comments).toEqual([]);
    expect(request.body).toContain("outside");
    expect(request.body).toContain("other file");
    expect(request.body).toContain("general");
  });
});

describe("start scan", () => {
  const files = [
    { source: readFileSync(new URL("../workflows/review-pr.ts", import.meta.url), "utf8"), workflows: ["review-pr@1"] },
  ];

  test("the workflow reads the pr, project and text fields", () => {
    expect(scanFields(files).get("review-pr")).toEqual(["pr", "project", "text"]);
  });

  test("the workflow has the checks and extra-prompt settings", () => {
    const settings = scanSettings(files).get("review-pr") ?? [];
    expect(settings.map((s) => s.field)).toEqual(["checks", "extra-prompt"]);
  });
});
