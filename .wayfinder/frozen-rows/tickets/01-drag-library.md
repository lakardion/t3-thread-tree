---
title: Which drag library reorders the tree?
type: wayfinder:research
status: closed
assignee: claude (frozen-rows-01)
blocked-by: []
---

## Question

Which library gives drag-to-reorder for the tree in this React 19 + Bun + Tailwind 4 app: `@dnd-kit` (the classic `core` + `sortable`, or the new `@dnd-kit/react`), Atlassian `pragmatic-drag-and-drop`, or another one you find?

## Brief

Answer from primary sources (library docs, changelogs, GitHub issues, bundle size tools). The user does not want plain HTML5 drag-and-drop by hand.

- **Nested sortable lists:** project cards; groups inside a project section; threads inside a group. Each list reorders only inside itself. Groups that share a PR stack must move as one block.
- **Keyboard:** a keyboard path to move a focused item up and down, with screen reader announcements.
- **Live data:** the tree is replaced by a server push every 30 s and on each change. A push during a drag must not cancel or break the drag.
- **Motion:** how the library animates the items that make room, and if it can work together with enter and exit animation of rows (route key 05) and the status transitions (route key 03). How it handles `prefers-reduced-motion`.
- **Health:** React 19 support, maintenance state, bundle cost (min+gzip).

End with a recommendation and a sketch (under 40 lines) of how one sortable list wires into `src/page/app.tsx`.

Write the findings to `.wayfinder/frozen-rows/research/01-drag-library.md`, then close this ticket with a short Resolution and add one line to the map's Decisions so far.

## Resolution

Use `@dnd-kit/react` with `@dnd-kit/helpers`, pinned to `0.5.3`. It has React 19 support, a keyboard drag with screen reader announcements, items that slide to make room, and it sets durations to 0 ms under `prefers-reduced-motion`. It costs 39.8 kB min+gzip. Pragmatic drag-and-drop has no keyboard drag and does not move items during a drag. Classic `@dnd-kit/core` + `sortable` has had no release since 2024-12-05.

For 04-manual-reorder: render the dragged list from a snapshot of its ids from drag start to drop, make each `stackRuns` run one sortable item, give each list its own `group`/`type`/`accept` key, prefix ids by level, and pass custom announcements. Details and a wiring sketch: [research/01-drag-library.md](../research/01-drag-library.md).
