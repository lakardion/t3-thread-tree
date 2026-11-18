---
title: Show full thread titles in the brief
type: wayfinder:task
status: open
assignee: claude (better-brief-06)
blocked-by: [01-brief-row-look, 05-short-brief-build]
---

## Question

Build M14: show full thread titles in the brief.

## Brief

Build M14 with the look of [the brief row look](01-brief-row-look.md). Stacks on 05-short-brief-build. One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

Look from [the brief row look](01-brief-row-look.md) › Resolution.

- The thread title becomes the row heading: line 1, after the rank, bold, with its status icon, a link to the thread. It wraps; remove the 260 px cap and the truncation.
- An Action with more than one thread shows one heading line per thread. A thread that left the tree shows its saved title, muted and struck through.
- The kind chip, the verb and the Wait move to line 2, and the reason to line 3. The thread link line under the reason goes away.

## Handed over from better-brief-05

- `BriefPanel` renders `shortRows(placed, all)`: the first 3 open rows, or every row after "Show all". Full titles make rows taller, so check the short list and the "Show all N" footer under it.
- Folded, the panel shows only its head; the rows do not render.
