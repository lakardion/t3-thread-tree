---
title: Fold the flat sections and add "Show snoozed threads"
type: wayfinder:task
status: open
assignee:
blocked-by: [01-section-fold-rules]
---

## Question

Build M09: the flat sections fold, and a "Show snoozed threads" switch hides snoozed threads.

## Gate

Start only after the wait-time stack and the status-groups stack are merged to `main`. Branch from `main`. This key is the bottom of the stack 03 ← 04 ← 05.

## Spec

Written by [the fold rules](01-section-fold-rules.md) when it closes.

## Done when

Written by [the fold rules](01-section-fold-rules.md) when it closes. It always includes: `bun run check` passes; `bun run demo` checked in light and dark, desktop and phone width; `SPEC.md:103`, `SPEC.md:72` (tree rule 3) and `DESIGN-SPEC.md` › Flat view updated; `README.md` updated; one draft PR.
