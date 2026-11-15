---
title: Start a thread from a brief step
type: wayfinder:task
status: open
assignee:
blocked-by: [04-row-send]
---

## Question

Let a "What's next" step start a new thread in a project, with the step prompt as its first message.

## Spec

- A "Start thread" control on a step with a prompt, as `SPEC.md` decides.
- The dialog shows the start fields from the spec (project, title, and any worktree or model field), with the prompt editable. Confirm calls the start endpoint.
- After a start, the new thread shows in the tree through the stream; the dialog does not add it by hand.
- Update `README.md` › "What's next".

## Done when

`bun run check` passes. In `bun run demo`, light and dark: a start, a failure. One smoke start against the real T3.
