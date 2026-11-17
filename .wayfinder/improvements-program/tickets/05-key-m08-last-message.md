---
title: Show the last message on demand, in details and the send dialog
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

Build M08 (effort F).

## Spec

See [the merged review](../../improvements/research/03-merged-review.md) › M08 for the problem, the options and the file:line references (at `5bf8567`). M08 is accepted: it reverses `DESIGN-SPEC.md:24` for the details block and the send dialog only. The row does not change. Update `DESIGN-SPEC.md:24`. Start with the last message only, with no read of `turn_items`.

- One draft PR. The user tests it with `bun run demo` and the real app, and merges it.
- `bun run check` passes. Update `README.md` for a visible change (see `CLAUDE.md`).
