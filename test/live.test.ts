import { describe, expect, test } from "bun:test";

import { liveStream } from "../src/page/live.ts";

type Fake = {
  onmessage: ((e: { data: string }) => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  closed: boolean;
  close: () => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Opens fake sources and records them. */
function harness(staleMs = 40) {
  const sources: Fake[] = [];
  const trees: string[] = [];
  const states: string[] = [];
  const live = liveStream({
    open: () => {
      const s = {
        onmessage: null,
        onerror: null,
        readyState: 0,
        closed: false,
        close: () => (s.closed = true),
      } as Fake;
      sources.push(s);
      return s as unknown as EventSource;
    },
    onTree: (d) => trees.push(d),
    onState: (s) => states.push(s),
    staleMs,
    retryMs: 5,
  });
  const push = (d: string) => sources.at(-1)!.onmessage!({ data: d });
  return { sources, trees, states, live, push };
}

describe("liveStream", () => {
  test("a push reaches onTree, and the first push says live", () => {
    const h = harness();
    h.push("a");
    expect(h.trees).toEqual(["a"]);
    expect(h.states).toEqual(["live"]);
    h.live.close();
  });

  test("no push for staleMs opens a new source and says reconnecting", async () => {
    const h = harness(50);
    await wait(70);
    expect(h.states).toEqual(["reconnecting"]);
    expect(h.sources.length).toBe(2);
    expect(h.sources[0].closed).toBe(true);
    h.push("b");
    expect(h.states).toEqual(["reconnecting", "live"]);
    h.live.close();
  });

  test("a closed source opens again after a delay", async () => {
    const h = harness(1000);
    h.sources[0].readyState = 2;
    h.sources[0].onerror!();
    expect(h.states).toEqual(["reconnecting"]);
    expect(h.sources.length).toBe(1);
    await wait(15);
    expect(h.sources.length).toBe(2);
    h.live.close();
  });

  test("an error while the browser retries only says reconnecting", async () => {
    const h = harness(1000);
    h.sources[0].onerror!();
    await wait(15);
    expect(h.states).toEqual(["reconnecting"]);
    expect(h.sources.length).toBe(1);
    h.live.close();
  });

  test("reconnect opens a new source at once", () => {
    const h = harness(1000);
    h.live.reconnect();
    expect(h.sources.length).toBe(2);
    expect(h.sources[0].closed).toBe(true);
    h.live.close();
  });

  test("close stops the watchdog", async () => {
    const h = harness(10);
    h.live.close();
    await wait(25);
    expect(h.sources.length).toBe(1);
    expect(h.sources[0].closed).toBe(true);
  });
});
