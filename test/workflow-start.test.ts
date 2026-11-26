import { describe, expect, test } from "bun:test";

import {
  contextOf,
  fillOf,
  fits,
  payloadOf,
  prChoices,
  prOf,
  stackPoint,
  type StartPoint,
} from "../src/page/workflow-start.ts";
import { launchList, oldCli, scanFields } from "../src/server/workflow-start.ts";
import type { PrNode } from "../src/shared/tree.ts";
import { startKey, type Workflow } from "../src/shared/workflow-start.ts";

const pr = (n: number, over: Partial<PrNode> = {}): PrNode => ({
  n,
  url: `https://github.com/acme/shop/pull/${n}`,
  state: "open",
  draft: false,
  checks: null,
  review: null,
  conflicting: false,
  title: `PR ${n}`,
  head: null,
  base: null,
  stack: null,
  additions: null,
  deletions: null,
  changedFiles: null,
  labels: [],
  ...over,
});

const wf = (fields: Workflow["fields"], over: Partial<Workflow> = {}): Workflow => ({
  name: "w",
  version: 1,
  triggers: [],
  fields,
  webhookOnly: false,
  ...over,
});

const row = (prs: PrNode[]): StartPoint => ({ kind: "row", threadId: "t1", prs: prChoices(prs) });

describe("scanFields", () => {
  test("finds the fields that a file names", () => {
    const scan = scanFields([{ source: "const p = { pr: PR, text: Text }", workflows: ["a@2"] }]);
    expect(scan.get("a")).toEqual(["pr", "text"]);
  });

  test("a file with no field gives an empty list", () => {
    expect(scanFields([{ source: "const p = {}", workflows: ["a@1"] }]).get("a")).toEqual([]);
  });

  test("every workflow of a file gets the fields of the file", () => {
    const scan = scanFields([{ source: "{ stack: S }", workflows: ["a@1", "b@4"] }]);
    expect(scan.get("a")).toEqual(["stack"]);
    expect(scan.get("b")).toEqual(["stack"]);
  });

  test("an optional key counts", () => {
    expect(scanFields([{ source: "{ pr?: PR, text ?: T }", workflows: ["a@1"] }]).get("a")).toEqual(["pr", "text"]);
  });

  test("a longer name does not count as the field", () => {
    const scan = scanFields([{ source: "{ prNumber: N, threadIds: I, x.pr: 1, a_text: 2 }", workflows: ["a@1"] }]);
    expect(scan.get("a")).toEqual(["threadIds"]);
  });
});

describe("launchList", () => {
  const summaries = [
    { name: "a", version: 1, triggers: [] },
    { name: "hook", version: 2, triggers: ["webhook sentry", "webhook github"] },
    { name: "mixed", version: 1, triggers: ["webhook x", "every 1h"] },
  ];

  test("flags a workflow whose triggers are all webhooks", () => {
    expect(launchList(summaries, null).map((w) => w.webhookOnly)).toEqual([false, true, false]);
  });

  test("fields are null without a scan, and for a workflow that no file names", () => {
    expect(launchList(summaries, null).every((w) => w.fields === null)).toBe(true);
    expect(launchList(summaries, new Map([["a", ["pr"]]])).map((w) => w.fields)).toEqual([["pr"], null, null]);
  });
});

describe("startKey and oldCli", () => {
  test("startKey joins the parts", () => {
    expect(startKey("review", "pr-acme-shop-7", 1700)).toBe("review/pr-acme-shop-7/1700");
  });

  test("oldCli reads the unknown command text", () => {
    expect(oldCli('Unknown command "workflow"\n')).toBe(true);
    expect(oldCli("Unknown subcommand: workflow start")).toBe(true);
    expect(oldCli('Unknown command "thread"')).toBe(false);
    expect(oldCli("Workflows are off")).toBe(false);
  });
});

describe("prOf and prChoices", () => {
  test("prOf reads the repo from the URL", () => {
    expect(prOf(pr(7))).toEqual({ repo: "acme/shop", n: 7, title: "PR 7" });
    expect(prOf(pr(7, { url: "" }))).toBeNull();
  });

  test("open PRs come first, newest first", () => {
    const list = prChoices([pr(5), pr(9, { state: "merged" }), pr(8)]);
    expect(list.map((c) => c.n)).toEqual([8, 5, 9]);
  });

  test("a PR with no readable URL drops out", () => {
    expect(prChoices([pr(5, { url: "x" })])).toEqual([]);
  });
});

describe("fits", () => {
  test("a pr workflow fits a row with a PR and not a row without one", () => {
    const w = wf(["pr"]);
    expect(fits(w, row([pr(7)]))).toBe(true);
    expect(fits(w, row([]))).toBe(false);
  });

  test("a threadId workflow fits any row", () => {
    expect(fits(wf(["threadId"]), row([]))).toBe(true);
  });

  test("stack and threadIds fit their own start point only", () => {
    const stack = stackPoint([pr(1), pr(2)])!;
    const threads: StartPoint = { kind: "threads", ids: ["a"] };
    expect(fits(wf(["stack"]), stack)).toBe(true);
    expect(fits(wf(["stack"]), row([pr(1)]))).toBe(false);
    expect(fits(wf(["threadIds"]), threads)).toBe(true);
    expect(fits(wf(["threadIds"]), stack)).toBe(false);
  });

  test("an unscanned workflow fits only Find, and a webhook one does not fit Find", () => {
    expect(fits(wf(null), row([pr(1)]))).toBe(false);
    expect(fits(wf(null), { kind: "none" })).toBe(true);
    expect(fits(wf(null, { webhookOnly: true }), { kind: "none" })).toBe(false);
  });

  test("a scanned file with pr shows on a row with a PR only", () => {
    const [w] = launchList(
      [{ name: "review", version: 1, triggers: [] }],
      scanFields([{ source: "{ pr: PR }", workflows: ["review@1"] }]),
    );
    expect(fits(w, row([pr(7)]))).toBe(true);
    expect(fits(w, row([]))).toBe(false);
  });
});

describe("contextOf and fillOf", () => {
  test("a row with a PR uses the PR for a pr workflow and the thread for the others", () => {
    const point = row([pr(5), pr(8)]);
    expect(contextOf(point, wf(["pr"]))).toBe("pr-acme-shop-8");
    expect(contextOf(point, wf(["threadId"]))).toBe("thread-t1");
    expect(contextOf(row([]), wf(["pr", "threadId"]))).toBe("thread-t1");
  });

  test("the key names the PR and the stack that are sent", () => {
    const point = row([pr(5), pr(8)]);
    const picked = { pr: { repo: "acme/shop", number: 5 } };
    expect(contextOf(point, wf(["pr"]), picked)).toBe("pr-acme-shop-5");
    expect(contextOf(point, wf(["threadId"]), picked)).toBe("thread-t1");
    expect(contextOf(point, wf(["pr"]), { pr: "junk" })).toBe("pr-acme-shop-8");
    const stack = stackPoint([pr(3), pr(4)])!;
    expect(contextOf(stack, wf(["stack"]), { stack: { repo: "acme/other", prs: [9, 10] } })).toBe("stack-acme-other-9");
  });

  test("stack, threads and none", () => {
    expect(contextOf(stackPoint([pr(3), pr(4)])!, wf(["stack"]))).toBe("stack-acme-shop-3");
    expect(contextOf({ kind: "threads", ids: ["a", "b"] }, wf(["threadIds"]))).toBe("threads-2");
    expect(contextOf({ kind: "none" }, wf(null))).toBe("none");
  });

  test("a row fills the thread, the newest open PR and the project", () => {
    expect(fillOf(row([pr(5), pr(8)]), "/w/shop")).toEqual({ threadId: "t1", pr: "acme/shop#8", project: "/w/shop" });
  });

  test("stack and threads fill as text, Find fills nothing", () => {
    expect(fillOf(stackPoint([pr(3), pr(4)])!)).toEqual({ stack: "acme/shop #3 #4" });
    expect(fillOf({ kind: "threads", ids: ["a", "b"] })).toEqual({ threadIds: "a, b" });
    expect(fillOf({ kind: "none" })).toEqual({});
  });
});

describe("payloadOf", () => {
  test("an empty field is left out and only the given fields count", () => {
    expect(payloadOf(["text", "project"], { text: "  ", project: "/p", pr: "bad" })).toEqual({
      ok: true,
      payload: { project: "/p" },
    });
  });

  test("pr, stack and threadIds are parsed", () => {
    expect(
      payloadOf(["pr", "stack", "threadIds"], {
        pr: "acme/shop#7",
        stack: "acme/shop #3 #4 5",
        threadIds: "a, b  c",
      }),
    ).toEqual({
      ok: true,
      payload: {
        pr: { repo: "acme/shop", number: 7 },
        stack: { repo: "acme/shop", prs: [3, 4, 5] },
        threadIds: ["a", "b", "c"],
      },
    });
  });

  test("a bad pr or stack gives an error for its field", () => {
    const r = payloadOf(["pr", "stack"], { pr: "7", stack: "acme/shop" });
    expect(r.ok).toBe(false);
    expect(!r.ok && Object.keys(r.errors)).toEqual(["pr", "stack"]);
  });
});
