---
title: Let the user drag projects, groups and threads into their own order
type: wayfinder:task
status: open
assignee: claude (frozen-rows-04)
blocked-by: [01-drag-library, 02-stable-order]
---

## Question

Let the user reorder project cards, groups in a project, and threads in a group by drag, with the library that [Which drag library reorders the tree?](01-drag-library.md) picks.

## Spec

- **Levels:** project cards; groups inside one section of a project; top-level threads inside one group. Subthreads keep the base order. No drag across lists.
- **Stacks:** groups that share a PR stack move as one block and keep their stack order inside it.
- **Handle:** a drag handle that shows on row hover and focus, so a click on the title link still opens the thread.
- **Keyboard:** the library's keyboard path (for example Space to lift, arrows to move, Space to drop), with screen reader announcements.
- **Storage:** the order of each list is a list of ids in `localStorage`, like the closed rows. An id that is not in the stored list goes after the stored ones, in base order, so new items still append at the bottom. Drop ids that no longer exist.
- **Live push during a drag:** the drag continues; the new data applies under it.
- **Reset:** a header control "Reset order" clears the stored order.
- Items that make room move with the library's animation. With `prefers-reduced-motion`, no animation.
- `SPEC.md` and `DESIGN-SPEC.md`: describe the order rules and the handle. `README.md`: add the feature to "What you get".

## Done when

`bun run check` passes, the order survives a reload and a live push in the demo, and the keyboard path works.
