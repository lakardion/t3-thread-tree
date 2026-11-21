import { describe, expect, test } from "bun:test";

import { suggestedReplies } from "../src/server/replies.ts";
import { REPLY_POOL } from "../src/shared/replies.ts";

/** Short, anonymized cuts of real assistant messages. Each intent has a match and a miss. */
const SAMPLES: Record<string, { match: string; miss: string }> = {
  "run-app": {
    match:
      "The chip row is in `src/page/send-dialog.tsx`. Typecheck and tests pass. I did not commit it, so you can check the page first.",
    miss: "The parser change is in `src/server/replies.ts`. Tests pass. I did not commit it.",
  },
  ship: {
    match: "I updated CONTEXT.md to say that cue words pick the chip. I did not commit it.",
    miss: "The fix is not committed yet, because 2 tests still fail on main.",
  },
  push: {
    match: "This commit is on your local `main`, which now has 9 commits that are not pushed.",
    miss: "**Wiki:** I marked the issue as merged, then committed and pushed the wiki.",
  },
  handoff: {
    match: "All tickets before it are closed. The next ticket is 05, the spec section. Send `/t3-handoff` to start it.",
    miss: "Ticket 04 is closed and has its line in the map's Decisions so far.",
  },
  retry: {
    match: "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)",
    miss: "API Error: You've hit your usage limit · resets 3pm",
  },
  "agree-all": {
    match:
      "❓ **Q3** - **Do `run-app` and `ship` merge?** Both use the same cue.\n\n➡️ Keep them as 2 separate intents that show together.",
    miss: "Answers to numbered questions follow ❓ in 29 of 96 cases.",
  },
  merged: {
    match:
      "I assigned the ticket to you, and it stays open. Tell me when PR #53 is merged. Then I will close the ticket.",
    miss: "Both issue notes say merged, and the change is pushed.",
  },
  "refresh-pr": {
    match:
      'The "How" section of the PR body is now out of date. It still describes the global Draft key, which the PR no longer uses.',
    miss: "It is fetched with `cache-and-network`, and the PR body says staging sends stale data for this kind of request.",
  },
};

describe("cue samples", () => {
  test("every pool intent has samples", () => {
    expect(Object.keys(SAMPLES).toSorted()).toEqual(REPLY_POOL.map((r) => r.id).toSorted());
  });

  test.each(Object.entries(SAMPLES))("%s: the match picks it, the miss does not", (id, { match, miss }) => {
    expect(suggestedReplies(match)).toContain(id);
    /** A second known cue keeps the fallback row, which holds `ship` and `handoff`, out of the miss check. */
    const other = id === "merged" ? SAMPLES.push.match : SAMPLES.merged.match;
    expect(suggestedReplies(`${miss}\n${other}`)).not.toContain(id);
  });

  test("the match is case-insensitive", () => {
    expect(suggestedReplies("TELL ME WHEN THE PR IS MERGED.")).toEqual(["merged"]);
  });
});

describe("rules", () => {
  test("run-app needs the ship cue", () => {
    expect(suggestedReplies("I changed the page in `app.tsx` and committed it.")).not.toContain("run-app");
  });

  test("no cue gives the fallback ship + handoff", () => {
    expect(suggestedReplies("Here is the summary of the research.")).toEqual(["ship", "handoff"]);
  });

  test("not committed with a fail word and no other cue gives the fallback", () => {
    expect(suggestedReplies(SAMPLES.ship.miss)).toEqual(["ship", "handoff"]);
  });

  test("cue chips replace the fallback", () => {
    expect(suggestedReplies(SAMPLES.retry.match)).toEqual(["retry"]);
  });

  test("matched intents come in pool order", () => {
    const text = `${SAMPLES["refresh-pr"].match}\n${SAMPLES.merged.match}\n${SAMPLES.push.match}`;
    expect(suggestedReplies(text)).toEqual(["push", "merged", "refresh-pr"]);
  });

  test("the cap is 4 chips, and ship goes in whole or not at all", () => {
    /** run-app (1) + ship (2) + push (1) = 4; handoff no longer fits. */
    const text = `${SAMPLES["run-app"].match}\n${SAMPLES.push.match}\n${SAMPLES.handoff.match}`;
    expect(suggestedReplies(text)).toEqual(["run-app", "ship", "push"]);
  });

  test("five one-chip cues keep the first 4 in pool order", () => {
    const text = [SAMPLES["refresh-pr"], SAMPLES.merged, SAMPLES["agree-all"], SAMPLES.handoff, SAMPLES.push]
      .map((s) => s.match)
      .join("\n");
    expect(suggestedReplies(text)).toEqual(["push", "handoff", "agree-all", "merged"]);
  });
});
