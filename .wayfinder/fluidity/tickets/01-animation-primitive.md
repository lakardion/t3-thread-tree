---
title: Which animation primitive animates the tree and holds the floating row?
type: research
status: closed
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

## Resolution

Hand-written FLIP with the Web Animations API (about 40 lines, no dependency). Findings: `.wayfinder/fluidity/research/01-animation-primitive.md` on branch `research/animation-primitive` (commit `e6ff918`).

- Only a hand-written FLIP can hold one element at its old screen position for an open time. View Transitions (and React 19.3 `<ViewTransition>`) break hover: a hit test during a transition returns `HTML`, and a second transition skips the first. `motion` has no hold and costs about 43 kB (`domMax`).
- Measure visual rects before `setTree`, so an update during an animation starts from the on-screen position. Each element animates its offset relative to its parent. A held element animates to its absolute offset and stays.
- Release uses a spring sampled into CSS `linear()` (bounce 0.25 gives 2.8% overshoot).
- Expand and collapse (d): the installed `tw-animate-css` classes are enough.
- Risks: `ProjectCard` has `overflow-hidden` and clips a held row that leaves its card. A removed row needs its data kept for an exit animation. The sketch is untested.
