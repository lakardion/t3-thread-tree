---
title: Add the attention summary and the "Needs you" filter
type: task
status: open
assignee:
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec, 07-thread-row]
---

Route key `design-overhaul-11`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

The header shows the four count chips and the "All / Needs you" filter of `DESIGN-SPEC.md` › Page.

## Scope

- Add `toggle-group` with the shadcn CLI.
- Count chips over the visible threads, nested threads included. The "need you" chip is hidden at 0.
- The filter runs on the page and is stored under `thread-tree:filter`. A spawner row that does not match stays, in muted color, when a nested thread matches.
- Put the counting and the filter in pure functions, with tests.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- The counts agree with the rows in the demo.
- With the filter on, only `needs-input`, `plan-ready` and `your-turn` threads show, with their groups and projects.

## Handed over from design-overhaul-08

- The fold is `folded(b)` and `isKeyGroup(b)` in `src/page/format.ts`. Both read `b.threads`. If the filter removes threads from a group before `GroupRow` draws it, a key group with two threads and one match folds. Decide if the filter runs before the fold, and add a test for the choice.
- Before the first push, `tree` is null and the page shows the skeleton card. Show no summary chips in that state.
- A closed project or group shows one status icon for each thread through `Icons` (`allThreads`). With the filter on, these icons must count the visible threads only.
