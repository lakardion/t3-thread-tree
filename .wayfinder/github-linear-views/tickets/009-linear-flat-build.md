---
id: "009"
title: Build Group by Linear project in Flat
type: wayfinder:task
status: open
assignee:
blocked-by: [008-linear-tree-build]
---

## Question

Let the Flat view group threads in one section per Linear project and milestone.

## Brief

Stack on the branch of [Build Group by Linear project in Tree](008-linear-tree-build.md). One draft PR. `bun run check` passes. Write the section and order rules test-first with `tdd` (`src/page/view.ts` has the "Group by Status" rules to extend). Look at it with `bun run demo`, light and dark, desktop and phone width.

- Add a "Flat" part to `SPEC.md` › Linear grouping, and update the flat view paragraph in `SPEC.md` › UI.
- Update `README.md` ("What you get": the third Flat "Group by" choice).

## Spec

Decision: [How does the main view group by Linear project and milestone?](006-group-by-linear-project.md), Resolution and the Flat example.

- **Control.** Flat "Group by" (`thread-tree:group`) gets a third choice, "Linear project". It is disabled when the server reports `"no-key"`. The page sends `linear=1` on `/events` while this choice is on, as the Tree mode does.
- **Sections.** One fold section per milestone, headed "Project · Milestone" (with the muted target date) or "Project · No milestone", then "Reviews", "No project" and "No issue key". Section order follows the Tree order of ticket 008: projects in their stored Linear order, milestones by target date.
- **Folds and drag** follow the "Group by Status" rules: section header is a fold button, closed sections save in `thread-tree:sections`, a row drags only inside its section, all sections share the one flat order. Placement, stacks, filters and the "Key rejected" banner match the Tree mode.
- **Show in tree** opens the shut section that holds the thread.
