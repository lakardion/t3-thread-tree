import { describe, expect, test } from "bun:test";

import { graphKeys, isFresh, mapGraph, rowMatches, type GraphCtx } from "../src/server/map-graph.ts";
import type { ListRow, Pr, Thread } from "../src/server/t3.ts";

const row = (n: number, over: Partial<ListRow> = {}): ListRow => ({
  n,
  url: `u${n}`,
  state: "open",
  draft: false,
  checks: null,
  review: null,
  conflicting: false,
  title: null,
  head: null,
  base: "main",
  stack: null,
  additions: null,
  deletions: null,
  changedFiles: null,
  labels: [],
  host: "github.com",
  repository: "a/b",
  projectId: "p",
  ...over,
});

const det = (over: Partial<Awaited<ReturnType<Parameters<typeof mapGraph>[0]["detail"]>>> = {}) => ({
  behindBy: 2,
  url: "du",
  title: "Mate",
  state: "open",
  draft: false,
  mergeability: "mergeable",
  head: "mate-head",
  base: "main",
  ...over,
});

const thread = (id: string, over: Partial<Thread> = {}): Thread =>
  ({
    id,
    projectId: "p",
    title: id,
    status: "idle",
    activityRunStatus: null,
    pending: null,
    guestMessages: null,
    snoozedUntil: null,
    updatedAt: "2026-01-01T00:00:00Z",
    settledAt: null,
    gone: false,
    prs: [],
    ...over,
  }) as unknown as Thread;

describe("rowMatches", () => {
  const abc = ["ABC-12"];
  test("head equal, prefix and case", () => {
    expect(rowMatches({ head: "abc-12", title: null }, abc)).toBe(true);
    expect(rowMatches({ head: "Abc-12-fix-it", title: null }, abc)).toBe(true);
  });
  test("abc-1 does not match abc-12-x", () => {
    expect(rowMatches({ head: "abc-12-x", title: null }, ["ABC-1"])).toBe(false);
  });
  test("title with the key as a word", () => {
    expect(rowMatches({ head: "x", title: "Fix ABC-12 now" }, abc)).toBe(true);
    expect(rowMatches({ head: "x", title: "Fix ABC-123 now" }, abc)).toBe(false);
  });
  test("a row that only the body matched is dropped", () => {
    expect(rowMatches({ head: "other", title: "Other" }, abc)).toBe(false);
  });
});

describe("graphKeys", () => {
  test("lane keys, then title keys, unique, markdown keys skipped", () => {
    const lanes = [
      {
        n: 1,
        label: "",
        explicit: true,
        keys: [
          { key: "ABC-1", base: "main" },
          { key: "my-map-03", base: "ABC-1" },
        ],
      },
    ];
    expect(graphKeys(lanes, ["XYZ-9 · a", "ABC-1 · b", "no key"])).toEqual(["ABC-1", "XYZ-9"]);
  });
});

describe("isFresh", () => {
  test("59 s fresh, 60 s stale, refresh always stale", () => {
    expect(isFresh({ at: 0 }, 59_000, false)).toBe(true);
    expect(isFresh({ at: 0 }, 60_000, false)).toBe(false);
    expect(isFresh({ at: 0 }, 0, true)).toBe(false);
  });
});

describe("mapGraph", () => {
  const ctx =
    (members: Thread[] = [thread("m1", { title: "ABC-1 · a" })]): (() => GraphCtx | null) =>
    () => ({
      members,
      project: "p",
      threadOf: (_, n) => (n === 1 ? "m1" : null),
      hrefOf: (id) => `h:${id}`,
    });
  const setup = (over: Partial<Parameters<typeof mapGraph>[0]> = {}) => {
    const calls = { list: 0, detail: 0, archived: 0, active: 0, peak: 0 };
    const track = async <T>(kind: "list" | "detail", value: () => T) => {
      calls[kind]++;
      calls.peak = Math.max(calls.peak, ++calls.active);
      await Bun.sleep(1);
      calls.active--;
      return value();
    };
    const g = mapGraph({
      list: (_, q) => track("list", () => ({ rows: [row(1, { head: `${q.toLowerCase()}-x` })], error: null })),
      detail: () => track("detail", () => det()),
      archived: async () => (calls.archived++, []),
      readMap: async () => null,
      now: () => 0,
      ...over,
    });
    return { g, calls };
  };

  test("a missing map.md gives null lanes and stacks", async () => {
    const data = await setup().g.get("k", ctx(), false);
    expect(data?.lanes).toBeNull();
    expect(data?.stacks).toBeNull();
  });

  test("no member gives null", async () => {
    expect(await setup().g.get("k", () => null, false)).toBeNull();
  });

  test("at most 4 calls at once", async () => {
    const members = Array.from({ length: 12 }, (_, i) => thread(`m${i}`, { title: `KEY-${i} · t` }));
    const calls = { list: 0, active: 0, peak: 0 };
    const { g } = setup({
      list: async () => {
        calls.list++;
        calls.peak = Math.max(calls.peak, ++calls.active);
        await Bun.sleep(2);
        calls.active--;
        return { rows: [], error: null };
      },
    });
    await g.get("k", ctx(members), false);
    expect(calls.list).toBe(12);
    expect(calls.peak).toBe(4);
  });

  test("a failed list gives one error and the others still answer", async () => {
    const { g } = setup({
      list: async (_, q) => {
        if (q === "ABC-1") return { rows: [], error: "boom" };
        return { rows: [row(2, { head: "xyz-2-x" })], error: null };
      },
    });
    const members = [thread("a", { title: "ABC-1 · a" }), thread("b", { title: "XYZ-2 · b" })];
    const data = await g.get("k", ctx(members), false);
    expect(data?.errors).toEqual([{ key: "ABC-1", text: "boom" }]);
    expect(data?.rows.map((r) => r.n)).toEqual([2]);
  });

  test("a failed detail adds nothing", async () => {
    const { g } = setup({
      list: async () => ({ rows: [row(1, { head: "abc-1-x", stack: { number: 1, pos: 1, total: 2 } })], error: null }),
      detail: async () => Promise.reject(new Error("no")),
    });
    const data = await g.get("k", ctx(), false);
    expect(data?.behind).toEqual({});
    expect(data?.errors).toEqual([]);
    expect(data?.rows).toHaveLength(1);
  });

  test("behind comes from rows and member PRs", async () => {
    const pr = { n: 7, state: "open", stackNumber: 3, host: "github.com", repository: "a/b" } as Pr;
    const { g } = setup({
      list: async () => ({ rows: [row(1, { head: "abc-1-x", stack: { number: 1, pos: 1, total: 2 } })], error: null }),
    });
    const data = await g.get("k", ctx([thread("m1", { title: "ABC-1", prs: [pr] })]), false);
    expect(data?.behind).toEqual({ 1: 2, 7: 2 });
  });

  test("a cache hit makes no call, refresh calls again", async () => {
    const { g, calls } = setup();
    await g.get("k", ctx(), false);
    const first = calls.list;
    await g.get("k", ctx(), false);
    expect(calls.list).toBe(first);
    await g.get("k", ctx(), true);
    expect(calls.list).toBe(first * 2);
  });

  test("a running call is shared", async () => {
    const { g, calls } = setup();
    await Promise.all([g.get("k", ctx(), false), g.get("k", ctx(), false)]);
    expect(calls.archived).toBe(1);
  });

  test("duplicate rows across keys give one row, with the thread", async () => {
    const { g } = setup({
      list: async () => ({ rows: [row(1, { head: "abc-1-x" })], error: null }),
    });
    const members = [
      thread("a", { title: "ABC-1 · a" }),
      thread("b", { title: "ABC-1 · b" }),
      thread("c", { title: "ABC-2" }),
    ];
    const data = await g.get("k", ctx(members), false);
    expect(data?.rows).toHaveLength(1);
    expect(data?.rows[0].threadId).toBe("m1");
  });

  test("settled and archived members come with their status", async () => {
    const data = await setup().g.get(
      "k",
      ctx([thread("live"), thread("done", { settledAt: "2026-01-01T00:00:00Z" }), thread("old", { gone: true })]),
      false,
    );
    expect(data?.settled.map((s) => s.id)).toEqual(["done", "old"]);
  });

  describe("stack mates", () => {
    const owner = (slots: number[], links: Pr[] = []) =>
      thread("m1", {
        title: "ABC-1",
        prs: [
          {
            n: 1,
            state: "open",
            stackNumber: 5,
            stackSlots: slots,
            source: "created",
            host: "github.com",
            repository: "a/b",
            url: "u1",
          } as Pr,
          ...links,
        ],
      });
    const keep = { list: async () => ({ rows: [], error: null }) };

    test("a slot with no link and no row gives a mate from one detail call", async () => {
      const seen: number[] = [];
      const { g } = setup({
        ...keep,
        detail: async (r) => (seen.push(r.number), det({ behindBy: null })),
      });
      const data = await g.get("k", ctx([owner([1, 2])]), false);
      expect(seen.toSorted((a, b) => a - b)).toEqual([1, 2]);
      expect(data?.mates).toHaveLength(1);
      expect(data?.mates[0]).toMatchObject({
        n: 2,
        title: "Mate",
        head: "mate-head",
        checks: null,
        labels: [],
        stack: { number: 5, pos: 2, total: 2 },
        threadId: null,
        threadHref: null,
      });
    });

    test("a slot with a synced stack link gives a mate with no detail call", async () => {
      const link = {
        n: 2,
        state: "merged",
        stackNumber: 5,
        stackSlots: [1, 2],
        source: "stack",
        head: "h2",
        host: "github.com",
        repository: "a/b",
      } as Pr;
      const seen: number[] = [];
      const { g } = setup({ ...keep, detail: async (r) => (seen.push(r.number), det()) });
      const data = await g.get("k", ctx([owner([1, 2], [link])]), false);
      expect(seen).toEqual([1]);
      expect(data?.mates.map((m) => [m.n, m.head, m.stack?.pos])).toEqual([[2, "h2", 2]]);
    });

    test("a slot that a row holds gives no mate", async () => {
      const { g } = setup({
        list: async () => ({ rows: [row(2, { head: "abc-1-x" })], error: null }),
      });
      const data = await g.get("k", ctx([owner([1, 2])]), false);
      expect(data?.mates).toEqual([]);
    });

    test("a failed mate detail adds nothing", async () => {
      const { g } = setup({ ...keep, detail: async () => Promise.reject(new Error("no")) });
      const data = await g.get("k", ctx([owner([1, 2])]), false);
      expect(data?.mates).toEqual([]);
      expect(data?.errors).toEqual([]);
    });

    test("an open mate behindBy lands in behind with one call for it", async () => {
      const seen: number[] = [];
      const { g } = setup({
        ...keep,
        detail: async (r) => (seen.push(r.number), det({ behindBy: r.number === 2 ? 4 : null })),
      });
      const data = await g.get("k", ctx([owner([1, 2])]), false);
      expect(seen.filter((n) => n === 2)).toHaveLength(1);
      expect(data?.behind[2]).toBe(4);
    });
  });
});
