---
title: How does a closed project show its thread counts?
type: prototype
status: open
assignee:
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
