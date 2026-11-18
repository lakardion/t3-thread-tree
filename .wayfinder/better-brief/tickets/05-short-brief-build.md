---
title: Show three Actions first and fold the brief
type: wayfinder:task
status: closed
assignee: claude (better-brief-05)
blocked-by: [02-done-and-short-rules, 04-action-marks-build]
---

## Question

Build M12: show three Actions first and fold the brief.

## Brief

Build M12 with the rules of [the done and short-brief rules](02-done-and-short-rules.md). Stacks on 04-action-marks-build: the head count needs **done**. One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

From [the done and short-brief rules](02-done-and-short-rules.md) › Resolution:

- **Three first.** Show the first 3 **open** Actions. Done and changed rows stay behind "Show all", also when fewer than 3 are open.
- **"Show all N"** counts every Action. It shows when there are more than 3 Actions or at least one marked row. When no Action is open, show "Nothing open · Show all N". The state is not saved; a new run resets it.
- **Fold.** Open by default. A chevron in the panel head folds the panel to its head. Save the state in `localStorage` with the helpers in `app.tsx`. The folded head reads "10 Actions · 3 done · 1 changed", without zero parts. "What's next" and "Run again" unfold it.

## Handed over from better-brief-04

- `markRows(actions, live, snap)` in `src/shared/brief.ts` gives each Action its brief place `i` and its mark, ordered open, changed, done. Use it for "first 3 open" and the folded-head counts.
- Marks exist only in the `done` brief state (`running` and `failed` rows are all open).
- Each row shows its brief rank `i + 1`, not its place after the reorder, and the React key is `i`.
