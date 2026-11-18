---
title: How does the small window look?
type: prototype
status: open
assignee: 
blocked-by: []
---

## Question

What does each row of the small window show, how big is the window, where does "Open next" sit, and what does "Nothing waits" look like?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M23, and the [map](../map.md) › Decisions so far. Build a throwaway variant switch in the demo (`bun run demo`): render the window content as a page at a narrow fixed width. Show two or three variants, light and dark. The user picks.

Decide:

- **Row.** Which of these it shows: status icon, phrase, title, Wait, project or issue key. The flat-view row and the menu-bar item are the two references. One line or two.
- **Click.** A click on a row opens the thread in T3 (`t3code://`). Confirm, and decide if a row has a hover tooltip.
- **Open next.** A button at the top, at the bottom, or the top row marked as the target. It must agree with the page's skip memory (ticket 02 decides how).
- **Size.** Default width and height, and the row count before the list scrolls.
- **Empty.** The "Nothing waits" state.
- **Count.** If the window shows a count, and which count.

## On resolution

Write the look part of the `## Spec` and `## Done when` of [the build ticket](03-window-build.md). Delete the prototype code; link a screenshot or the throwaway branch from the resolution.
