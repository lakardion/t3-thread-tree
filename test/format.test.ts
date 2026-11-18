import { describe, expect, test } from "bun:test";

import {
  ago,
  folded,
  foldIds,
  groupIds,
  linearHref,
  ownPos,
  phraseWith,
  prTone,
  railRows,
  stackRuns,
  stopLabel,
  stripKey,
} from "../src/page/format.ts";
import { parseLinear, type Branch, type PrNode, type ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const before = (sec: number) => new Date(NOW - sec * 1000).toISOString();

describe("ago", () => {
  test.each([
    [0, "now"],
    [59, "now"],
    [60, "1m"],
    [59 * 60, "59m"],
    [60 * 60, "1h"],
    [23 * 3600, "23h"],
    [24 * 3600, "1d"],
    [-300, "now"],
  ])("%i s ago is %s", (sec, out) => {
    expect(ago(before(sec), NOW)).toBe(out);
  });
});

describe("phraseWith", () => {
  test("adds the time after the phrase", () => {
    expect(phraseWith({ status: "working", phrase: "Working", since: before(720) }, NOW)).toBe("Working 12m");
  });
  test("separates the time with a dot on needs-input", () => {
    expect(phraseWith({ status: "needs-input", phrase: "Approval", since: before(180) }, NOW)).toBe("Approval · 3m");
  });
  test("returns the phrase with no since", () => {
    expect(phraseWith({ status: "done", phrase: "Done", since: null }, NOW)).toBe("Done");
  });
});

describe("stripKey", () => {
  test.each([
    ["SHOP-412 · Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412: Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412 - Checkout", "SHOP-412", "Checkout"],
    ["SHOP-412 Checkout", "SHOP-412", "Checkout"],
    ["Review #2088 SHOP-398", "SHOP-398", "Review #2088 SHOP-398"],
    ["SHOP-412", "SHOP-412", "SHOP-412"],
  ])("%s", (title, key, out) => {
    expect(stripKey(title, key)).toBe(out);
  });
});

describe("folded", () => {
  const thread = (key: string | null) => ({ id: `t-${key}`, key }) as ThreadNode;
  const group = (label: string, threads: ThreadNode[], branches: Branch[] = []): Branch => ({
    id: label,
    label,
    branches,
    threads,
  });

  test("a key group with one thread folds into it", () => {
    const t = thread("SHOP-1");
    expect(folded(group("SHOP-1", [t]))).toBe(t);
  });
  test("a key group with two threads does not fold", () => {
    expect(folded(group("SHOP-1", [thread("SHOP-1"), thread("SHOP-1")]))).toBeNull();
  });
  test("No issue key does not fold", () => {
    expect(folded(group("No issue key", [thread(null)]))).toBeNull();
  });
  test("a group with branches and no threads does not fold", () => {
    expect(folded(group("Reviews", [], [group("SHOP-1", [thread("SHOP-1")])]))).toBeNull();
  });
});

describe("stackRuns", () => {
  const b = (label: string, stack?: string): Branch => ({
    id: label,
    label,
    branches: [],
    threads: [],
    ...(stack && { stack: { id: stack, total: 2, base: null } }),
  });
  const names = (runs: Branch[][]) => runs.map((r) => r.map((x) => x.label));

  test("adjacent branches of one stack share a run", () => {
    const bs = [b("a", "s1"), b("b", "s1"), b("c"), b("d", "s2"), b("e", "s1")];
    const runs = stackRuns(bs);
    expect(names(runs)).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
    expect(runs.flat()).toEqual(bs);
  });
  test("an empty list gives no runs", () => {
    expect(stackRuns([])).toEqual([]);
  });
});

describe("railRows", () => {
  const pr = (n: number) => ({ n }) as PrNode;
  const t = (id: string, pos: number | null, key: string | null = null) =>
    ({ id, key, stack: { pos, total: 3 }, prs: pos ? [pr(100 + pos)] : [], children: [] }) as unknown as ThreadNode;
  const g = (label: string, threads: ThreadNode[]): Branch => ({ id: label, label, branches: [], threads });
  const show = (run: Branch[]) => {
    const { stops, rows } = railRows(run);
    return { stops: stops.map((s) => s.p?.n ?? null), rows: rows.map((r) => [r.t.id, r.n ?? null, r.chip ?? null]) };
  };

  test("a keyless group gets one stop per positioned thread, rows in stack order, no chip", () => {
    expect(show([g("PR stack #101", [t("c", 3), t("a", 1), t("b", 2)])])).toEqual({
      stops: [101, 102, 103],
      rows: [
        ["a", 1, null],
        ["b", 2, null],
        ["c", 3, null],
      ],
    });
  });

  test("key groups keep their chip; a thread with no position gets no number; a group with none gets an unnumbered stop", () => {
    expect(
      show([g("WEB-1", [t("x", 1, "WEB-1"), t("y", null, "WEB-1")]), g("WEB-2", [t("z", null, "WEB-2")])]),
    ).toEqual({
      stops: [101, null],
      rows: [
        ["x", 1, "WEB-1"],
        ["y", null, "WEB-1"],
        ["z", null, "WEB-2"],
      ],
    });
  });

  test("numbers keep the stack position when a filter hides other stops", () => {
    expect(show([g("WEB-2", [t("b", 2, "WEB-2")])])).toEqual({ stops: [102], rows: [["b", 2, "WEB-2"]] });
  });
});

describe("foldIds", () => {
  const thread = (key: string | null) => ({ id: `t-${key}`, key }) as ThreadNode;
  const b = (id: string, threads: ThreadNode[], branches: Branch[] = [], stack?: string): Branch => ({
    id,
    label: id,
    branches,
    threads,
    ...(stack && { stack: { id: stack, total: 2, base: null } }),
  });

  test("a project lists its groups, nested groups and one id per stack run", () => {
    const nested = b(
      "Reviews",
      [],
      [b("SHOP-1", [thread("SHOP-1"), thread("SHOP-1")]), b("SHOP-2", [thread("SHOP-2")])],
    );
    const p = b(
      "p",
      [],
      [
        nested,
        b("API-1", [thread("API-1")], [], "s1"),
        b("API-2", [thread("API-2")], [], "s1"),
        b("No issue key", [thread(null)]),
      ],
    );
    expect(foldIds(p)).toEqual(["Reviews", "SHOP-1", "rail:s1", "No issue key"]);
    expect(groupIds(nested)).toEqual(["Reviews", "SHOP-1"]);
  });
  test("a group that folds into one thread has no fold id", () => {
    expect(groupIds(b("SHOP-1", [thread("SHOP-1")]))).toEqual([]);
  });
});

describe("linearHref", () => {
  const linear = { workspace: "acme", teams: ["JED", "ENG"] };

  test("links a key of a configured team", () => {
    expect(linearHref("JED-12", linear)).toBe("https://linear.app/acme/issue/JED-12");
  });
  test("returns null for a key of another prefix", () => {
    expect(linearHref("SHOP-1", linear)).toBeNull();
  });
  test("returns null with no Linear config", () => {
    expect(linearHref("JED-12", null)).toBeNull();
  });
  test("links every key when no teams are set", () => {
    expect(linearHref("SHOP-1", { workspace: "acme", teams: [] })).toBe("https://linear.app/acme/issue/SHOP-1");
  });
});

describe("parseLinear", () => {
  test("reads a slug and a team list", () => {
    expect(parseLinear(" acme ", "jed, ENG,,")).toEqual({ workspace: "acme", teams: ["JED", "ENG"] });
  });
  test("reads the workspace from a linear.app URL", () => {
    expect(parseLinear("https://linear.app/acme/issue/JED-1")?.workspace).toBe("acme");
  });
  test("returns null with no workspace", () => {
    expect(parseLinear("  ", "JED")).toBeNull();
  });
});

describe("prTone", () => {
  const pr = (over: Partial<PrNode>): PrNode => ({
    n: 1,
    url: "",
    state: "open",
    draft: false,
    checks: null,
    review: null,
    conflicting: false,
    title: null,
    additions: null,
    deletions: null,
    changedFiles: null,
    labels: [],
    ...over,
  });
  test.each([
    ["no PR", undefined, "var(--muted-foreground)"],
    ["draft", pr({ draft: true, checks: "failing" }), "var(--muted-foreground)"],
    ["failing checks", pr({ checks: "failing", review: "approved" }), "var(--status-failed-fg)"],
    ["conflict", pr({ conflicting: true }), "var(--status-failed-fg)"],
    ["changes requested", pr({ review: "changes-requested" }), "var(--status-failed-fg)"],
    ["approved", pr({ review: "approved", checks: "passing" }), "var(--status-done-fg)"],
    ["open", pr({ checks: "pending" }), "var(--status-working-fg)"],
  ])("%s", (_, p, out) => {
    expect(prTone(p)).toBe(out);
  });
});

describe("ownPos", () => {
  const t = (pos: number | null, children: ThreadNode[] = []) =>
    ({ id: `t${pos}`, stack: { pos, total: 4 }, prs: [], children }) as unknown as ThreadNode;
  const g = (threads: ThreadNode[]): Branch => ({ id: "g", label: "g", branches: [], threads });

  test("is the position of the thread that made the stack PR", () => {
    expect(ownPos(g([t(null), t(2)]))).toBe(2);
  });
  test("finds the position on a subthread", () => {
    expect(ownPos(g([t(null, [t(3)])]))).toBe(3);
  });
  test("is undefined when no thread has a position", () => {
    expect(ownPos(g([t(null)]))).toBeUndefined();
  });
});

describe("stopLabel", () => {
  test.each([
    [undefined, 4, true, ""],
    [2, 4, false, "2"],
    [2, 4, true, "2 of 4"],
  ])("%p of %i, partial %p is %p", (n, total, partial, out) => {
    expect(stopLabel(n, total, partial)).toBe(out);
  });
});
