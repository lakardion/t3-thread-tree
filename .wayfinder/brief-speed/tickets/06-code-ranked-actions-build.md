---
title: Rank the obvious actions in code and skip the model when it has nothing to judge
type: wayfinder:task
status: open
assignee:
blocked-by: [05-compact-digest]
---

## Question

Make the rule-based actions in code, give the model only the threads that need judgment, and skip the model when no such thread is left.

## Spec

Decisions: [Which actions does code make, and how do they join the model's actions?](03-code-ranked-actions.md).

- **Measure first.** On `main` before the change, time 3 runs per CLI on the live tree (median, seconds, input tokens from the CLI `usage`). Do the same after the change. Put both tables in the PR body and in this ticket's resolution.
- **Code actions** (no model), in this rank order: `answer` (needs input, plan ready), `fix` (failing checks, conflicts, changes requested; `prompt` is a fixed text), `merge` (open PR approved, checks pass, no conflicts; `prompt` is `null`). Fixed `title` and `reason` text.
- **Model input:** only the threads with no code action that need the user (your turn, done, failed, interrupted, idle). The model makes `review`, `clean-up` and `unblock`. With no such thread, do not start the CLI.
- **State:** `running` carries the code actions, so the page can show them at once. `done` holds the code actions first, then the model actions. A model failure keeps the code actions in the state.
- Rewrite `src/server/next-step-prompt.md` for the smaller job. Keep the 7-action limit for the model part only.
- Update `test/brief.test.ts`, the demo stub runner, and `SPEC.md` › What's next.

## Done when

`bun test` and `bun run typecheck` pass. The after-median is lower than the before-median for `claude`.

## Handed over from brief-speed-05

- **Short refs, not ids.** The digest line starts with a short ref (`t1`, `t2`, …) in place of the thread id. `InputThread` is `{ id, ref, title, digest }`, and `filterAnswer` maps each ref back to the id and drops unknown refs. Haiku changed the long `mcp:launch:<64 hex>` ids in 2 of 3 runs, so do not give the model raw ids again. Code actions use the real ids directly.
- **Refs follow input order.** `briefInput` numbers the threads after its status filter. When this key removes the threads that get code actions, number the refs over the model's threads only.
- **Empty input.** `stdinFor` sends `No threads.` for an empty list, because `claude -p` rejects empty stdin. This key skips the CLI in that case, so the guard can stay or go.
- **Baseline.** `main` already has the digest (PR #5). One live `claude` run over 23 threads took 27 s. Take the 3-run baseline on the current `main`.
- **Checks.** `main` now has `bun run check` (oxfmt, oxlint, typecheck, tests). The CI check runs it on each PR.
