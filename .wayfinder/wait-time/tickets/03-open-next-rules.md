---
title: Which thread does "Open next" open, and where is the control?
type: grilling
status: open
assignee:
blocked-by: [01-row-wait-look]
---

## Question

What set and order does "Open next" use, and where does the user find it?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M19. The review proposes: open in T3 the thread with the longest **Wait**, from the set that the "Needs you" filter keeps (`needs-input`, `plan-ready`, `your-turn`); a header button, the key `n`, and the first item of the menu-bar menu. It writes nothing to T3.

Decide:

- **Set.** The filter set, or the **Needs you** set of `CONTEXT.md` (no `your-turn`)? Subthreads included? Does the current filter, "show settled" or a closed fold change it?
- **Order.** Longest Wait first. Where do rows with no Wait go?
- **Repeat.** T3 clears `your-turn` on a visit, but a `needs-input` thread stays until the user answers. Does a second press open the same thread, or the next one?
- **Empty set.** Is the control hidden, off, or does it say "Nothing waits"?
- **Places.** Header button, key `n` (and its guard in text fields and dialogs), menu-bar item in the desktop app, phone width.
- **Label.** Does the control show the target title or its Wait?

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](06-open-next-build.md) from the answer.
