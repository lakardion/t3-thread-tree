---
title: Mark done and changed Actions
type: wayfinder:task
status: closed
assignee: claude (better-brief-04)
blocked-by: [01-brief-row-look, 02-done-and-short-rules, 03-answer-actions-build]
---

## Question

Build M10: mark done and changed Actions.

## Brief

Build M10 with the rules of [the done and short-brief rules](02-done-and-short-rules.md) and the mark look of [the brief row look](01-brief-row-look.md). Stacks on 03-answer-actions-build. Add **done** and **changed** to `CONTEXT.md`. One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

The rules, from [the done and short-brief rules](02-done-and-short-rules.md) › Resolution:

- **Done, code kinds**, from the live tree. `answer`: no linked thread is `needs-input` or `plan-ready`. `fix`: the PR has no failing checks, conflict or requested changes, or it is merged or closed. `merge`: the PR is merged or closed. A PR no longer on the thread makes `fix` and `merge` done.
- **Done, all kinds:** every linked thread is settled or out of the tree. With only some gone, apply the rule to the live threads.
- **Changed:** a model kind (`review`, `clean-up`, `unblock`) is changed when any linked thread's status differs from the snapshot. An `answer` Action is also changed when its thread still waits but `since` moved. Done wins over changed.
- **Snapshot:** add `statuses` (and `since` for answer threads) to the brief state in `src/shared/brief.ts`, next to `titles`. The server fills it at brief time, rules-only runs too.
- **Send and Start:** a done row hides both and keeps Copy. A changed row keeps both. The send dialog shows one line per changed thread above the message: "Changed since HH:MM: <title> was <old>, now <new>". "Sent to …" and the mark show together.
- **Bar counts** are Actions, not threads. "Run again" calls the same `runBrief` as "What's next".
- **`CONTEXT.md`:** add after **Action**:
  - **Open**: an **Action** whose facts still hold. _Avoid_: active, pending.
  - **Done**: an **Action** whose rule no longer holds in the live tree, or whose linked threads all left the tree or settled. _Avoid_: resolved, closed.
  - **Changed**: an **Action** with a linked thread whose status or **Wait** differs from the brief time. The Action may be out of date. _Avoid_: stale, outdated.

The rules are in [the done and short-brief rules](02-done-and-short-rules.md). The look, from [the brief row look](01-brief-row-look.md) › Resolution:

- Marked rows move to the end of the list, at 55 % opacity, 100 % on hover.
- **Done:** a check (`text-status-done-fg`) in place of the rank, the thread title struck through, and a "Done" badge (Check icon) after the Wait.
- **Changed:** the rank stays, and a "Changed" badge (RefreshCw icon) shows after the Wait.
- A bar under the panel head: "1 done · 1 changed since HH:MM" on the left, "Run again" (RotateCw, link button) on the right. `text-xs`, muted, `bg-muted/50`, bottom border. It shows only when a row has a mark. Leave out a zero count.
