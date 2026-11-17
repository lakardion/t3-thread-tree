---
title: Count the matching threads of a section and show its context rows
type: wayfinder:task
status: open
assignee: 
blocked-by: [01-context-row-look, 03-unit-placement-build]
---

## Question

Build M07: a status section counts the threads that match it, and its other rows show as **Context rows**, with the look and count that [the context row look](01-context-row-look.md) chose. The same look applies to the spawners of the "Needs you" filter.

## Spec

From [the context row look](01-context-row-look.md) (variant B):

- **Context row.** In a status section, a thread row is a context row when its status is not one of the section's statuses, or when it is settled. In the "Needs you" filter, a kept spawner is a context row (as today).
- **Fold in a stack.** In a status section, the context rows of a PR stack fold. The rail header shows a "+N other threads" button (`N` = folded rows). The button shows and hides them. The open state is not saved. A context row that holds a matching subthread does not fold.
- **Muted.** A context row that does not fold (a thread unit, a spawner, a subthread, a stack row shown again) shows muted title text. This is the look of the "Needs you" spawners today (`dim`).
- **Count.** A section header shows the number of threads that match the section, subthreads included, settled threads left out (`src/page/view.ts`, today `count: s.units.length`).
- **No change** without "Group by: Status", and in the tree layout, apart from the "Needs you" spawners, which keep their muted look.

Reference: branch `prototype/status-groups-context-row-look` (`src/page/view.ts` and `src/page/app.tsx`; variant B). Rewrite it; do not copy the prototype code.

Fixed now: stacks on the 03-unit-placement-build branch. A PR stack stays one block (`SPEC.md:103`). Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` ("What you get"). One draft PR in the stack 03 ← 04 ← 05.

## Done when

- A unit test on `sections` / `sequence` proves the count: matching threads, subthreads included, settled threads left out, context rows left out.
- In `bun run demo` with "Group by: Status", the storefront PR stack in "Needs input" shows one row (SHOP-413) and a "+3 other threads" button. The button shows and hides the other three rows, muted.
- "Needs input" shows the matching-thread count. Light and dark, desktop and phone width.
- `bun run check` passes. `SPEC.md`, `DESIGN-SPEC.md` and `README.md` ("What you get") describe the context rows and the count.

## Handed over from status-groups-03

- 03 is merged to `main` as `741d0dc` (#78). Start this key from `main`.
- `unitThreads` in `src/page/view.ts` now returns every thread of a unit, subthreads at any depth, without settled ones (all of them when every thread is settled). Placement and the Wait sort use it. Use it for "the threads that match a section".
- In `bun run demo`, the Migrate and Search threads are subthreads only with "Nest launched threads" on (View panel). Turn it on to see units with subthreads in the flat view.
- `README.md` "Group by status" still says "A PR stack goes to the group of its most urgent thread". Ticket 03 is a bug fix with no README change. Update that line with the context-rows feature: any unit goes by its most urgent thread, subthreads included, settled threads left out.
