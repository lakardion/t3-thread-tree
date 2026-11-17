---
title: Show the your-turn count next to the Needs-you count
type: wayfinder:task
status: in-review
assignee: claude (status-groups-05)
blocked-by: [02-count-format, 04-context-rows-build]
---

## Question

Build M06: show the your-turn count next to the **Needs you** count, in the format that [the count format](02-count-format.md) chose.

## Spec

From [the count format](02-count-format.md) (variant Opus).

- The "Needs you" chip in the header (`src/page/app.tsx`) shows two numbers from `countAttention`: the **Needs you** count (`needYou`) in today's badge, then the your-turn count (`yourTurn`) as a muted number, `text-[11px] text-muted-foreground tabular-nums`.
- A "·" sits between the two numbers only when both show.
- Each number shows only when it is above 0. Your-turn only: the muted number alone, no badge. Both 0: no number.
- A tooltip on the numbers says "N need you, M your turn". A part that is 0 is left out. The tooltip sits inside the `ToggleGroupItem`, as the theme items do, so the item keeps its `data-state`.
- Keep the **Needs you** definition, the Dock badge and the menu-bar list unchanged.

Fixed now: stacks on the 04-context-rows-build branch. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` ("What you get"); `CONTEXT.md` › Needs you says the header count shows this set, so add that the your-turn count shows next to it. One draft PR, the top of the stack 03 ← 04 ← 05.

## Done when

- With 6 needs-you and 5 your-turn threads, the chip reads "Needs you 6 · 5", and the tooltip reads "6 need you, 5 your turn".
- With 0 and 3, the chip shows only a muted "3"; with 5 and 0, only the badge "5"; with 0 and 0, no number.
- The chip stays on the first header line at 390px width, in light and dark mode (`bun run demo`).
- The Dock badge still counts needs-input and plan-ready threads only.
- `bun run check` passes; the docs above are updated.

## Handed over from status-groups-04

- 04 is in review as draft PR #79, branch `status-groups-04-context-rows-count`. Stack this key on that branch.
- A status section header now counts matching threads, subthreads included, settled left out (`sequence` in `src/page/view.ts`). `isContext(t, statuses)` there is the one rule for a **Context row**; `CONTEXT.md` defines the term.
- The "Needs you" spawners keep their muted look (`dim` in `ThreadRow`, `src/page/app.tsx`).
