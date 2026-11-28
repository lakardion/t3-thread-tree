import { describe, expect, test } from "bun:test";

import { buildTree, defaultRules } from "../src/server/build-tree.ts";
import { settledPage, settledRoutes, settledSignature } from "../src/server/settled.ts";
import type { Project, Thread } from "../src/server/t3.ts";

const thread = (id: string, o: Partial<Thread> = {}): Thread =>
  ({
    id,
    projectId: "p",
    title: id,
    status: "idle",
    parentThreadId: null,
    sideChat: false,
    pending: null,
    guestMessages: null,
    activityRunStatus: null,
    snoozedUntil: null,
    updatedAt: "2026-01-01T00:00:00Z",
    settledAt: null,
    gone: false,
    prs: [],
    tags: [],
    ...o,
  }) as unknown as Thread;
const at = (day: number) => `2026-02-${String(day).padStart(2, "0")}T00:00:00Z`;

const pages = (list: Thread[], spawners: Record<string, string> = {}) => {
  const threads = new Map(list.map((t) => [t.id, t]));
  const projects = new Map<string, Project>([["p", { title: "Proj", repo: null }]]);
  const tree = () =>
    buildTree(
      {
        threads: threads.values(),
        projects,
        spawnerOf: (id) => spawners[id],
        environmentId: "e",
        settled: true,
        now: 0,
      },
      defaultRules(),
    );
  return (after: string | null, limit: number) => settledPage(tree(), threads, after, limit);
};
const ids = (p: ReturnType<ReturnType<typeof pages>>) => p.items.map((i) => i.t.id);

describe("settledPage", () => {
  const list = [
    thread("a", { settledAt: at(1), title: "TIB-1 a" }),
    thread("b", { settledAt: at(3) }),
    thread("c", { settledAt: at(2) }),
    thread("d", { settledAt: at(3) }),
    thread("live"),
  ];
  const page = pages(list);

  test("orders newest settle first, ties by id", () => {
    expect(ids(page(null, 10))).toEqual(["d", "b", "c", "a"]);
  });

  test("the cursor continues with no overlap and no gap; next is null on the last page", () => {
    const first = page(null, 3);
    expect(ids(first)).toEqual(["d", "b", "c"]);
    expect(first.next).not.toBeNull();
    const second = page(first.next, 3);
    expect(ids(second)).toEqual(["a"]);
    expect(second.next).toBeNull();
  });

  test("respects the limit and counts all settled threads", () => {
    const p = page(null, 2);
    expect(p.items).toHaveLength(2);
    expect(p.total).toBe(4);
  });

  test("pairs each thread with its project and a keyed chip source", () => {
    const item = page(null, 10).items.find((i) => i.t.id === "a")!;
    expect(item.project).toMatchObject({ label: "Proj", groups: [], threads: [] });
    expect(item.t.key).toBe("TIB-1");
  });

  test("leaves active threads out and includes settled Reviews threads", () => {
    const p = pages([
      thread("r", { title: "Review #5", settledAt: at(1) }),
      thread("ra", { title: "Review #6" }),
      thread("x"),
    ]);
    expect(ids(p(null, 10))).toEqual(["r"]);
  });

  test("a settled thread with an active spawner is a page item, not a child", () => {
    const p = pages([thread("parent"), thread("kid", { settledAt: at(1) })], { kid: "parent" });
    const out = p(null, 10);
    expect(ids(out)).toEqual(["kid"]);
    expect(out.items[0].t.children).toEqual([]);
  });

  test("a settled member nested under its settled root is a page item too", () => {
    const p = pages([thread("root", { settledAt: at(1) }), thread("kid", { settledAt: at(2) })], { kid: "root" });
    expect(ids(p(null, 10))).toEqual(["kid", "root"]);
  });

  test("skips a settled node with no thread of its own, such as a Map header", () => {
    const a = thread("a", { settledAt: at(1) });
    const tree = buildTree(
      {
        threads: [a],
        projects: new Map([["p", { title: "Proj", repo: null }]]),
        spawnerOf: () => undefined,
        environmentId: "e",
        settled: true,
        now: 0,
      },
      defaultRules(),
    );
    const node = tree[0].threads[0];
    tree[0].threads.push({ ...node, id: "map:TIB-1" });
    const out = settledPage(tree, new Map([["a", a]]), null, 10);
    expect(ids(out)).toEqual(["a"]);
    expect(out.total).toBe(1);
  });
});

describe("settledSignature", () => {
  const sig = (...t: Thread[]) => settledSignature(t);

  test("is empty with no settled thread", () => {
    expect(sig(thread("a"))).toBe("");
  });

  test("changes on settle, unsettle and a settled thread update", () => {
    const base = sig(thread("a", { settledAt: at(1) }));
    expect(sig(thread("a", { settledAt: at(1) }), thread("b", { settledAt: at(2) }))).not.toBe(base);
    expect(sig(thread("a"))).not.toBe(base);
    expect(sig(thread("a", { settledAt: at(1), updatedAt: "2026-03-01T00:00:00Z" }))).not.toBe(base);
  });

  test("ignores subthreads, side chats and gone threads", () => {
    expect(
      sig(
        thread("a", { settledAt: at(1), parentThreadId: "x" }),
        thread("b", { settledAt: at(1), sideChat: true }),
        thread("c", { settledAt: at(1), gone: true }),
      ),
    ).toBe("");
  });
});

describe("settledRoutes", () => {
  test("defaults the limit to 50, clamps it to 1..1000 and passes the cursor", async () => {
    const calls: [string | null, number][] = [];
    const get = settledRoutes({
      page: (after, limit) => (calls.push([after, limit]), { items: [], next: null, total: 0 }),
    })["/settled"].GET;
    for (const q of ["", "?limit=abc", "?limit=5000", "?limit=0", "?limit=7&after=k"])
      get(new Request(`http://x/settled${q}`));
    expect(calls).toEqual([
      [null, 50],
      [null, 50],
      [null, 1000],
      [null, 1],
      ["k", 7],
    ]);
  });
});

describe("step threads", () => {
  test("a settled step thread is not in the signature", () => {
    const step = thread("s", { settledAt: at(1), workflowRun: { runId: "r", workflow: "w", step: "plan" } });
    expect(settledSignature([step])).toBe("");
    expect(settledSignature([step, thread("x", { settledAt: at(2) })])).toMatch(/^1:/);
  });
});
