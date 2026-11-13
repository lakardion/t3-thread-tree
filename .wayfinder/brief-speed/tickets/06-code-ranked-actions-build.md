---
title: Rank the obvious actions in code and skip the model when it has nothing to judge
type: wayfinder:task
status: closed
assignee: claude
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

## Resolution

Code makes `answer`, `fix` and `merge`. The model gets only the other threads, and the CLI does not start when none are left. `running` and `failed` carry the code actions. `done` holds the code actions first.

Measured on the live tree, 3 runs per CLI. The time is from the click (`POST /brief/run`) to the `done` event. The input tokens include the cache.

Before (`main` at `0b4a659`, 20–21 threads to the model):

| CLI | Runs (s) | Median (s) | Input tokens |
| --- | --- | --- | --- |
| claude | 17.1, 34.1, 26.9 | 26.9 | ~7,750 |
| codex | 22.5, 25.0, 23.7 | 23.7 | ~15,400 |

After (14 threads to the model, 6–7 code actions):

| CLI | Runs (s) | Median (s) | Input tokens |
| --- | --- | --- | --- |
| claude | 23.7, 18.2, 13.2 | 18.2 | ~5,970 |
| codex | 26.7, 16.0, 30.4 | 26.7 | ~14,170 |

The claude median is lower (26.9 s to 18.2 s). The codex runs vary a lot, and most of its input is fixed CLI cost, so fewer threads change it little. The code actions are ready at once, before the model ends.
