---
id: "008"
title: Build Group by Linear project in Tree
type: wayfinder:task
status: open
assignee: claude (github-linear-views-008)
blocked-by: [007-linear-source-build]
---

## Question

Let the Tree group threads by Linear project, then milestone.

## Brief

Stack on the branch of [Build the Linear project and milestone source on the server](007-linear-source-build.md). One draft PR. `bun run check` passes. Write the placement and order rules test-first with `tdd`. Use `vercel:shadcn` for the UI. Look at it with `bun run demo`, light and dark, desktop and phone width.

- Add a "Tree" part to `SPEC.md` › Linear grouping, and update `SPEC.md` › UI (the header menu, folds, "Reset order").
- Update `README.md` ("What you get": Group by Linear project in the Tree).

## Spec

Decision: [How does the main view group by Linear project and milestone?](006-group-by-linear-project.md), Resolution and the Tree example. Thread links: [ticket 002](002-item-associations.md).

- **Control.** The Tree gets a "Group by" menu, in the place of the flat "Group by" menu: "T3 project" (default) and "Linear project". Save it under its own `localStorage` key, not `thread-tree:group`. "Linear project" is disabled when the server reports `"no-key"`. The page sends `linear=1` on `/events` while this mode is on.
- **Levels.** Linear project › milestone › thread. No T3 project level and no issue-key level. Each row shows its T3 project as a muted chip.
- **Placement.** The first title key places the thread (tree rule 4). A PR stack adds no level: stack threads keep their ⧉ badge and sit next to each other in stack order inside a group. Stack mates in different projects or milestones split. A keyless thread nests under its visible spawner only when the spawner sits in the same group.
- **Fallback groups,** after the Linear projects, in this order: "Reviews" (all `Review #` threads, key subgroups as today), "No project" (a keyed thread whose issue has no project or that Linear does not know), "No issue key" (keyless threads; keyless stack threads sit together in stack order). "No milestone" is the last group inside a project.
- **Order.** Projects sort by their oldest thread and drag; their order is its own stored list. Milestones sort by target date, soonest first, then milestones with no date, then "No milestone"; they do not drag. Threads in a milestone sort by `createdAt` and drag inside it. Linear-mode order lists are separate from T3-mode lists. "Reset order" clears both. "Last updated" sorts as today.
- **Headers.** Project: name, an external-link icon to the project URL, thread count. Milestone: name, target date in muted text ("Dec 4"), count. No overdue color. Fallback groups: name and count.
- **Filters and folds.** "Needs you", "Show snoozed" and "Show settled" hide threads and never change placement. An empty group hides. The Settled list stays ungrouped below. Folds save in the closed-rows store with ids per Linear project and milestone. "Fold all" and "Show in tree" work on the new groups.
- **Key rejected.** While Linear grouping is on and the server reports `"rejected"`, a banner shows. It opens Settings with the "Linear links" fold open, like the token banners. The tree keeps the last good data.
- **Where to build it.** The T3-project tree is built on the server (`buildTree`, `src/server/build-tree.ts`). Choose server or page for the Linear tree from the code. The Flat view (ticket 009) flattens this tree into "Project · Milestone" sections, so keep the project and milestone ids on the branches.

## Handed over from github-linear-views-007

007 shipped as two chained PRs: #111 (source library) and #112 (wiring). Stack this key on `github-linear-views-007-build-linear-source-wiring`.

- The page does not send `linear=1` yet. Add it to the `/events` URL in `src/page/app.tsx` while "Group by Linear project" is on. Only then does the server fetch, and only then do threads carry `linear`.
- `ThreadNode.linear` is `{ project, milestone } | null`. `null`: no key, no answer yet, or no `linear=1`. `{ project: null }`: Linear does not know the key, or the issue has no project. Both go to "No project".
- The key state is `tree.linearKey` (`"ok" | "no-key" | "rejected"`), on every payload. Use it to disable the "Linear project" choice when it is not `"ok"`.
- `bun run demo` has fixed Linear data for the ticket 006 cases: two projects, the "Beta" milestone with two issues, a milestone with no date, an issue with no milestone, an issue with no project.
