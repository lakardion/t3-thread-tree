---
title: Fit the brief row to a phone
type: wayfinder:task
status: open
assignee: 
blocked-by: [01-brief-row-look, 06-full-titles-build]
---

## Question

Build M15: fit the brief row to a phone.

## Brief

Build M15 with the look of [the brief row look](01-brief-row-look.md). Stacks on 06-full-titles-build. Check at 390 px, light and dark. One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

Look from [the brief row look](01-brief-row-look.md) › Resolution.

- At 720 px and less (the app breakpoint), hide the buttons on the right of the row. Show them on a line below the reason, in line with the heading (left padding past the rank).
- On that line, the buttons show text labels: Send, New thread, Copy, Focus. Desktop keeps icon buttons with tooltips.
- Check at 390 px, light and dark: no horizontal scroll, the heading and the reason wrap, and the marks bar fits on one line.
