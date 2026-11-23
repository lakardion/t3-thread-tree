import { describe, expect, test } from "bun:test";

import { cardOf, chips, finish, isApproval, newRound, pin, restart, skip, snoozeTimes } from "../src/page/triage.ts";
import type { ThreadNode } from "../src/shared/tree.ts";

const q = (...ids: string[]) => ids.map((id) => ({ id }));
const node = (over: Partial<ThreadNode>) =>
  ({ status: "needs-input", phrase: "Question", prs: [], ...over }) as ThreadNode;

describe("cardOf", () => {
  test("starts at the head with the next three upcoming", () => {
    const c = cardOf(q("a", "b", "c", "d", "e"), newRound(q("a", "b", "c", "d", "e")));
    expect(c).toMatchObject({ id: "a", gone: false, pos: 1, total: 5, upcoming: ["b", "c", "d"] });
  });

  test("a skipped thread leaves the walk and still counts", () => {
    const queue = q("a", "b", "c");
    const r = skip(newRound(queue), "a");
    expect(cardOf(queue, r)).toMatchObject({ id: "b", total: 3, skippedLeft: 1, upcoming: ["c"] });
  });

  test("with only skipped threads left, the walk ends", () => {
    const queue = q("a");
    const c = cardOf(queue, skip(newRound(queue), "a"));
    expect(c).toMatchObject({ id: null, skippedLeft: 1 });
    expect(cardOf(queue, restart(skip(newRound(queue), "a"))).id).toBe("a");
  });

  test("a done thread leaves the walk and counts in pos", () => {
    const queue = q("a", "b", "c");
    const r = finish(newRound(queue), "a", "sent");
    expect(cardOf(q("b", "c"), r)).toMatchObject({ id: "b", pos: 2, total: 3 });
    expect(r.done.get("a")).toBe("sent");
  });

  test("a round over mixed ids keeps the run outcomes", () => {
    const queue = q("t", "q:r:n", "p:r");
    let r = finish(newRound(queue), "q:r:n", "answered");
    r = finish(r, "p:r", "cancelled");
    expect(cardOf(q("t"), r)).toMatchObject({ id: "t", pos: 3, total: 3 });
    expect([...r.done.values()]).toEqual(["answered", "cancelled"]);
  });

  test("an empty queue is the end", () => {
    expect(cardOf([], newRound([])).id).toBeNull();
  });

  test("counts the threads that joined since the start", () => {
    const r = newRound(q("a"));
    expect(cardOf(q("a", "b", "c"), r).fresh).toBe(2);
  });
});

describe("pin", () => {
  test("pins the head once, then keeps it when the queue reorders", () => {
    const r = pin(newRound(q("a", "b")), q("a", "b"));
    expect(r.pinned).toBe("a");
    expect(pin(r, q("b", "a"))).toBe(r);
    expect(cardOf(q("b", "a"), r).id).toBe("a");
  });

  test("does nothing with an empty queue", () => {
    const r = newRound([]);
    expect(pin(r, [])).toBe(r);
  });

  test("the pinned thread leaves the queue: gone, and skip clears the pin", () => {
    const r = pin(newRound(q("a", "b")), q("a", "b"));
    expect(cardOf(q("b"), r)).toMatchObject({ id: "a", gone: true, total: 2 });
    const next = skip(r, "a");
    expect(next.pinned).toBeNull();
    expect(cardOf(q("b"), next)).toMatchObject({ id: "b", gone: false });
  });

  test("finish and skip clear the pin so the next head is pinned", () => {
    const r = pin(newRound(q("a", "b")), q("a", "b"));
    expect(finish(r, "a", "settled").pinned).toBeNull();
    expect(skip(r, "a").pinned).toBeNull();
  });
});

describe("snoozeTimes", () => {
  const at = (h: number) => new Date(2030, 0, 15, h, 30);
  test("at 10:00 offers 1 hour, tonight and tomorrow", () => {
    const t = snoozeTimes(at(10));
    expect(t.map((x) => x.label)).toEqual(["1 hour", "Tonight 18:00", "Tomorrow 09:00"]);
    expect(t[0].at.getTime()).toBe(at(10).getTime() + 3_600_000);
    expect(t[1].at).toEqual(new Date(2030, 0, 15, 18));
    expect(t[2].at).toEqual(new Date(2030, 0, 16, 9));
  });

  test("after 18:00 there is no tonight", () => {
    expect(snoozeTimes(at(19)).map((x) => x.label)).toEqual(["1 hour", "Tomorrow 09:00"]);
  });

  test("at 01:00 tomorrow is the next calendar day", () => {
    expect(snoozeTimes(at(1))[2].at).toEqual(new Date(2030, 0, 16, 9));
  });
});

describe("chips", () => {
  const broken = { n: 7, state: "open", checks: "failing", conflicting: false, review: null };
  const done = { state: "done", options: ["Yes", "No"], pick: "claude" } as ThreadNode["catchUp"];

  test("options come first, then the rule chip on a your-turn thread", () => {
    const t = node({ status: "your-turn", phrase: "Your turn", catchUp: done, prs: [broken] as never });
    expect(chips(t).map((c) => c.label)).toEqual(["Yes", "No", "Fix PR #7"]);
    expect(chips(t)[2].text).toContain("fix the failing checks");
  });

  test("no rule chip off your-turn", () => {
    expect(chips(node({ prs: [broken] as never })).map((c) => c.label)).toEqual([]);
  });

  test("options show only when the Catch-up is done", () => {
    expect(chips(node({ catchUp: { ...done, state: "running" } as never }))).toEqual([]);
  });

  test("an approval has no chips", () => {
    expect(chips(node({ phrase: "Approval", catchUp: done }))).toEqual([]);
  });
});

test("isApproval needs the status and the phrase", () => {
  expect(isApproval(node({ phrase: "Approval" }))).toBe(true);
  expect(isApproval(node({ phrase: "Question" }))).toBe(false);
  expect(isApproval(node({ status: "your-turn", phrase: "Approval" }))).toBe(false);
});
