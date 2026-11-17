---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: Status groups that agree

Resume the decision tickets with `/wayfinder .wayfinder/status-groups/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/status-groups/map.md`. Run `/wayfinder-implement .wayfinder/status-groups/map.md <ticket>` after a PR opens or merges.

## Destination

In the flat view with "Group by: Status", a unit goes to the section of its most urgent thread, subthreads included. A section counts the threads that match it, and its other rows show as **Context rows**. The header shows the your-turn count next to the **Needs you** count. The three items M01, M07 and M06 are merged to `main`, one PR each, in that order, as one stack 03 ← 04 ← 05. The user tests the stack and merges it, bottom PR first.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Put a unit in the section of its most urgent thread, subthreads included](tickets/03-unit-placement-build.md)
2. [Count the matching threads of a section and show its context rows](tickets/04-context-rows-build.md) — stacks on 03-unit-placement-build, and after [the context row look](tickets/01-context-row-look.md) closes
3. [Show the your-turn count next to the Needs-you count](tickets/05-needs-you-count-build.md) — stacks on 04-context-rows-build (forced), and after [the count format](tickets/02-count-format.md) closes

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- 03-unit-placement-build ← 04-context-rows-build ← 05-needs-you-count-build. The stack starts from `main`. Each key branches from the branch of the key before it.

## Notes

- Mode: autopilot
- **Stack gate.** A route key unblocks the next key in its chain when its draft PR opens. The next key stacks on its branch.
- **The stack stops for the user.** Each build session opens a draft PR and hands off to the next key. The user tests the stack with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. No feature toggles.
- **The wait-time stack also edits `sections`** (`src/page/view.ts`, its key M05). The two stacks run apart. The stack that merges second rebases and solves the conflict.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Decision tickets come first; each decision ticket writes the `## Spec` of its build ticket when it closes.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **Source:** the [improvements-program map](../improvements-program/map.md), ticket [Effort B: status groups that agree](../improvements-program/tickets/02-effort-b-status-groups.md). The item details, options and file:line references (at `5bf8567`) are in [the merged review](../improvements/research/03-merged-review.md) › M01, M07, M06. The order and the rules are in [Order the merged list and group it into efforts](../improvements/tickets/04-order-and-group.md).
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01 and 02. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md` (**Needs you**, **Context row**).
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys), because `/wayfinder-implement` reads that format. Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the three PRs are merged.
- **Mode:** autopilot. The three build keys run unattended as one stack of draft PRs from `main`, apart from the wait-time stack.
- **Looks:** two prototype tickets, one for the context rows (M07), one for the count format (M06). Opus and Sol variants; the user picks.
- **Settled threads do not pull** (M01). With "Show settled threads" on, a unit goes by its unsettled threads. A unit with only settled threads goes by all its threads.
- **Glossary:** new term **Context row** in `CONTEXT.md`. It covers the spawners that the "Needs you" filter keeps, and the rows of a status section that do not match it. One look for both places.

- [How do context rows look, and what does a section count?](tickets/01-context-row-look.md): variant B. Stack context rows fold behind "+N other threads" on the rail header; other context rows are muted. The header counts matching threads only. A settled thread is a context row.

## Not yet specified

<!-- none at charting -->

## Out of scope

- With "Show settled threads" on, the "Needs you" chip counts settled threads, but the Dock badge and the menu-bar list do not. It is a new finding, not in the merged review, so it needs a new review.
- Sort the waiting sections by **Wait** (M05). It is effort A.
- Fold the flat section headers (M09). It is effort D.
- Writes to T3 (settle, snooze, approve). Feature toggles.
