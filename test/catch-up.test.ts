import { describe, expect, test } from "bun:test";

import { catchUpService, parseAnswer } from "../src/server/catch-up.ts";
import type { ModelResult } from "../src/server/model.ts";
import type { ModelPick } from "../src/shared/model.ts";
import type { Status, ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const ANSWER = { did: "Built it.", ask: "Ship it?", options: ["yes", "no"], doneLike: false };

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

const wait = () => Bun.sleep(40);

function setup(settings: { pick: ModelPick | null; catchUp: boolean } = { pick: "claude", catchUp: true }, max = 2) {
  const calls: { pick: ModelPick; input: string; cancelled: boolean; finish: (r: ModelResult | null) => void }[] = [];
  let changes = 0;
  let current = settings;
  const service = catchUpService({
    run: (pick, job) => {
      let finish!: (r: ModelResult | null) => void;
      const done = new Promise<ModelResult | null>((r) => (finish = r));
      const call = { pick, input: job.input, cancelled: false, finish };
      calls.push(call);
      return {
        done,
        cancel: () => {
          call.cancelled = true;
          finish(null);
        },
      };
    },
    settings: () => current,
    onChange: () => changes++,
    delayMs: 10,
    max,
  });
  const messages = new Map<string, { id: string; text: string } | null>();
  const sync = (nodes: ThreadNode[]) =>
    service.sync(
      nodes,
      (ids) => new Map(ids.map((id) => [id, messages.get(id) ?? { id: `m-${id}`, text: `text ${id}` }])),
      NOW,
    );
  return { service, calls, sync, messages, changes: () => changes, set: (s: typeof settings) => (current = s) };
}

describe("parseAnswer", () => {
  test("cuts did, ask and each option, and keeps 4 options", () => {
    const r = parseAnswer({
      did: "d".repeat(200),
      ask: "a".repeat(200),
      options: ["o".repeat(100), "2", "3", "4", "5"],
      doneLike: true,
    })!;
    expect(r.did).toHaveLength(140);
    expect(r.did.endsWith("…")).toBe(true);
    expect(r.ask).toHaveLength(120);
    expect(r.options).toHaveLength(4);
    expect(r.options[0]).toHaveLength(60);
    expect(r.doneLike).toBe(true);
  });
  test("keeps a null ask and short text", () => {
    expect(parseAnswer({ ...ANSWER, ask: null })).toEqual({ ...ANSWER, ask: null });
  });
  test("reads an empty or null-word ask as null", () => {
    for (const ask of ["", "null", " NULL "]) expect(parseAnswer({ ...ANSWER, ask })!.ask).toBeNull();
    expect(parseAnswer({ ...ANSWER, ask: "Ship it?" })!.ask).toBe("Ship it?");
  });
  test("drops empty and null-word options before the 4 cut", () => {
    expect(parseAnswer({ ...ANSWER, options: ["A", "", "null", " Null ", "B"] })!.options).toEqual(["A", "B"]);
    expect(parseAnswer({ ...ANSWER, options: ["", "null", "NULL", "a", "b", "c", "d"] })!.options).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  test("an invalid shape gives null", () => {
    expect(parseAnswer(null)).toBeNull();
    expect(parseAnswer({ did: "x" })).toBeNull();
    expect(parseAnswer({ ...ANSWER, doneLike: "yes" })).toBeNull();
  });
});

describe("trigger", () => {
  test("each waiting status gets a call; other statuses do not", async () => {
    const t = setup(undefined, 20);
    const waiting: Status[] = ["needs-input", "plan-ready", "your-turn", "failed"];
    const other: Status[] = ["working", "done", "starting", "idle", "interrupted"];
    t.sync([...waiting, ...other].map((s) => node(s, { status: s })));
    await wait();
    expect(t.calls).toHaveLength(4);
  });
  test("a snoozed or settled thread gets no call", async () => {
    const t = setup();
    t.sync([node("a", { snoozedUntil: "2026-11-14T00:00:00.000Z" }), node("b", { settled: true })]);
    await wait();
    expect(t.calls).toHaveLength(0);
  });
  test("the same key twice gives one call", async () => {
    const t = setup();
    t.sync([node("a")]);
    t.sync([node("a")]);
    await wait();
    t.sync([node("a")]);
    await wait();
    expect(t.calls).toHaveLength(1);
  });
  test("a key that changes before the delay calls only the new key", async () => {
    const t = setup();
    t.sync([node("a")]);
    t.messages.set("a", { id: "m2", text: "newer" });
    t.sync([node("a")]);
    await wait();
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].input).toContain("newer");
  });
  test("a thread that leaves the wait before the delay gets no call", async () => {
    const t = setup();
    t.sync([node("a")]);
    t.sync([node("a", { status: "working" })]);
    await wait();
    expect(t.calls).toHaveLength(0);
  });
  test("a needs-input request change is a new key", async () => {
    const t = setup();
    t.sync([node("a", { status: "needs-input", since: "s1" })]);
    await wait();
    t.calls[0].finish({ answer: ANSWER });
    await wait();
    t.sync([node("a", { status: "needs-input", since: "s2" })]);
    await wait();
    expect(t.calls).toHaveLength(2);
  });
  test("the input holds a 4000-character tail", async () => {
    const t = setup();
    t.messages.set("a", { id: "m", text: "x".repeat(5000) });
    t.sync([node("a")]);
    await wait();
    expect(t.calls[0].input.split("\n")[1]).toHaveLength(2 + 1 + 4000);
  });
});

describe("queue", () => {
  test("two run, the third is queued, and the oldest wait starts next", async () => {
    const t = setup();
    const at = (n: number) => `2026-11-13T0${n}:00:00.000Z`;
    t.sync([node("late", { since: at(5) }), node("early", { since: at(1) }), node("mid", { since: at(3) })]);
    await wait();
    expect(t.calls).toHaveLength(2);
    expect(t.service.of("late")?.state).toBe("queued");
    expect(t.calls.map((c) => c.input)).toEqual([expect.stringContaining("early"), expect.stringContaining("mid")]);
    t.calls[0].finish({ answer: ANSWER });
    await wait();
    expect(t.calls).toHaveLength(3);
    expect(t.calls[2].input).toContain("late");
    expect(t.service.of("early")).toMatchObject({ state: "done", did: "Built it." });
  });
});

describe("queue order fallback", () => {
  test("a thread with no Wait is ordered by updatedAt, not last", async () => {
    const t = setup(undefined, 1);
    const old = { since: null, updatedAt: "2026-11-13T01:00:00.000Z" };
    t.sync([
      node("a", { since: "2026-11-13T05:00:00.000Z" }),
      node("b", { since: "2026-11-13T04:00:00.000Z" }),
      node("c", { status: "failed", ...old }),
    ]);
    await wait();
    expect(t.calls[0].input).toContain("Thread c");
  });
  test("a run that throws is failed, and the next entry runs", async () => {
    const t = catchUpService({
      run: () => {
        throw new Error("spawn");
      },
      settings: () => ({ pick: "claude", catchUp: true }),
      onChange: () => {},
      delayMs: 10,
    });
    t.sync([node("a")], () => new Map(), NOW);
    await wait();
    expect(t.of("a")?.state).toBe("failed");
  });
});

describe("question", () => {
  test("a done and a failed entry carry the question of the last message; a queued one has none", async () => {
    const t = setup(undefined, 1);
    t.messages.set("a", { id: "m-a", text: "Did it. Ship it?" });
    t.messages.set("b", { id: "m-b", text: "Could not finish. Retry?" });
    t.sync([node("a", { since: "2026-11-13T01:00:00.000Z" }), node("b", { since: "2026-11-13T02:00:00.000Z" })]);
    await wait();
    expect(t.service.of("b")).toEqual({ state: "queued", pick: "claude" });
    t.calls[0].finish({ answer: ANSWER });
    await wait();
    expect(t.service.of("a")?.question).toBe("Ship it?");
    t.calls[1].finish({ error: "boom", detail: "" });
    await wait();
    expect(t.service.of("b")).toEqual({ state: "failed", pick: "claude", question: "Retry?" });
  });
});

describe("failure", () => {
  test("a model error is failed, and the same key makes no new call", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    t.calls[0].finish({ error: "boom", detail: "" });
    await wait();
    expect(t.service.of("a")).toEqual({ state: "failed", pick: "claude", question: "text a" });
    t.sync([node("a")]);
    await wait();
    expect(t.calls).toHaveLength(1);
  });
  test("an invalid answer is failed", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    t.calls[0].finish({ answer: { did: 1 } });
    await wait();
    expect(t.service.of("a")?.state).toBe("failed");
  });
});

describe("drop and switch off", () => {
  test("a thread that settles while its call runs cancels it and loses its entry", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    t.sync([node("a", { settled: true })]);
    expect(t.calls[0].cancelled).toBe(true);
    expect(t.service.of("a")).toBeUndefined();
  });
  test("a thread that is gone from the tree loses its entry", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    t.sync([]);
    expect(t.calls[0].cancelled).toBe(true);
  });
  test("clear cancels running calls and empties the queue and the cache", async () => {
    const t = setup(undefined, 1);
    t.sync([node("a", { since: "2026-11-13T01:00:00.000Z" }), node("b", { since: "2026-11-13T02:00:00.000Z" })]);
    await wait();
    t.service.clear();
    expect(t.calls[0].cancelled).toBe(true);
    expect(t.service.of("a")).toBeUndefined();
    expect(t.service.of("b")).toBeUndefined();
    await wait();
    expect(t.calls).toHaveLength(1);
  });
  test("settings off starts nothing", async () => {
    const t = setup({ pick: "local", catchUp: false });
    t.sync([node("a")]);
    await wait();
    expect(t.calls).toHaveLength(0);
  });
  test("a sync with nothing to drop does not call onChange", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    const before = t.changes();
    t.sync([node("a")]);
    expect(t.changes()).toBe(before);
  });
});

describe("pick", () => {
  test("a cached entry keeps its pick when the pick changes", async () => {
    const t = setup();
    t.sync([node("a")]);
    await wait();
    t.calls[0].finish({ answer: ANSWER });
    await wait();
    t.set({ pick: "codex", catchUp: true });
    t.sync([node("a"), node("b")]);
    await wait();
    expect(t.service.of("a")?.pick).toBe("claude");
    expect(t.service.of("b")?.pick).toBe("codex");
    expect(t.calls.map((c) => c.pick)).toEqual(["claude", "codex"]);
  });
});
