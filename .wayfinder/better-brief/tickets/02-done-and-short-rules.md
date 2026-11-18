---
title: When is an Action done or changed, and what does the short brief show?
type: grilling
status: open
assignee: 
blocked-by: []
---

## Question

What are the exact rules for **done** and **changed** Actions (M10), and what do the first three Actions and the fold show (M12)?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M10, M12. Charting decided the direction (see the map's Decisions so far). Decide:

- **Done, per code kind.** `answer`: no linked thread is `needs-input` or `plan-ready`? `fix`: the PR has no failing checks, conflict or requested changes? `merge`: the PR is merged? What if the thread or PR is gone?
- **Changed, for model kinds.** Which status change counts (any, or only away from the status the Action was about)? Where the status snapshot lives (with the brief state in `src/shared/brief.ts`).
- **Send and start.** Can the user send on a done or changed Action? Does the send dialog say what changed?
- **Head.** "N changed since HH:MM": does N count done and changed? "Run again" runs the same CLI?
- **Three first.** Do the 3 count only open Actions? Where do done rows go when the list is short? What does "Show all N" count?
- **Fold.** Default open or closed? Stored where (like the tree folds)? Head text when folded ("10 Actions · 3 done").
- **Terms.** Confirm **done** and **changed** for `CONTEXT.md`.

When it closes, write the `## Spec` of 05 and the rules part of 04.
