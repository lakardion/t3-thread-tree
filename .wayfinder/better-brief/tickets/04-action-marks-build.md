---
title: Mark done and changed Actions
type: wayfinder:task
status: open
assignee: 
blocked-by: [01-brief-row-look, 02-done-and-short-rules, 03-answer-actions-build]
---

## Question

Build M10: mark done and changed Actions.

## Brief

Build M10 with the rules of [the done and short-brief rules](02-done-and-short-rules.md) and the mark look of [the brief row look](01-brief-row-look.md). Stacks on 03-answer-actions-build. Add **done** and **changed** to `CONTEXT.md`. One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

The rules are in [the done and short-brief rules](02-done-and-short-rules.md). The look, from [the brief row look](01-brief-row-look.md) › Resolution:

- Marked rows move to the end of the list, at 55 % opacity, 100 % on hover.
- **Done:** a check (`text-status-done-fg`) in place of the rank, the thread title struck through, and a "Done" badge (Check icon) after the Wait.
- **Changed:** the rank stays, and a "Changed" badge (RefreshCw icon) shows after the Wait.
- A bar under the panel head: "1 done · 1 changed since HH:MM" on the left, "Run again" (RotateCw, link button) on the right. `text-xs`, muted, `bg-muted/50`, bottom border. It shows only when a row has a mark. Leave out a zero count.
