import { describe, expect, test } from "bun:test";

import { graphKeys, isFresh, lineageMembers, prGraph, prGraphRoutes, type GraphCtx } from "../src/server/pr-graph.ts";
import type { ListRow, Pr, Thread } from "../src/server/t3.ts";
import { parseScope } from "../src/shared/pr-graph-data.ts";
import { rowMatches } from "../src/shared/pr-graph.ts";

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

const det = (over: Partial<Awaited<ReturnType<Parameters<typeof prGraph>[0]["detail"]>>> = {}) => ({
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

describe("lineageMembers", () => {
  const spawners: Record<string, string> = { a: "r", b: "a", c: "r" };
  const all = ["r", "a", "b", "c", "m", "lone"];
  const members = (root: string, stacks: string[][] = [], ids = all) => {
    const found = lineageMembers({
      root,
      threads: ids.map((id) => thread(id, { settledAt: id === "b" ? "2026-01-01T00:00:00Z" : null, gone: id === "c" })),
      spawnerOf: (id) => spawners[id] ?? null,
      known: (id) => all.includes(id),
      isStep: () => false,
      createdKey: (id) => id,
      stacks,
      issueKeyOf: () => false,
    });
    return found && found.map((t) => t.id);
  };

  test("null for an unknown id, an id with a spawner and a lone top-level thread", () => {
    expect(members("nope")).toBeNull();
    expect(members("a")).toBeNull();
    expect(members("lone")).toBeNull();
  });

  test("the root, settled and archived members and a keyless stack mate, oldest first", () => {
    expect(members("r", [["a", "m"]])).toEqual(["a", "b", "c", "m", "r"]);
  });

  test("a stack mate with no stack is no member", () => {
    expect(members("r")).toEqual(["a", "b", "c", "r"]);
  });

  test("a root that is not in the threads is left out", () => {
    expect(members("r", [], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("prGraph", () => {
  const MAP = { kind: "map", key: "k" } as const;
  const ctx =
    (members: Thread[] = [thread("m1", { title: "ABC-1 · a" })]): (() => GraphCtx | null) =>
    () => ({
      members,
      projects: [{ id: "p", path: "/p" }],
      group: { mapKey: "k", projectOf: () => "p" },
      threadOf: (_, n) => (n === 1 ? "m1" : null),
      hrefOf: (id) => `h:${id}`,
    });
  const setup = (over: Partial<Parameters<typeof prGraph>[0]> = {}) => {
    const calls = { list: 0, detail: 0, archived: 0, active: 0, peak: 0 };
    const track = async <T>(kind: "list" | "detail", value: () => T) => {
      calls[kind]++;
      calls.peak = Math.max(calls.peak, ++calls.active);
      await Bun.sleep(1);
      calls.active--;
      return value();
    };
    const g = prGraph({
      list: (_, q) => track("list", () => ({ rows: [row(1, { head: `${q.toLowerCase()}-x` })], error: null })),
      detail: () => track("detail", () => det()),
      archived: async () => (calls.archived++, []),
      readMap: async () => null,
      root: async () => null,
      now: () => 0,
      ...over,
    });
    return { g, calls };
  };

  test("a missing map.md gives null lanes and stacks", async () => {
    const data = await setup().g.get("map:k", MAP, ctx(), false);
    expect(data?.group?.lanes).toBeNull();
    expect(data?.group?.stacks).toBeNull();
  });

  test("no member gives null", async () => {
    expect(await setup().g.get("map:k", MAP, () => null, false)).toBeNull();
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
    await g.get("map:k", MAP, ctx(members), false);
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
    const data = await g.get("map:k", MAP, ctx(members), false);
    expect(data?.group?.errors).toEqual([{ key: "ABC-1", text: "boom" }]);
    expect(data?.group?.rows.map((r) => r.n)).toEqual([2]);
  });

  test("a failed detail adds nothing", async () => {
    const { g } = setup({
      list: async () => ({ rows: [row(1, { head: "abc-1-x", stack: { number: 1, pos: 1, total: 2 } })], error: null }),
      detail: async () => Promise.reject(new Error("no")),
    });
    const data = await g.get("map:k", MAP, ctx(), false);
    expect(data?.behind).toEqual({});
    expect(data?.group?.errors).toEqual([]);
    expect(data?.group?.rows).toHaveLength(1);
  });

  test("behind comes from rows and member PRs", async () => {
    const pr = { n: 7, state: "open", stackNumber: 3, host: "github.com", repository: "a/b" } as Pr;
    const { g } = setup({
      list: async () => ({ rows: [row(1, { head: "abc-1-x", stack: { number: 1, pos: 1, total: 2 } })], error: null }),
    });
    const data = await g.get("map:k", MAP, ctx([thread("m1", { title: "ABC-1", prs: [pr] })]), false);
    expect(data?.behind).toEqual({ "a/b#1": 2, "a/b#7": 2 });
  });

  test("a cache hit makes no call, refresh calls again", async () => {
    const { g, calls } = setup();
    await g.get("map:k", MAP, ctx(), false);
    const first = calls.list;
    await g.get("map:k", MAP, ctx(), false);
    expect(calls.list).toBe(first);
    await g.get("map:k", MAP, ctx(), true);
    expect(calls.list).toBe(first * 2);
  });

  test("a running call is shared", async () => {
    const { g, calls } = setup();
    await Promise.all([g.get("map:k", MAP, ctx(), false), g.get("map:k", MAP, ctx(), false)]);
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
    const data = await g.get("map:k", MAP, ctx(members), false);
    expect(data?.group?.rows).toHaveLength(1);
    expect(data?.group?.rows[0].threadId).toBe("m1");
  });

  test("settled and archived members come with their status", async () => {
    const data = await setup().g.get(
      "map:k",
      MAP,
      ctx([thread("live"), thread("done", { settledAt: "2026-01-01T00:00:00Z" }), thread("old", { gone: true })]),
      false,
    );
    expect(data?.group?.settled.map((s) => s.id)).toEqual(["done", "old"]);
  });

  describe("scopes", () => {
    const ALL = { kind: "all" } as const;
    const PROJECT = { kind: "project", id: "p" } as const;
    const allCtx =
      (members: Thread[] = [thread("m1", { title: "ABC-1 · a" })]): (() => GraphCtx | null) =>
      () => ({
        members,
        projects: [{ id: "p", path: "/p" }],
        group: null,
        threadOf: () => null,
        hrefOf: (id) => `h:${id}`,
      });

    test("two scope ids build twice, one id twice within 60 s builds once", async () => {
      const builds: string[] = [];
      const { g } = setup();
      const ctxOf = (scopeId: string) => (): GraphCtx | null => (builds.push(scopeId), allCtx()());
      await g.get("all", ALL, ctxOf("all"), false);
      await g.get("project:p", PROJECT, ctxOf("project:p"), false);
      await g.get("all", ALL, ctxOf("all"), false);
      expect(builds).toEqual(["all", "project:p"]);
    });

    test("All scope reads no archived, no list and no map.md, and has no map part", async () => {
      const seen = { readMap: 0 };
      const { g, calls } = setup({ readMap: async () => (seen.readMap++, null) });
      const pr = { n: 7, state: "open", stackNumber: 3, host: "github.com", repository: "a/b" } as Pr;
      const data = await g.get("all", ALL, allCtx([thread("m1", { title: "ABC-1", prs: [pr] })]), false);
      expect(data?.group).toBeNull();
      expect([calls.archived, calls.list, seen.readMap]).toEqual([0, 0, 0]);
      expect(data?.behind).toEqual({ "a/b#7": 2 });
    });

    test("roots: a null answer gives no entry, no path gives no call", async () => {
      const asked: string[] = [];
      const { g } = setup({ root: async (path) => (asked.push(path), path === "/a" ? "master" : null) });
      const ctxOf = () => ({
        ...allCtx()()!,
        projects: [
          { id: "a", path: "/a" },
          { id: "b", path: "/b" },
          { id: "none", path: null },
        ],
      });
      const data = await g.get("all", ALL, ctxOf, false);
      expect(data?.roots).toEqual({ a: "master" });
      expect(asked.toSorted()).toEqual(["/a", "/b"]);
    });

    test("the map scope carries the root of the map project", async () => {
      const { g } = setup({ root: async () => "main" });
      const data = await g.get("map:k", MAP, ctx(), false);
      expect(data?.roots).toEqual({ p: "main" });
    });
  });

  describe("lineage scope", () => {
    const LINEAGE = { kind: "lineage", id: "r" } as const;
    const lineageCtx = (): GraphCtx => {
      const members = [
        thread("m1", { title: "ABC-1 · a", projectId: "p1" }),
        thread("m2", { title: "XYZ-2 · b", projectId: "p2", settledAt: "2026-01-01T00:00:00Z" }),
      ];
      return {
        members,
        projects: [
          { id: "p1", path: "/p1" },
          { id: "p2", path: "/p2" },
        ],
        group: { mapKey: null, projectOf: (k) => members.find((t) => t.title.startsWith(k))!.projectId },
        threadOf: () => null,
        hrefOf: (id) => `h:${id}`,
      };
    };

    test("no lanes or stacks, no map.md, each key queried in its project, projectId on settled and rows", async () => {
      const asked: string[] = [];
      let read = 0;
      const { g, calls } = setup({
        readMap: async () => (read++, null),
        list: async (projectId, q) => (
          asked.push(`${projectId}:${q}`),
          { rows: [row(1, { head: `${q}-x` })], error: null }
        ),
      });
      const data = await g.get("lineage:r", LINEAGE, lineageCtx, false);
      expect(data?.group?.lanes).toBeNull();
      expect(data?.group?.stacks).toBeNull();
      expect(read).toBe(0);
      expect(calls.archived).toBe(1);
      expect(asked.toSorted()).toEqual(["p1:ABC-1", "p2:XYZ-2"]);
      expect(data?.group?.settled.map((s) => s.projectId)).toEqual(["p2"]);
      expect(data?.group?.rows.map((r) => r.projectId)).toEqual(["p"]);
    });
  });

  describe("prGraphRoutes", () => {
    const route = (o: { up?: boolean; data?: unknown } = {}) =>
      prGraphRoutes({
        up: () => o.up ?? true,
        get: async (_id, scope) => (o.data === undefined ? null : ({ scope, ...(o.data as object) } as never)),
        timeout: () => {},
      })["/pr-graph"].GET;
    const ask = (get: ReturnType<typeof route>, q: string) => get(new Request(`http://x/pr-graph${q}`));

    test("a missing or bad scope gives 404, even when down", async () => {
      expect((await ask(route({ up: false }), "")).status).toBe(404);
      expect((await ask(route({ up: false }), "?scope=bad")).status).toBe(404);
    });
    test("T3 down gives 503", async () => {
      expect((await ask(route({ up: false }), "?scope=all")).status).toBe(503);
    });
    test("no answer gives 404", async () => {
      expect((await ask(route(), "?scope=project:x")).status).toBe(404);
      expect((await ask(route(), "?scope=lineage:x")).status).toBe(404);
    });
    test("an answer gives JSON", async () => {
      const res = await ask(route({ data: { at: "t" } }), "?scope=map:/m");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ at: "t", scope: parseScope("map:/m") });
    });
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
      const data = await g.get("map:k", MAP, ctx([owner([1, 2])]), false);
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
      const data = await g.get("map:k", MAP, ctx([owner([1, 2], [link])]), false);
      expect(seen).toEqual([1]);
      expect(data?.mates.map((m) => [m.n, m.head, m.stack?.pos])).toEqual([[2, "h2", 2]]);
    });

    test("a slot that a row holds gives no mate", async () => {
      const { g } = setup({
        list: async () => ({ rows: [row(2, { head: "abc-1-x" })], error: null }),
      });
      const data = await g.get("map:k", MAP, ctx([owner([1, 2])]), false);
      expect(data?.mates).toEqual([]);
    });

    test("a failed mate detail adds nothing", async () => {
      const { g } = setup({ ...keep, detail: async () => Promise.reject(new Error("no")) });
      const data = await g.get("map:k", MAP, ctx([owner([1, 2])]), false);
      expect(data?.mates).toEqual([]);
      expect(data?.group?.errors).toEqual([]);
    });

    test("an open mate behindBy lands in behind with one call for it", async () => {
      const seen: number[] = [];
      const { g } = setup({
        ...keep,
        detail: async (r) => (seen.push(r.number), det({ behindBy: r.number === 2 ? 4 : null })),
      });
      const data = await g.get("map:k", MAP, ctx([owner([1, 2])]), false);
      expect(seen.filter((n) => n === 2)).toHaveLength(1);
      expect(data?.behind["a/b#2"]).toBe(4);
    });
  });
});
