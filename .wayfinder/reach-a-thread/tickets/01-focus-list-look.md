---
title: How does the Focus list look and work?
type: prototype
status: open
assignee:
blocked-by: []
---

## Question

Where does the **Focus list** sit, how does the user add and remove a thread, and what does each slot show?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M20. Charting decided: one list of up to 3 chosen threads, no Now/Next split. It is local to this app, changes no T3 state and does not reorder the tree (closed map `frozen-rows`).

Make a prototype with two or three variants and decide:

- **Place.** Above the tree, under the header, or in the header? Phone width.
- **Add.** From the row (which control, in a row that already has up to 7 stops), from a brief Action, or both. What happens at 3 of 3?
- **Remove and order.** Remove control. Can the user reorder the list? Does a settled or deleted thread leave it?
- **Slot.** Live status, full title, Wait, Open control. Does a click scroll to the row in the tree?
- **Store.** `localStorage`, like the stored order (`src/page/order.ts`)? The review asks for "keep after a reload".
- **Waiting count.** The review asks for a separate waiting count so focus does not hide new requests. The header count from M19/M06 may cover it.
- **Name.** Confirm **Focus list** in `CONTEXT.md`, or rename it.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](04-focus-list-build.md) from the answer. Link the prototype.
