---
title: Which drag library reorders the tree?
type: wayfinder:research
status: open
assignee:
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
