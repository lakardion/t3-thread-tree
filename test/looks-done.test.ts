import { describe, expect, test } from "bun:test";

import { looksDone, parseSkip, pruneSkip, reasonText, type Skip } from "../src/page/looks-done.ts";
import type { Branch, CatchUp, PrNode, Status, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const pr = (state: string) => ({ state }) as PrNode;
const catchUp = (over: Partial<CatchUp> = {}): CatchUp => ({
  state: "done",
  doneLike: true,
  did: "Shipped.",
  pick: "claude",
  ...over,
});

let seq = 0;
const node = (over: Partial<ThreadNode> = {}): ThreadNode => {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Thread ${seq}`,
    status: "done" as Status,
    settled: false,
    lastRun: ago(120),
    prs: [pr("merged")],
    detail: { pinned: false },
    children: [],
    ...over,
  } as ThreadNode;
};
const branch = (threads: ThreadNode[], over: Partial<Branch> = {}): Branch => ({
  id: "b",
  label: "Storefront",
  branches: [],
  threads,
  ...over,
});
const ctx = { skip: [] as Skip[], now: NOW };
const ids = (projects: Branch[], c = ctx) => looksDone(projects, c).map((o) => o.thread.id);
const offered = (t: ThreadNode, c = ctx) => ids([branch([t])], c).includes(t.id);

describe("looksDone candidates", () => {
  test("your-turn, done and idle qualify", () => {
    for (const status of ["your-turn", "done", "idle"] as const) expect(offered(node({ status }))).toBe(true);
  });
  test("any other status does not", () => {
    for (const status of [
      "working",
      "starting",
      "blocked",
      "needs-input",
      "plan-ready",
      "failed",
      "interrupted",
      "snoozed",
    ] as const)
      expect(offered(node({ status }))).toBe(false);
  });
  test("a busy subthread excludes", () => {
    for (const status of ["working", "starting", "blocked", "needs-input", "plan-ready"] as const)
      expect(offered(node({ children: [node({ status, prs: [] })] }))).toBe(false);
  });
  test("a finished subthread does not exclude", () => {
    expect(offered(node({ children: [node({ status: "done", prs: [] })] }))).toBe(true);
  });
  test("a run under 1 h old, or no run, excludes", () => {
    expect(offered(node({ lastRun: ago(59) }))).toBe(false);
    expect(offered(node({ lastRun: ago(61) }))).toBe(true);
    expect(offered(node({ lastRun: null }))).toBe(false);
  });
  test("pinned and settled threads are excluded", () => {
    expect(offered(node({ detail: { pinned: true } as ThreadNode["detail"] }))).toBe(false);
    expect(offered(node({ settled: true }))).toBe(false);
  });
  test("a nested thread is offered on its own", () => {
    const child = node();
    const parent = node({ status: "working", prs: [], children: [child] });
    expect(ids([branch([parent])])).toEqual([child.id]);
  });
});

describe("looksDone reasons", () => {
  test("all PRs merged", () => {
    const [o] = looksDone([branch([node({ prs: [pr("merged"), pr("merged")] })])], ctx);
    expect(o.reason).toEqual({ kind: "prs", n: 2, merged: true });
  });
  test("merged and closed PRs", () => {
    const [o] = looksDone([branch([node({ prs: [pr("merged"), pr("closed")] })])], ctx);
    expect(o.reason).toEqual({ kind: "prs", n: 2, merged: false });
  });
  test("an open PR gives no PR reason", () => {
    expect(offered(node({ prs: [pr("merged"), pr("open")] }))).toBe(false);
  });
  test("a done-like Catch-up is a reason for claude and codex", () => {
    for (const pick of ["claude", "codex"] as const) {
      const [o] = looksDone([branch([node({ prs: [], catchUp: catchUp({ pick }) })])], ctx);
      expect(o.reason).toEqual({ kind: "catch-up", did: "Shipped." });
    }
  });
  test("a Local Catch-up is ignored", () => {
    expect(offered(node({ prs: [], catchUp: catchUp({ pick: "local" }) }))).toBe(false);
  });
  test("a Catch-up that is not done-like is ignored", () => {
    expect(offered(node({ prs: [], catchUp: catchUp({ doneLike: false }) }))).toBe(false);
    expect(offered(node({ prs: [], catchUp: catchUp({ state: "running" }) }))).toBe(false);
  });
  test("a plain done thread with no PR and no Catch-up is not offered", () => {
    expect(offered(node({ prs: [] }))).toBe(false);
  });
  test("the PR reason wins over the Catch-up", () => {
    const [o] = looksDone([branch([node({ catchUp: catchUp() })])], ctx);
    expect(o.reason.kind).toBe("prs");
  });
});

describe("skip list", () => {
  test("an entry matches only with an equal lastRun", () => {
    const t = node();
    expect(offered(t, { ...ctx, skip: [{ id: t.id, lastRun: t.lastRun }] })).toBe(false);
    expect(offered(t, { ...ctx, skip: [{ id: t.id, lastRun: ago(500) }] })).toBe(true);
  });
});

describe("project label", () => {
  test("uses the T3 project of the Linear tree, else the branch", () => {
    const a = node({ t3Project: { id: "p", label: "Docs" } });
    const b = node();
    const tree = [branch([a, b], { label: "Group" })];
    expect(looksDone(tree, ctx).map((o) => o.project)).toEqual(["Docs", "Group"]);
  });
});

describe("tree shapes", () => {
  test("a T3-shaped and a Linear-shaped tree of the same nodes give the same ids", () => {
    const a = node({ t3Project: { id: "p", label: "Docs" } });
    const b = node({ t3Project: { id: "q", label: "Shop" } });
    const t3 = [branch([a]), branch([b])];
    const linear = [branch([], { id: "lf:1", label: "Roadmap", branches: [branch([a, b], { label: "M1" })] })];
    expect(ids(t3).toSorted()).toEqual(ids(linear).toSorted());
    expect(looksDone(linear, ctx).map((o) => o.project)).toEqual(["Docs", "Shop"]);
  });
  test("a busy nested child holds its parent back only while nested", () => {
    const child = node({ status: "working", prs: [] });
    const parent = node();
    expect(ids([branch([{ ...parent, children: [child] }])])).toEqual([]);
    expect(ids([branch([parent, child])])).toEqual([parent.id]);
  });
});

describe("pruneSkip", () => {
  const live = new Map([
    ["a", node({ id: "a", lastRun: "r1" })],
    ["b", node({ id: "b", lastRun: "r2" })],
  ]);
  test("drops gone threads and stale entries", () =>
    expect(
      pruneSkip(
        [
          { id: "a", lastRun: "r1" },
          { id: "b", lastRun: "old" },
          { id: "x", lastRun: "r1" },
        ],
        live,
        "up",
      ),
    ).toEqual([{ id: "a", lastRun: "r1" }]));
  test("returns the same array when nothing drops", () => {
    const skip = [{ id: "a", lastRun: "r1" }];
    expect(pruneSkip(skip, live, "up")).toBe(skip);
  });
  test("keeps the list when the tree is not live", () => {
    const skip = [{ id: "x", lastRun: "r1" }];
    for (const conn of ["down", "connecting", "no-token", "unauthorized"] as const)
      expect(pruneSkip(skip, live, conn)).toBe(skip);
  });
});

describe("parseSkip", () => {
  test("reads a good list", () => {
    const skip = [
      { id: "a", lastRun: "r" },
      { id: "b", lastRun: null },
    ];
    expect(parseSkip(JSON.stringify(skip))).toEqual(skip);
  });
  test("reads no value as empty", () => expect(parseSkip(null)).toEqual([]));
  test("rejects bad input", () => {
    for (const raw of ["", "nope", "{}", '["a"]', '[{"id":1,"lastRun":null}]', '[{"id":"a"}]', "[null]"])
      expect(parseSkip(raw)).toEqual([]);
  });
});

describe("reasonText", () => {
  test("names the reason", () => {
    expect(reasonText({ kind: "prs", n: 3, merged: true })).toBe("3 PRs merged");
    expect(reasonText({ kind: "prs", n: 1, merged: true })).toBe("1 PR merged");
    expect(reasonText({ kind: "prs", n: 2, merged: false })).toBe("2 PRs merged or closed");
    expect(reasonText({ kind: "catch-up", did: "Shipped." })).toBe("Catch-up: Shipped.");
  });
});

describe("step threads", () => {
  test("a step thread is never offered", () => {
    expect(offered(node({ step: "plan" }))).toBe(false);
    expect(ids([branch([node({ children: [node({ step: "plan" })] })])])).toHaveLength(1);
  });
});
