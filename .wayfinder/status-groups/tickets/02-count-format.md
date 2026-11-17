---
title: How does the header show the your-turn count?
type: prototype
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

Where and in what format does the header show the your-turn count next to the **Needs you** count, so the count agrees with what the filter keeps?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M06. Build a throwaway variant switch in the demo. Show the Opus and the Sol variant side by side, light and dark, desktop and phone width. The user picks.

Fixed by the review: keep the **Needs you** definition (needs input, plan ready) and the Dock badge. The filter keeps your-turn threads too (`src/page/attention.ts:6`). The chip is in `src/page/app.tsx` (the "Needs you" `ToggleGroupItem`); the counts come from `countAttention`.

Decide:

- **Opus:** a second, muted number in the chip, "5 · 3", with the tooltip "5 wait for you, 3 finished and not opened".
- **Sol:** the words "5 waiting, 3 results" beside the filter.
- **Zero.** What shows when one of the two numbers is 0, and when both are 0.
- **Phone width.** The header is tight on a phone. Check that the chosen format fits.
- **Words.** The tooltip or label words, in the terms of `CONTEXT.md`.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](05-needs-you-count-build.md) from the answer. Delete the prototype code; link a screenshot or the throwaway branch from the resolution.

## Resolution

The user picked these answers from the demo prototype (Opus and Sol variants, light and dark, desktop and phone, forced counts):

- **Format: Opus.** The "Needs you" chip shows the **Needs you** count as today's badge, then a muted second number for the your-turn threads: "6 · 5". It fits on the first header line at phone width. Sol put its words on a separate line on a phone.
- **Zero.** Each number shows only when it is above 0. With only your-turn threads, the chip shows the muted number alone, with no badge and no dot. With both at 0, the chip shows no number.
- **Words.** A tooltip on the numbers uses the status names: "6 need you, 5 your turn". A part that is 0 is left out.

Prototype: branch `prototype/count-format` (commit `7136b4a`), run `bun run demo` and open `?variant=opus` or `?variant=sol`; `&counts=N,M` forces the two counts. Screenshots: `.wayfinder/status-groups/assets/02-count-format/` on that branch.
