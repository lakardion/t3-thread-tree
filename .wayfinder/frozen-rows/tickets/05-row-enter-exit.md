---
title: Animate rows that enter and leave
type: wayfinder:task
status: closed
assignee: claude (frozen-rows-05)
blocked-by: []
---

## Question

When a live push adds or removes a row, a group or a project card, show it with motion instead of an instant change.

## Spec

- **Enter:** a new item fades in and grows from zero height. It appends at the end of its list, so other rows do not move.
- **Exit:** a removed item (gone, settled out while settled threads are hidden, or out of the "Needs you" filter) fades out and collapses to zero height. Keep its last data until the exit ends.
- First load renders at once, with no enter motion.
- Work together with the drag library from [Let the user drag projects, groups and threads into their own order](04-manual-reorder.md). A drag in progress is not disturbed.
- Add no dependency unless the drag library already gives this. The FLIP research in the map Notes is input.
- With `prefers-reduced-motion`, no animation.
- Extend the demo's fake pushes with row add and remove. `DESIGN-SPEC.md`: describe the motion. `README.md`: update "What you get".

## Done when

`bun run check` passes, and the demo shows enter and exit in light and dark mode.

## Handed over from frozen-rows-04

- `src/page/order.ts` already keeps the last data of a removed row, but only for the list under a drag (`Freeze`, `applyFreeze`). The exit store of this key can reuse or extend that. Do not drop a frozen row before the drop.
- dnd-kit animates `translate` on each sortable `<li>` during a drag. Animate height and opacity, or an inner wrapper, and run no enter or exit motion on the drag source or while a drag runs.
- `scripts/demo.ts` already settles and unsettles `demo-14` (API-77 · Document the rate-limit headers). With settled threads hidden, that row leaves and comes back, which is an exit and an enter.
- A list grows from one to two items by an enter. Then the row gets sort props, and `Sortable` remounts it (`app.tsx`). An enter animation keyed on mount must not fire for that remount.
