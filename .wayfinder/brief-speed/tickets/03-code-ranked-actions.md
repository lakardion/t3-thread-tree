---
title: Which actions does code make, and how do they join the model's actions?
type: grilling
status: closed
assignee: claude
blocked-by: []
---

## Question

Which actions can code make from the tree data alone, with no model? How do they join the model's actions into one Next-step brief?

## Brief

The guide in `src/server/next-step-prompt.md` ranks `answer`, `merge`, `fix`, `review` and `clean-up`. Decide:

- The rules that code applies, per kind. For example, `answer` for needs input or plan ready, `merge` for an approved PR with passing checks and no conflicts, `fix` for failing checks or conflicts.
- The `title`, `reason` and `prompt` text that code writes for each rule.
- Which threads the model still gets: only the threads that code did not cover, or also the covered ones, to add a reason or a `prompt`.
- How the page shows the brief: code actions at once, and the model actions when the run ends. The rank order between the two parts.
- When code covers every thread that needs the user: does the model run at all?

## Resolution

Decided with the user at the start of autopilot. Built in [Rank the obvious actions in code and skip the model when it has nothing to judge](06-code-ranked-actions-build.md) and [Show the code actions while the model runs](07-code-actions-on-page.md).

- **Code makes:** `answer` (needs input, plan ready), `merge` (open PR approved, checks pass, no conflicts), `fix` (failing checks, conflicts, changes requested). Each has fixed text.
- **The model gets** only the other threads that need the user (your turn, done, failed, interrupted, idle), for `review`, `clean-up` and `unblock`. With no such threads, the model does not run.
- **Page:** the code actions show at once, at the top, while the model runs. The model actions show below them when the run ends.
