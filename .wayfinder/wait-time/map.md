---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: Wait time on the row

Resume the decision tickets with `/wayfinder .wayfinder/wait-time/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/wait-time/map.md`. Run `/wayfinder-implement .wayfinder/wait-time/map.md <ticket>` after a PR opens or merges.

## Destination

A row that waits on the user shows what it wants and for how long. The flat view's waiting sections sort by **Wait**. One "Open next" control opens the thread that waited longest. The three items M04, M05 and M19 are merged to `main`, one PR each, in that order. The user tests each PR and merges it.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Show the phrase and the Wait on rows that wait on the user](tickets/04-row-wait-build.md) — after [the row look](tickets/01-row-wait-look.md) closes
2. [Sort the waiting sections of the flat view by Wait](tickets/05-sort-by-wait-build.md) — after 04-row-wait-build is merged, and after [the sort rules](tickets/02-sort-by-wait-rules.md) close
3. [Add "Open next"](tickets/06-open-next-build.md) — after 05-sort-by-wait-build is merged (forced), and after [the Open next rules](tickets/03-open-next-rules.md) close

The destination is reached when every route key is done and no map ticket is open.

## Stacks

<!-- none: no key stacks on an open PR -->

## Notes

- Mode: manual
- **Merge gate (map rule, wins over the skill).** A route key unblocks its dependents only when its PR is merged to `main` and its ticket is `closed`. A key in review unblocks nothing. No stacked PRs.
- **The PR stops for the user.** The build session opens the PR and stops. The user tests it with `bun run demo` and the real app, then merges it. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. The user tests each item before the next release tag. No feature toggles.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Decision tickets come first; each decision ticket writes the `## Spec` of its build ticket when it closes.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **Source:** the closed map [improvements](../improvements/map.md). The item details, options and file:line references (at `5bf8567`) are in [the merged review](../improvements/research/03-merged-review.md) › M04, M05, M19. The order and the rules are in [Order the merged list and group it into efforts](../improvements/tickets/04-order-and-group.md).
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01. `grilling` and `domain-modeling` for 02 and 03. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md` (**Wait**, **Needs you**).
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys), because `/wayfinder-implement` reads that format. Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the three PRs are merged.
- **Merge:** manual. The user tests and merges each PR. The next key starts after the merge.
- **M04 look:** decided with a prototype ticket that shows the Opus and Sol variants.
- **Reversals:** each is confirmed in the ticket where it applies. The row look ticket confirms the reversal of `d602e6e` (#18). The sort rules ticket confirms the override of `SPEC.md:103`.
- **Glossary:** new term **Wait** in `CONTEXT.md`.
- **Builders:** `/wayfinder-implement` dispatches each key to its own session.

## Not yet specified

<!-- none at charting -->

## Out of scope

- A small Needs-you window (M23). It needs this map, but it is effort I.
- Sort the Next-step brief by Wait (M11, Sol UX2). It is effort E.
- The "Needs you" count and the filter (M06). It is effort B.
- Writes to T3 (settle, snooze, approve). "Open next" only opens a thread.
- Feature toggles.
