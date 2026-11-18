---
title: How do context rows look, and what does a section count?
type: prototype
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

How does a **Context row** look, in a status section and in the "Needs you" filter, and what number does a section header show?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M07. Build a throwaway variant switch in the demo. Show the Opus and the Sol variant side by side, light and dark, desktop and phone width. The user picks.

Decide:

- **Look.** Opus: muted color, or fold the context rows of a PR stack to the rail header. Sol: label them as context rows. Today the "Needs you" filter shows its spawners in muted text (`dim`, `src/page/app.tsx:987`). One look covers both places (decided at charting).
- **Count.** The section count counts threads that match the section, not units (`src/page/view.ts`, `count: s.units.length`). Decide if the header also shows the context rows apart (Sol), or the match count only.
- **Settled rows.** With "Show settled threads" on, a settled thread does not pull its unit up (decided at charting). Decide if a settled thread whose status matches the section is a match (counted) or a context row.
- **Stack.** A PR stack stays one block (`SPEC.md:103`). Only the look and the count change.

Fixed: M01 lands first, so a unit can sit in a section because of a subthread. Its parent row is then a context row.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](04-context-rows-build.md) from the answer. Delete the prototype code; link a screenshot or the throwaway branch from the resolution.

## Resolution

The user picked these answers from the demo prototype (variants A Opus muted, B Opus fold, C Sol label; light and dark, desktop and phone):

- **Look: B, fold in stacks.** In a PR stack, the context rows fold behind a "+N other threads" button on the rail header. The button shows and hides them. Context rows that cannot fold (a thread row, a spawner, a subthread) show muted, as the "Needs you" spawners do today. A context row that holds a matching subthread does not fold.
- **Count: matches only.** A section header shows the number of threads that match the section, subthreads included. No separate context count.
- **Settled: context row.** With "Show settled threads" on, a settled thread is a context row, also when its status matches the section. It does not count.

Prototype: branch `prototype/status-groups-context-row-look` (commit `1b9dbcd`). Run `bun run demo` and open `?variant=A`, `B` or `C` in the flat view with "Group by: Status". Screenshots: `prototype-shots/context-row-look/` on that branch.
