---
title: Which animation primitive animates the tree and holds the floating row?
type: research
status: open
assignee:
blocked-by: []
---

## Question

Which primitive animates the tree's layout changes in this React 19 + Bun + Tailwind 4 app, and can also hold one element at its old screen position until release: a hand-written FLIP with the Web Animations API, the native View Transitions API (and React 19 `<ViewTransition>`), or the `motion` library?

## Brief

Answer from primary sources (MDN, React docs, motion docs, browser support tables):

- Reorder of nested lists (cards > groups > rows > subthread rows) on a data push, plus row add and remove.
- Hold one element at its old screen position for an open time (while hovered), while the rest moves, then release with a spring with a small overshoot.
- An update that arrives during a running animation, or while an element is held.
- `prefers-reduced-motion`.
- Bundle cost and new dependencies. The project avoids dependencies that a few lines can replace.

End with a recommendation and a sketch (under 40 lines) of the primitive's API.
