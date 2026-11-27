import { describe, expect, test } from "bun:test";

import { digestOf, lastMessageRoutes, questionOf, tailOf } from "../src/server/last-message.ts";
import type { ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");

function node(id: string, over: Partial<ThreadNode> = {}): ThreadNode {
  return {
    id,
    href: `t3://${id}`,
    title: `Thread ${id}`,
    key: null,
    linear: null,
    status: "your-turn",
    phrase: "Your turn",
    since: null,
    raw: "completed",
    updatedAt: "2026-11-13T09:00:00.000Z",
    lastRun: null,
    settled: false,
    input: false,
    snoozedUntil: null,
    stack: null,
    prs: [],
    detail: { request: null } as ThreadNode["detail"],
    children: [],
    ...over,
  };
}

const pr = (over: object) =>
  ({
    repository: "a/b",
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

describe("questionOf", () => {
  test("the last question wins", () => {
    expect(questionOf("Which one? Or this one? Fine.")).toBe("Or this one?");
  });
  test("a question may end in closing marks", () => {
    expect(questionOf("Done.\n**Ready to merge?**\nNotes follow.")).toBe("**Ready to merge?**");
  });
  test("with no question, the last sentence; a trailing bullet counts", () => {
    expect(questionOf("Done. All good.")).toBe("All good.");
    expect(questionOf("Pick:\n- option a\n- option b")).toBe("- option b");
  });
  test("drops a leading ellipsis and splits on newlines", () => {
    expect(questionOf("…tail of a sentence\nReady?")).toBe("Ready?");
    expect(questionOf("…only")).toBe("only");
  });
  test("cuts at 140 characters with an ellipsis", () => {
    const out = questionOf(`${"x".repeat(200)}?`)!;
    expect(out).toBe(`${"x".repeat(139)}…`);
    expect(out.length).toBe(140);
  });
  test("empty text gives null", () => {
    expect(questionOf("")).toBeNull();
    expect(questionOf(" \n ")).toBeNull();
  });
});

describe("digestOf", () => {
  test("full line with key, PRs, stack, request and a cut message tail", () => {
    const n = node("A", {
      key: "ABC-1",
      title: "ABC-1 · Fix it",
      since: "2026-11-13T11:00:00.000Z",
      phrase: "Approval",
      status: "needs-input",
      prs: [
        pr({ review: "approved", checks: "passing" }),
        pr({ n: 13, draft: true, checks: "failing", conflicting: true }),
      ],
      stack: { pos: 2, total: 3 },
      detail: { request: "Approve rm" } as ThreadNode["detail"],
    });
    const msg = "x".repeat(300) + "\n" + "y".repeat(700);
    const [head, ...rest] = digestOf(n, "t1", msg, NOW).split("\n");
    expect(head).toBe(
      "t1 · Approval · 1h · ABC-1 Fix it · PRs (#12 approved passing, #13 draft failing conflicting) · stack 2/3 · request: Approve rm",
    );
    expect(rest).toEqual(["  …" + "y".repeat(600)]);
  });
  test("minimal line: no key, PRs, stack, request or message", () => {
    expect(digestOf(node("A"), "t1", null, NOW)).toBe("t1 · Your turn 3h · Thread A");
  });
  test("plan ready and your turn with a since show the Wait, not the update age", () => {
    const since = "2026-11-13T11:30:00.000Z";
    expect(digestOf(node("A", { since }), "t1", null, NOW)).toBe("t1 · Your turn 30m · Thread A");
    expect(digestOf(node("A", { since, status: "plan-ready", phrase: "Plan ready" }), "t1", null, NOW)).toBe(
      "t1 · Plan ready 30m · Thread A",
    );
  });
  test("stack of N when pos is null; state shows when not open", () => {
    const n = node("A", { stack: { pos: null, total: 4 }, prs: [pr({ state: "merged" })] });
    expect(digestOf(n, "t1", null, NOW)).toBe("t1 · Your turn 3h · Thread A · PRs (#12 merged) · stack of 4");
  });
  test("a multi-line message tail is indented on every line", () => {
    expect(digestOf(node("A"), "t1", "a\nb", NOW)).toContain("\n  a\n  b");
  });
});

describe("tailOf", () => {
  test("a short message stays; a long one keeps its last 600 characters after a …", () => {
    expect(tailOf("short")).toBe("short");
    expect(tailOf("x".repeat(300) + "y".repeat(700))).toBe("…" + "y".repeat(600));
  });
});

describe("lastMessageRoutes", () => {
  const messages: Record<string, string | null> = { "env:thread%3A1": "z".repeat(700), quiet: null };
  const get = lastMessageRoutes({ read: (id) => messages[id] ?? null, has: (id) => id in messages })["/t3/last-message"]
    .GET;
  const call = (query: string) => get(new Request(`http://x/t3/last-message${query}`));
  test("400 without an id; 404 for an unknown thread", async () => {
    expect(call("").status).toBe(400);
    expect(call("?id=nope").status).toBe(404);
  });
  test("null text when the thread has no message", async () => {
    expect(await call("?id=quiet").json()).toEqual({ text: null });
  });
  test("a long message comes back as its tail, for an id with : and %3A", async () => {
    const res = call(`?id=${encodeURIComponent("env:thread%3A1")}`);
    expect(await res.json()).toEqual({ text: "…" + "z".repeat(600) });
  });
});
