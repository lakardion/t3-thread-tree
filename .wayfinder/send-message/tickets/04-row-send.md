---
title: Send a message from a thread row
type: wayfinder:task
status: open
assignee:
blocked-by: [03-brief-send]
---

## Question

Open the send dialog from a thread row, with a fixed target and an empty message.

## Spec

- Entry point as `SPEC.md` decides (row icon on hover, details block, or both). It must not break the row drag or the row click that opens the thread.
- Reuse the dialog from ticket 03. No picker: the target is the row's thread.
- Update `README.md` › "What you get".

## Done when

`bun run check` passes. In `bun run demo`, light and dark, on desktop and phone width: a send from a top-level thread and from a subthread.
