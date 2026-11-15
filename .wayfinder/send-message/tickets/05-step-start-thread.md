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

## Handed over from send-message-03

`SendDialog` (`src/page/send-dialog.tsx`, PR #26) has no shared frame. The in-flight guard (Escape, outside click, close X and Cancel blocked), the failure alert and the Cmd/Ctrl+Enter key live inside it. Extract them for the start dialog here instead of a copy.

## Handed over from send-message-04

`CliGate` (`src/page/send-dialog.tsx`, PR #28) wraps a control that is disabled when no `t3` CLI is found and shows the tooltip. Use it for the "Start thread" icon. `SendDialog` has a `fixed` mode now; the extracted frame must keep it.
