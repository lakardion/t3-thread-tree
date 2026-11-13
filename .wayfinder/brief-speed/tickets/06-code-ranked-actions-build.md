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
