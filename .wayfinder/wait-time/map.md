---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: Wait time on the row

Resume the decision tickets with `/wayfinder .wayfinder/wait-time/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/wait-time/map.md`. Run `/wayfinder-implement .wayfinder/wait-time/map.md <ticket>` after a PR opens or merges.

## Destination

A row that waits on the user shows what it wants and for how long. The flat view's waiting sections sort by **Wait**. One "Open next" control opens the thread that waited longest. The three items M04, M05 and M19 are merged to `main`, one PR each, in that order, as one stack 04 ← 05 ← 06. The user tests the stack and merges it, bottom PR first.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Show the phrase and the Wait on rows that wait on the user](tickets/04-row-wait-build.md) — after [the row look](tickets/01-row-wait-look.md) closes
2. [Sort the waiting sections of the flat view by Wait](tickets/05-sort-by-wait-build.md) — stacks on 04-row-wait-build, and after [the sort rules](tickets/02-sort-by-wait-rules.md) close
3. [Add "Open next"](tickets/06-open-next-build.md) — stacks on 05-sort-by-wait-build (forced), and after [the Open next rules](tickets/03-open-next-rules.md) close

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- 04-row-wait-build ← 05-sort-by-wait-build ← 06-open-next-build. Each key branches from the branch of the key before it.
- main ← wait-time-04-show-row-wait (#61) ← wait-time-05-sort-by-wait (#65) ← wait-time-06-open-next (#67)

## Notes

- Mode: autopilot
- **Stack gate.** A route key unblocks the next key in its chain when its draft PR opens. The next key stacks on its branch.
- **The stack stops for the user.** Each build session opens a draft PR and hands off to the next key. The user tests the stack with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item still merges as its own PR, so `git revert` removes it cleanly. The user tests each item before the next release tag. No feature toggles.
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
- **Mode changed to autopilot (by the user, 2026-11-17):** the three build keys run unattended as one stack of draft PRs. This replaces the merge gate and the no-stack rule above.
- **M04 look:** decided with a prototype ticket that shows the Opus and Sol variants.
- **Reversals:** each is confirmed in the ticket where it applies. The row look ticket confirms the reversal of `d602e6e` (#18). The sort rules ticket confirms the override of `SPEC.md:103`.
- **Glossary:** new term **Wait** in `CONTEXT.md`.
- **Builders:** `/wayfinder-implement` dispatches each key to its own session.

- [How does a row that waits on the user show its phrase and Wait?](tickets/01-row-wait-look.md): Sol position (beside the icon), the row end keeps the age; needs-you rows show phrase + Wait, failed shows "Failed" only, no-Wait rows show the phrase only. Reversal of #18 confirmed.
- [Which thread does "Open next" open, and where is the control?](tickets/03-open-next-rules.md): oldest Wait of the filter set (needs input, plan ready, your turn), settled left out, subthreads in, no Wait last; a repeat press skips threads it opened; header button + `n` + first menu-bar item; disabled "Nothing waits" when empty.
- [How do the waiting sections of the flat view sort by Wait?](tickets/02-sort-by-wait-rules.md): oldest Wait first in Needs input, Plan ready and Your turn, with both sort choices; drag off there, stored order kept; no-Wait rows last; a stack sorts by its oldest Wait in the section's status set. Override of `SPEC.md:103` confirmed.

## Not yet specified

<!-- none at charting -->

## Out of scope

- A small Needs-you window (M23). It needs this map, but it is effort I.
- Sort the Next-step brief by Wait (M11, Sol UX2). It is effort E.
- The "Needs you" count and the filter (M06). It is effort B.
- Writes to T3 (settle, snooze, approve). "Open next" only opens a thread.
- Feature toggles.
