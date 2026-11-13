---
title: How do the floating row and the tree animations feel?
type: prototype
status: open
assignee:
blocked-by: [01-animation-primitive, 02-stable-order]
---

## Question

Does the floating row (hovered element keeps its screen position, springs home on leave) feel right, or does the whole-tree freeze (no layout change while the pointer is over the tree, applied on leave) feel better? What durations, spring, grace delay, and lift look right?

## Brief

Build both modes in the demo (`bun run demo`) with the primitive from 01 and the order from 02. The demo needs a control that fakes live pushes (re-sort, add a row, remove a row, change a row's height). Show light and dark mode. The user picks one mode and the values.
