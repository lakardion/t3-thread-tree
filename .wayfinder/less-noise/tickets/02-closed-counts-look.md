---
title: How does a closed project show its thread counts?
type: prototype
status: closed
assignee: claude
blocked-by: []
---

## Question

Choose the look of M16: a closed project (and other closed branches) shows counts instead of one status icon for each thread. Today `Icons` in `src/page/app.tsx` draws one icon for each thread; a closed storefront shows 12.

## Brief

Build a throwaway prototype in `bun run demo` that shows both looks side by side, light and dark, desktop and phone width:

- **Words:** "2 need you · 4 working".
- **Icon + number:** the status icon of each group with its count.

Decide with the user:

- The look (words or icon + number).
- The groups: the status sets of the flat sections (`SECTIONS` in `src/page/view.ts`), or fewer.
- The threshold: the icon line stays for 4 threads or fewer (per M16), or another number.
- Which closed rows change: closed projects only, or also closed key groups and stacks (they use the same `Icons`).
- What happens to the `data-waiting` edge of a closed row that hides a waiting thread.

Effort B chooses the count format of the "Needs you" filter (M06, [the count format](../../status-groups/tickets/02-count-format.md)). Read its resolution, and keep the two looks consistent.

Link the prototype branch from this ticket. When this ticket closes, write the `## Spec` and `## Done when` of [the build key](05-closed-counts-build.md).

## Resolution

The user picked these answers from the demo prototype (today's icons, words, icon + number; light and dark, desktop and phone):

- **Look: icon + number.** Each group shows the status icon of the group and its count, in the muted text color: "◇ 3 ☰ 1 💬 2 ◌ 6". A tooltip spells out the words: "3 needs input, 1 plan ready, 2 your turn, 6 working, 5 idle and snoozed, 1 done". Words wrapped to two lines at phone width and cut the project name to one letter. Icon + number stayed on one line.
- **Groups: the flat sections.** The seven groups of `SECTIONS` in `src/page/view.ts`, in that order. The icon of a group is the icon of its first status. A group with 0 threads is left out.
- **Threshold: 4.** A closed project with 4 threads or fewer keeps the icon line. With 5 or more, it shows counts.
- **Rows: closed projects only.** Closed key groups keep the icon line. They are small.
- **Edge: kept.** The `data-waiting` edge of a closed row that hides a waiting thread does not change.
- **Consistency with effort B.** The header chip counts what needs you. These counts describe one project and use the status names, as the chip tooltip does.

Prototype: branch `prototype/closed-counts` (commit `458290a`). Run `bun run demo`, close the projects, and open `?variant=icons|words|glyphs`; `&groups=sections|few`, `&max=N` and `&scope=projects|all` change the other choices. Screenshots: `.wayfinder/less-noise/assets/02-closed-counts-look/` on that branch.
