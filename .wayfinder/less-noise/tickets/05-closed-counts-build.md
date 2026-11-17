---
title: Show counts on a closed project
type: wayfinder:task
status: open
assignee:
blocked-by: [02-closed-counts-look, 04-quiet-working-build]
---

## Question

Build M16: a closed project shows counts instead of one status icon for each thread, in the look that [the closed-project count look](02-closed-counts-look.md) chose.

## Spec

- A closed project row with 5 or more threads shows counts in place of the icon line (`Icons` in `src/page/app.tsx`, in `ProjectBlock`). With 4 threads or fewer, it keeps the icon line.
- The groups are the flat sections (`SECTIONS` in `src/page/view.ts`), in that order. Each group with at least 1 thread shows the icon of its first status (`LegendIcon`, status color) and its count in muted text, `tabular-nums`. A group with 0 threads is not shown.
- A tooltip on the counts gives the words, with each section label in lower case: "3 needs input, 1 plan ready, 2 your turn". Give the counts the same text as an accessible name.
- Closed key groups (`GroupRow`) and closed stacks do not change.
- The `data-waiting` edge of a closed row does not change.
- The counts stay on one line at 390 px for the demo projects.
- Reference: the `Counts` and `Icons` code on branch `prototype/closed-counts` (`458290a`). Do not copy its variant switch or URL params.

## Done when

- A closed demo project with 5 or more threads shows icon + number counts; one with 4 or fewer shows the icon line.
- A closed key group still shows the icon line.
- A unit test covers the group counts and the threshold.
- Also: `bun run check` passes; `bun run demo` checked in light and dark, desktop and phone width; `DESIGN-SPEC.md` updated where it describes closed rows ("one status shape per thread on closed rows"); `README.md` updated; one draft PR, stacked on the branch of 04-quiet-working-build.
