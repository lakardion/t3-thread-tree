---
title: Show the phrase and the Wait on rows that wait on the user
type: wayfinder:task
status: open
assignee:
blocked-by: [01-row-wait-look]
---

## Question

Build M04: set the `since` of `plan-ready` and `your-turn`, and show the phrase and the **Wait** on the rows that [the row look](01-row-wait-look.md) chose.

## Spec

<!-- written by 01-row-wait-look on resolution -->

Known now:

- `statusOf` (`src/server/build-tree.ts`) sets `since` from `latestRunCompletedAt` for `plan-ready` and `your-turn`. No schema change: `ThreadNode.since` exists.
- Side effects to check and test: the brief digest reads `since` (`src/server/brief.ts:44`), and the menu-bar list sorts by `since` (`src/desktop/runtime.ts:49`).
- Update `SPEC.md` and `DESIGN-SPEC.md` for the row, because this reverses `d602e6e` (#18) for these rows. Update `README.md`.
- One PR. The user tests and merges it.

## Done when

<!-- written by 01-row-wait-look on resolution -->
