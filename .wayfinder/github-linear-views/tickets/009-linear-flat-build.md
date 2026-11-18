---
id: "009"
title: Build Group by Linear project in Flat
type: wayfinder:task
status: in-review
assignee: claude (github-linear-views-009)
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

## Handed over from github-linear-views-008

008 shipped as two chained PRs: #114 (server tree) and #115 (page). Stack this key on `github-linear-views-008-build-linear-tree-page`.

- With `linear=1`, the server sends the Linear tree in `projects`, not the T3 tree. Top level: Linear projects (`lp:<id>`, `linear.url`), then the fallbacks `lf:reviews`, `lf:none` ("No project"), `lf:nokey` ("No issue key"), each with `linear: {}`. Under a project: milestones (`lm:<id>`, or `lm:<projectId>:none` for "No milestone", `linear.date`). Each thread has `t3Project`. `isLinear`, `isFallback`, `isLinearReviews` are in `src/page/order.ts` and `src/shared/tree.ts`.
- The page sends `linear=1` only while the Tree is on "Linear project" (`linearOn` in `src/page/app.tsx`, key `thread-tree:tree-group`). Flat "Group by Linear project" must also turn it on.
- `GroupMenu` in `src/page/app.tsx` already holds the Flat choices ("None", "Status"). Add "Linear project" there, disabled unless `linearKey === "ok"`, the same rule as the Tree.
- The order store follows the payload shape: `isLinear(tree.projects)` picks `thread-tree:order-linear`, also for the `flat` list. `flatten` on the Linear tree gives plain thread units (milestones have no `stack`), so no stack block shows yet.
- Find, Up next and the Start dialog read `t3Project`, so they keep working on the Linear tree.
