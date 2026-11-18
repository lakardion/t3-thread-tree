---
title: When is an Action done or changed, and what does the short brief show?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

What are the exact rules for **done** and **changed** Actions (M10), and what do the first three Actions and the fold show (M12)?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M10, M12. Charting decided the direction (see the map's Decisions so far). Decide:

- **Done, per code kind.** `answer`: no linked thread is `needs-input` or `plan-ready`? `fix`: the PR has no failing checks, conflict or requested changes? `merge`: the PR is merged? What if the thread or PR is gone?
- **Changed, for model kinds.** Which status change counts (any, or only away from the status the Action was about)? Where the status snapshot lives (with the brief state in `src/shared/brief.ts`).
- **Send and start.** Can the user send on a done or changed Action? Does the send dialog say what changed?
- **Head.** "N changed since HH:MM": does N count done and changed? "Run again" runs the same CLI?
- **Three first.** Do the 3 count only open Actions? Where do done rows go when the list is short? What does "Show all N" count?
- **Fold.** Default open or closed? Stored where (like the tree folds)? Head text when folded ("10 Actions · 3 done").
- **Terms.** Confirm **done** and **changed** for `CONTEXT.md`.

When it closes, write the `## Spec` of 05 and the rules part of 04.

## Resolution

Grilled with the user on 2026-11-18. The user accepted every recommendation.

**States of an Action.** An Action is **open**, **done** or **changed**.

**Done, code kinds**, from the live tree:

- `answer`: no linked thread is `needs-input` or `plan-ready`.
- `fix`: the PR has no failing checks, no conflict and no requested changes. A merged or closed PR also counts.
- `merge`: the PR is merged or closed.
- A `fix` or `merge` Action whose PR is no longer on the thread is done.

**Done, all kinds.** When every linked thread is settled or out of the tree, the Action is done. This covers "Clean up: Settle …". When only some linked threads are gone, apply the rule to the live threads.

**Changed.**

- Model kinds (`review`, `clean-up`, `unblock`): any status change on any linked thread, compared with the status at brief time.
- `answer`: also changed when the thread still waits but its `since` (the Wait start) moved. This means a new question.
- The snapshot is `statuses` (and `since` for answer threads) on the brief state in `src/shared/brief.ts`, next to `titles`. The server takes it at brief time.
- Done wins over changed.

**Send and Start.** A done row hides Send and Start and keeps Copy. A changed row keeps both. Its send dialog shows one line per changed thread above the message, for example "Changed since 14:02: Cart test was failed, now working". "Sent to …" and the mark show together.

**Head.** The counts are Actions, not threads. The bar shows only when N > 0. "Run again" calls the same `runBrief` as "What's next", with the CLI that the menu shows. The look of the bar is in [the brief row look](01-brief-row-look.md).

**Three first.**

- The first 3 **open** Actions show. Done and changed rows are muted, sit at the end, and always stay behind "Show all", also when fewer than 3 Actions are open.
- "Show all N" counts every Action. It shows when there are more than 3 Actions or at least one marked row.
- When no Action is open, the list shows "Nothing open · Show all N".
- "Show all" is not saved. A new run resets it.

**Fold.** The panel is open by default. A chevron in the head folds it. The state is saved in `localStorage` with the helpers that `app.tsx` uses for page settings. The folded head reads "10 Actions · 3 done · 1 changed", without zero parts. "What's next" and "Run again" unfold the panel.

**Terms.** Confirmed for `CONTEXT.md` (written by 04-action-marks-build, text in its Spec): **Open**, **Done**, **Changed**. Avoid: resolved, stale, outdated.
