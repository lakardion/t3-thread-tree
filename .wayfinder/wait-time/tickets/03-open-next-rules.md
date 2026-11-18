---
title: Which thread does "Open next" open, and where is the control?
type: grilling
status: closed
assignee: damian.lucero
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

## Resolution

The user agreed to these rules:

- **Set.** The filter set: `needs-input`, `plan-ready` and `your-turn`. Subthreads are included. Settled threads are always left out, also with "Show settled" on. The All/Needs-you filter, closed folds, the layout and the sort do not change the set. The control works on the whole tree.
- **Order.** Oldest `since` first, so the longest **Wait** wins. Status has no rank. Rows with no Wait go last. A tie keeps the tree order.
- **Repeat.** "Open next" remembers each thread that it opened, by thread id plus `since`, and skips it until its Wait starts again (a new `since`). The memory is in memory only, so a reload clears it. When every thread in the set was skipped, the memory clears and the control opens the top thread again.
- **Empty set.** The header button stays visible and is disabled, with the tooltip "Nothing waits". The key `n` does nothing. The menu-bar item is hidden.
- **Places.** A header button next to the "Needs you" filter: icon plus "Open next", icon only with an `aria-label` at phone width. The key `n` with no modifiers, off when focus is in an input, a textarea or a contenteditable element, and when a dialog, a menu or the View panel is open. The first item of the menu-bar menu in the desktop app.
- **Label.** The button label stays "Open next". Its tooltip names the target: "<phrase> · <title> · <Wait>". The menu-bar item is "Open next · <title>".
- It writes nothing to T3.
