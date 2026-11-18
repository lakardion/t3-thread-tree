import { describe, expect, test } from "bun:test";

import type { LinearResult } from "../src/server/linear-api.ts";
import { linearStore } from "../src/server/linear.ts";
import type { LinearIssue } from "../src/shared/tree.ts";

const ISSUE: LinearIssue = {
  project: { id: "p1", name: "Checkout", url: "https://linear.app/w/project/checkout" },
  milestone: null,
};
const OTHER: LinearIssue = { project: null, milestone: null };

const ok = (keys: string[], issue = ISSUE): LinearResult => ({
  status: "ok",
  data: new Map(keys.map((k) => [k, issue])),
});

/** Each `fetch` call waits on a promise the test settles. */
function setup(key: string | null = "k1") {
  const calls: { key: string; keys: string[]; resolve: (r: LinearResult) => void; reject: () => void }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let changes = 0;
  const store = linearStore({
    fetch: (k, keys) =>
      new Promise((resolve, reject) => {
        calls.push({ key: k, keys, resolve, reject });
      }),
    onChange: () => changes++,
    later: (fn, ms) => timers.push({ fn, ms }),
    every: 600_000,
  });
  store.setKey(key ?? undefined);
  changes = 0;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { store, calls, timers, changes: () => changes, flush };
}

describe("linearStore", () => {
  test("fetches only keys it has not tried", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    expect(s.calls.map((c) => c.keys)).toEqual([["A-1"]]);
    expect(s.calls[0].key).toBe("k1");
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    s.store.sync(["A-1", "B-2"], true);
    expect(s.calls.map((c) => c.keys)).toEqual([["A-1"], ["B-2"]]);
  });

  test("makes no fetch while no page wants Linear data, and fetches when one does", () => {
    const s = setup();
    s.store.sync(["A-1"], false);
    expect(s.calls).toHaveLength(0);
    s.store.sync(["A-1"], true);
    expect(s.calls).toHaveLength(1);
  });

  test("makes no fetch with no key, and reports no-key", () => {
    const s = setup(null);
    s.store.sync(["A-1"], true);
    expect(s.calls).toHaveLength(0);
    expect(s.store.state()).toBe("no-key");
  });

  test("keeps one fetch in flight and sends keys that arrive meanwhile in the next", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.store.sync(["A-1", "B-2"], true);
    expect(s.calls).toHaveLength(1);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    expect(s.calls.map((c) => c.keys)).toEqual([["A-1"], ["B-2"]]);
  });

  test("a failed key is not sent again on the next sync, and the data stays", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    s.store.sync(["A-1", "B-2"], true);
    s.calls[1].reject();
    await s.flush();
    s.store.sync(["A-1", "B-2"], true);
    expect(s.calls).toHaveLength(2);
    expect(s.store.of("A-1")).toEqual(ISSUE);
  });

  test("a failed answer status also keeps the data and waits", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve({ status: "failed" });
    await s.flush();
    s.store.sync(["A-1"], true);
    expect(s.calls).toHaveLength(1);
    expect(s.store.state()).toBe("ok");
  });

  test("refetches every key each 10 min while a page wants data", async () => {
    const s = setup();
    s.store.sync(["A-1", "B-2"], true);
    expect(s.timers.map((t) => t.ms)).toEqual([600_000]);
    s.calls[0].resolve(ok(["A-1", "B-2"]));
    await s.flush();
    s.timers[0].fn();
    expect(s.calls[1].keys).toEqual(["A-1", "B-2"]);
    expect(s.timers).toHaveLength(2);
  });

  test("the 10 min tick does nothing once no page wants data", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    s.store.sync(["A-1"], false);
    s.timers[0].fn();
    expect(s.calls).toHaveLength(1);
    expect(s.timers).toHaveLength(1);
  });

  test("calls onChange when data changes, not when an answer repeats it", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    expect(s.changes()).toBe(1);
    expect(s.store.of("A-1")).toEqual(ISSUE);
    s.timers[0].fn();
    s.calls[1].resolve(ok(["A-1"]));
    await s.flush();
    expect(s.changes()).toBe(1);
    s.timers[1].fn();
    s.calls[2].resolve(ok(["A-1"], OTHER));
    await s.flush();
    expect(s.changes()).toBe(2);
    expect(s.store.of("A-1")).toEqual(OTHER);
  });

  test("a rejected key keeps the data, calls onChange, and stops fetching until setKey", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    s.store.sync(["A-1", "B-2"], true);
    s.calls[1].resolve({ status: "rejected" });
    await s.flush();
    expect(s.store.state()).toBe("rejected");
    expect(s.changes()).toBe(2);
    expect(s.store.of("A-1")).toEqual(ISSUE);
    s.store.sync(["A-1", "B-2", "C-3"], true);
    s.timers[0].fn();
    expect(s.calls).toHaveLength(2);
  });

  test("setKey clears rejected and refetches every key at once, also with no page on", async () => {
    const s = setup();
    s.store.sync(["A-1", "B-2"], true);
    s.calls[0].resolve({ status: "rejected" });
    await s.flush();
    const before = s.changes();
    s.store.sync(["A-1", "B-2"], false);
    s.store.setKey("k2");
    expect(s.store.state()).toBe("ok");
    expect(s.changes()).toBe(before + 1);
    expect(s.calls[1].key).toBe("k2");
    expect(s.calls[1].keys).toEqual(["A-1", "B-2"]);
  });

  test("setKey with no key reports no-key and calls onChange", () => {
    const s = setup();
    s.store.setKey(undefined);
    expect(s.store.state()).toBe("no-key");
    expect(s.changes()).toBe(1);
  });

  test("an answer to an older key is dropped", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.store.setKey("k2");
    expect(s.calls).toHaveLength(1);
    s.calls[0].resolve({ status: "rejected" });
    await s.flush();
    expect(s.store.state()).toBe("ok");
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].key).toBe("k2");
    expect(s.calls[1].keys).toEqual(["A-1"]);
  });

  test("a limited answer keeps the data and sends the keys again after Retry-After", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve({ status: "limited", ms: 7000 });
    await s.flush();
    expect(s.timers.map((t) => t.ms)).toEqual([600_000, 7000]);
    s.store.sync(["A-1", "B-2"], true);
    expect(s.calls).toHaveLength(1);
    s.timers[1].fn();
    expect(s.calls[1].keys).toEqual(["A-1", "B-2"]);
  });

  test("a limited answer after setKey with no page on still retries after Retry-After", async () => {
    const s = setup();
    s.store.sync(["A-1"], false);
    s.store.setKey("k2");
    expect(s.calls).toHaveLength(1);
    s.calls[0].resolve({ status: "limited", ms: 7000 });
    await s.flush();
    expect(s.timers.map((t) => t.ms)).toEqual([7000]);
    s.timers[0].fn();
    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].keys).toEqual(["A-1"]);
  });

  test("setKey refetches keys fetched under the old key, with no page on", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    s.store.sync(["A-1"], false);
    s.store.setKey("k2");
    expect(s.calls[1].keys).toEqual(["A-1"]);
    expect(s.calls[1].key).toBe("k2");
  });

  test("a stale ok answer from before setKey sets no data and calls no onChange", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.store.setKey("k2");
    s.calls[0].resolve(ok(["A-1"]));
    await s.flush();
    expect(s.store.of("A-1")).toBeUndefined();
    expect(s.changes()).toBe(0);
  });

  test("a limited timer that fires after setKey does nothing", async () => {
    const s = setup();
    s.store.sync(["A-1"], true);
    s.calls[0].resolve({ status: "limited", ms: 7000 });
    await s.flush();
    s.store.setKey("k2");
    s.calls[1].resolve(ok(["A-1"]));
    await s.flush();
    s.timers[1].fn();
    expect(s.calls).toHaveLength(2);
  });
});
