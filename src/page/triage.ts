import { prRule } from "../shared/pr-rule.ts";
import type { ThreadNode } from "../shared/tree.ts";

export type Outcome = "sent" | "settled" | "snoozed";

/** One walk through the queue. `pinned` is the card in hand. `seen` holds the queue ids at the start. */
export type Round = { pinned: string | null; skipped: string[]; done: Map<string, Outcome>; seen: Set<string> };

export const newRound = (queue: { id: string }[]): Round => ({
  pinned: null,
  skipped: [],
  done: new Map(),
  seen: new Set(queue.map((t) => t.id)),
});

/** The card to show: the pinned thread, else the first of the queue that is not done or skipped. A null `id` is the end. */
export function cardOf(queue: { id: string }[], r: Round) {
  const ids = queue.map((t) => t.id);
  const open = ids.filter((id) => !r.done.has(id) && !r.skipped.includes(id));
  const skippedLeft = r.skipped.filter((id) => ids.includes(id)).length;
  const pinned = r.pinned && !r.done.has(r.pinned) ? r.pinned : null;
  const id = pinned ?? open[0] ?? null;
  const gone = id !== null && !ids.includes(id);
  return {
    id,
    gone,
    pos: r.done.size + 1,
    total: r.done.size + open.length + skippedLeft + (gone ? 1 : 0),
    fresh: ids.filter((x) => !r.seen.has(x)).length,
    skippedLeft,
    upcoming: open.filter((x) => x !== id).slice(0, 3),
  };
}

/** Pins the head of the queue when no card is pinned, so the card in hand stays while the queue changes. */
export function pin(r: Round, queue: { id: string }[]): Round {
  const id = r.pinned === null ? cardOf(queue, r).id : null;
  return id === null ? r : { ...r, pinned: id };
}

/** Sends the thread to the end of the round. */
export const skip = (r: Round, id: string): Round => ({
  ...r,
  pinned: null,
  skipped: [...r.skipped.filter((x) => x !== id), id],
});

export const finish = (r: Round, id: string, outcome: Outcome): Round => ({
  ...r,
  pinned: null,
  skipped: r.skipped.filter((x) => x !== id),
  done: new Map(r.done).set(id, outcome),
});

/** Brings the skipped threads back. Done threads stay done. */
export const restart = (r: Round): Round => ({ ...r, pinned: null, skipped: [] });

/** The snooze choices in local time. "Tonight" shows only before 18:00. "Tomorrow" is the next calendar day. */
export function snoozeTimes(now: Date): { label: string; at: Date }[] {
  const at = (days: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour);
  return [
    { label: "1 hour", at: new Date(now.getTime() + 3_600_000) },
    ...(now.getHours() < 18 ? [{ label: "Tonight 18:00", at: at(0, 18) }] : []),
    { label: "Tomorrow 09:00", at: at(1, 9) },
  ];
}

/** A request that only T3 can answer: a message does not approve it. */
export const isApproval = (t: Pick<ThreadNode, "status" | "phrase">) =>
  t.status === "needs-input" && t.phrase === "Approval";

/** The quick replies of a card: the Catch-up options, then the PR rule on a your-turn thread. None for an approval. */
export function chips(t: ThreadNode): { label: string; text: string }[] {
  if (isApproval(t)) return [];
  const options = t.catchUp?.state === "done" ? (t.catchUp.options ?? []) : [];
  const rule = t.status === "your-turn" ? prRule(t) : null;
  return [
    ...options.map((o) => ({ label: o, text: o })),
    ...(rule ? [{ label: `${rule.kind === "fix" ? "Fix" : "Merge"} PR #${rule.pr}`, text: rule.prompt }] : []),
  ];
}
