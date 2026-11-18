import { describe, expect, test } from "bun:test";

import { labelStore } from "../src/server/labels.ts";
import type { Pr, Thread } from "../src/server/t3.ts";
import type { Label } from "../src/shared/tree.ts";

type Answer = { labels: Label[]; updatedAt: string };
type Ref = { projectId: string; host: string; repository: string; number: number };

const RFR = { name: "ready-for-review", color: "0e8a16" };
const T1 = "2026-11-12T10:00:00.000Z";
const T2 = "2026-11-12T10:05:00.000Z";

const pr = (n: number, over: Partial<Pr> = {}): Pr =>
  ({ n, host: "github.com", repository: "org/repo", updatedAt: T1, source: "created", state: "open", ...over }) as Pr;
const thread = (prs: Pr[], over: Partial<Thread> = {}): Thread =>
  ({
    id: "t",
    projectId: "p",
    parentThreadId: null,
    sideChat: false,
    gone: false,
    settledAt: null,
    prs,
    ...over,
  }) as Thread;

/** Each `detail` call waits on a promise the test settles. */
function setup() {
  const calls: { ref: Ref; resolve: (a: Answer | "dropped") => void; reject: () => void }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let changes = 0;
  const store = labelStore({
    detail: (ref) =>
      new Promise((resolve, reject) => {
        calls.push({ ref, resolve, reject });
      }),
    onChange: () => changes++,
    later: (fn, ms) => timers.push({ fn, ms }),
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { store, calls, timers, changes: () => changes, flush };
}

const answer = (updatedAt = T1, labels = [RFR]): Answer => ({ labels, updatedAt });

describe("labelStore", () => {
  test("the first snapshot calls each eligible PR once", async () => {
    const s = setup();
    s.store.sync([thread([pr(1), pr(2)])], true);
    s.store.sync([thread([pr(1), pr(2)])], true);
    expect(s.calls.map((c) => c.ref.number)).toEqual([1, 2]);
    expect(s.calls[0].ref).toEqual({ projectId: "p", host: "github.com", repository: "org/repo", number: 1 });
  });

  test("a link with no snapshot gets one call, then one when its snapshot arrives", async () => {
    const s = setup();
    s.store.sync([thread([pr(1, { updatedAt: "" })])], true);
    s.calls[0].resolve(answer(""));
    await s.flush();
    s.store.sync([thread([pr(1, { updatedAt: "" })])], true);
    expect(s.calls).toHaveLength(1);
    s.store.sync([thread([pr(1)])], true);
    expect(s.calls).toHaveLength(2);
  });

  test("a dropped call makes no call until the next sync", async () => {
    const s = setup();
    s.store.sync([thread([pr(1)])], true);
    s.calls[0].resolve("dropped");
    await s.flush();
    expect(s.calls).toHaveLength(1);
    s.store.sync([thread([pr(1)])], true);
    expect(s.calls).toHaveLength(2);
  });

  test("an unchanged updatedAt after a reconnect makes no call; a changed one does", async () => {
    const s = setup();
    s.store.sync([thread([pr(1)])], true);
    s.calls[0].resolve(answer());
    await s.flush();
    s.store.sync([thread([pr(1)])], true);
    expect(s.calls).toHaveLength(1);
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    expect(s.calls).toHaveLength(2);
  });

  test("a stale answer retries once after 60 s", async () => {
    const s = setup();
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    s.calls[0].resolve(answer(T1));
    await s.flush();
    expect(s.timers.map((t) => t.ms)).toEqual([60_000]);
    s.timers[0].fn();
    expect(s.calls).toHaveLength(2);
    s.calls[1].resolve(answer(T1));
    await s.flush();
    expect(s.timers).toHaveLength(1);
    expect(s.calls).toHaveLength(2);
  });

  test("a failure keeps the last labels and waits for the next change", async () => {
    const s = setup();
    const p = pr(1);
    s.store.sync([thread([p])], true);
    s.calls[0].resolve(answer());
    await s.flush();
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    s.calls[1].reject();
    await s.flush();
    expect(s.store.labelsOf(p)).toEqual([RFR]);
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    expect(s.calls).toHaveLength(2);
  });

  test("no call with active false; queued keys go out when it turns true", () => {
    const s = setup();
    s.store.sync([thread([pr(1)])], false);
    expect(s.calls).toHaveLength(0);
    s.store.sync([thread([pr(1)])], true);
    expect(s.calls).toHaveLength(1);
  });

  test("settled threads, children, side chats, stack PRs and closed PRs are skipped", () => {
    const s = setup();
    s.store.sync(
      [
        thread([pr(1)], { settledAt: T1 }),
        thread([pr(2)], { parentThreadId: "x" }),
        thread([pr(3)], { sideChat: true }),
        thread([pr(4)], { gone: true }),
        thread([pr(5, { source: "stack" }), pr(6, { source: "stack-dismissed" }), pr(7, { state: "merged" })]),
      ],
      true,
    );
    expect(s.calls).toHaveLength(0);
  });

  test("two threads on one PR make one call", () => {
    const s = setup();
    s.store.sync([thread([pr(1)]), thread([pr(1, { updatedAt: T2 })])], true);
    expect(s.calls).toHaveLength(1);
  });

  test("at most 4 calls at a time", async () => {
    const s = setup();
    s.store.sync([thread([1, 2, 3, 4, 5, 6].map((n) => pr(n)))], true);
    expect(s.calls).toHaveLength(4);
    s.calls[0].resolve(answer());
    await s.flush();
    expect(s.calls).toHaveLength(5);
  });

  test("onChange only when the labels change", async () => {
    const s = setup();
    s.store.sync([thread([pr(1)])], true);
    s.calls[0].resolve(answer());
    await s.flush();
    expect(s.changes()).toBe(1);
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    s.calls[1].resolve(answer(T2));
    await s.flush();
    expect(s.changes()).toBe(1);
  });

  test("a snapshot that moves during a call makes one more call", async () => {
    const s = setup();
    s.store.sync([thread([pr(1)])], true);
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    expect(s.calls).toHaveLength(1);
    s.calls[0].resolve(answer());
    await s.flush();
    expect(s.calls).toHaveLength(2);
  });

  test("a queued retry that a snapshot change overtakes gets its retry flag cleared", async () => {
    const s = setup();
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], true);
    s.calls[0].resolve(answer(T1));
    await s.flush();
    s.store.sync([thread([pr(1, { updatedAt: T2 })])], false);
    s.timers[0].fn();
    const T3 = "2026-11-12T10:10:00.000Z";
    s.store.sync([thread([pr(1, { updatedAt: T3 })])], true);
    expect(s.calls).toHaveLength(2);
    s.calls[1].resolve(answer(T2));
    await s.flush();
    expect(s.timers).toHaveLength(2);
  });

  test("links with no host or repository are skipped", () => {
    const s = setup();
    s.store.sync([thread([pr(1, { host: "" }), pr(2, { repository: "" })])], true);
    expect(s.calls).toHaveLength(0);
  });
});
