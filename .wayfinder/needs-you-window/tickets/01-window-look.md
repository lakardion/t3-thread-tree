---
title: How does the small window look?
type: prototype
status: closed
assignee: claude (needs-you-window-01)
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

## Resolution

The user picked variant A, "Compact list", with these changes:

- **Row.** One line, 28 px high: status icon, project icon (no name), issue key, title, Wait. No phrase text. The key links to Linear when `linearHref` gives a URL, else it is plain text. The title is cut off with an ellipsis. The Wait has the status colour, in mono digits.
- **Click.** A click on the row (not the key) opens the thread in T3. Hover shows the full title as a tooltip.
- **Open next.** An outline button at the right of a top bar. The row that Open next opens has an amber left mark and a tint.
- **Count.** The top bar shows the window name and the count of all listed threads (the Open next set). The name comes from ticket 02.
- **Size.** 360×360 by default, about 10 rows before the list scrolls. The user can resize it.
- **Empty.** The top bar stays, with Open next disabled. The list area shows "Nothing waits" and "Threads that need you show here." in the middle.

Prototype: branch `prototype/needs-you-window-look` (commit `deb3693`). Run `bun run demo` and open `?prototype=small-window&variant=A|B|C`; `&empty=1` shows the empty state. Screenshots: `.wayfinder/needs-you-window/assets/01-window-look/` on that branch.
