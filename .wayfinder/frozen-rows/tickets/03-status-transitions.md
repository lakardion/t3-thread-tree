---
title: Animate status, phrase and PR mark changes
type: wayfinder:task
status: in-review
assignee: claude (frozen-rows-03)
blocked-by: []
---

## Question

When a live push changes a row's status, its phrase or a PR mark, show the change with motion instead of an instant swap.

## Spec

- **Status icon:** the old icon fades out and the new one fades and scales in. The status color moves with a color transition.
- **Phrase:** the old text fades out, the new text fades in. An elapsed time that only ticks (for example "Working 3m" to "Working 4m") does not animate.
- **Change pulse:** a row whose status changed gets a short wash in the new status color that fades out (about 1 s). Only on a live push, not on first load.
- **PR marks:** checks, review, conflict, draft, merged and closed marks on a PR chip transition (fade and color) instead of a swap.
- Use CSS transitions and keyframes, or the installed `tw-animate-css`. Add no dependency.
- With `prefers-reduced-motion`, no animation and no pulse.
- **Demo:** add a way to fake live pushes in `bun run demo` (for example a control or a timer that changes a few statuses and PR marks), so the motion can be checked. Later keys reuse it for row add, remove and reorder.
- `DESIGN-SPEC.md`: describe the motion, durations and easing. `README.md`: add the feature to "What you get".

## Done when

`bun run check` passes, and the demo shows each transition in light and dark mode.
