---
title: Build the compact digest input
type: wayfinder:task
status: open
assignee: claude
blocked-by: []
---

## Question

Replace the JSON brief input with the compact **digest**, and remove the threads that need no action before the model runs.

## Spec

Decisions: [What does a thread digest hold, and when does it update?](02-digest-shape.md).

- In `src/server/brief.ts`, `briefInput` drops threads with status `working`, `starting`, `waiting` or `snoozed`.
- The model input is text, one block per thread: `id · status phrase · key title · PRs (#12 approved passing)`, then the last 600 characters of the last assistant message, indented. Keep the thread ids exact. Show stack position and pending request on the line when they are set.
- No cache: build it on each click, as today.
- Update `stdinFor`, the input part of `src/server/next-step-prompt.md`, and `test/brief.test.ts`.
- Update `SPEC.md` › What's next › Input. Add the term **Digest** to `CONTEXT.md`.

## Done when

`bun test` and `bun run typecheck` pass. One real run with `claude` on the live tree gives a valid brief.
