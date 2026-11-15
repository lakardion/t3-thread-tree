---
title: Build the send dialog and the send button on a brief step
type: wayfinder:task
status: open
assignee:
blocked-by: [02-send-endpoints]
---

## Question

Add a send button next to the copy icon of a "What's next" step. It opens the send dialog with the step prompt.

## Spec

- One reusable send dialog component (tickets 04 and 05 use it), as `SPEC.md` describes.
- Target: a picker with the step's threads (title and status icon), first preselected. A thread that is not active anymore is disabled.
- Message: the step prompt, editable. Confirm send calls the send endpoint. A busy target shows that the message waits for the next turn.
- Keep the copy icon.
- Update `README.md` › "What's next".

## Done when

`bun run check` passes. In `bun run demo`, light and dark: a send from a step with one and with several threads, an edited message, a failure.
