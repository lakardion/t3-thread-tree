/** Cue rules: the Suggested replies of a thread from its newest complete assistant message. Pure, so `bun test` covers it. */
import { REPLY_POOL } from "../shared/replies.ts";

const MAX_CHIPS = 4;
const FALLBACK = ["ship", "handoff"];

const NOT_COMMITTED = /\buncommitted\b|\bnot (?:yet )?committed\b|\b(?:did not|didn't|do not|don't) commit\b/i;
const SHIP_BLOCK = /fail|error|not tested/i;
const UI_SIGN = /\.(?:tsx|css|html)\b|\bui\b|\bpage\b|\bbrowser\b/i;

const ship = (t: string) => NOT_COMMITTED.test(t) && !SHIP_BLOCK.test(t);

const CUES: Record<(typeof REPLY_POOL)[number]["id"], (t: string) => boolean> = {
  "run-app": (t) => ship(t) && UI_SIGN.test(t),
  ship,
  push: (t) =>
    /\bnot (?:yet )?pushed\b|\bunpushed\b|\b(?:did not|didn't) push\b|\blocal commits?\b|\bcommits? (?:is|are) local\b|\bahead of `?origin\//i.test(
      t,
    ),
  handoff: (t) => /\/t3-handoff\b|\bnext ticket\b/i.test(t),
  /** T3 writes an API error as the whole message, so the cue is anchored at the start. */
  retry: (t) => /^\s*(?:API|network|connection) error\b/i.test(t) && !/\b(?:usage|rate) limit/i.test(t),
  "agree-all": (t) => /❓\s*\**\s*Q\d+/iu.test(t) && /➡️?/u.test(t),
  merged: (t) =>
    /\b(?:tell|let) me (?:know )?(?:when|once|after)\b[^.?!\n]*\bmerged\b|\bafter you merge\b[^.?!\n]*\b(?:tell|let) me\b/i.test(
      t,
    ),
  "refresh-pr": (t) =>
    /\bPR (?:body|description)(?: (?:is|looks|seems|may be|now|still))* (?:stale|out of date|outdated)\b/i.test(t),
};

/** The intent ids for a message: matched cues in pool order, or the fallback when none match. An intent goes in only when all its chips fit in the cap. */
export function suggestedReplies(text: string): string[] {
  const matched = REPLY_POOL.filter((r) => CUES[r.id](text)).map((r) => r.id);
  const ids = matched.length ? matched : FALLBACK;
  const out: string[] = [];
  let chips = 0;
  for (const id of ids) {
    const n = REPLY_POOL.find((r) => r.id === id)!.chips.length;
    if (chips + n > MAX_CHIPS) continue;
    out.push(id);
    chips += n;
  }
  return out;
}
