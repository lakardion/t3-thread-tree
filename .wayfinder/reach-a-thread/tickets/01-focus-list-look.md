---
title: How does the Focus list look and work?
type: prototype
status: closed
assignee: damian.lucero
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

## Prototype

Branch `wayfinder/reach-a-thread`, commits `287b1af`, `26b66b7` and `2821d44` (removed after this ticket closed). Six variants on the real page: A to C by Sol (rebuilt in `2821d44`), D to F by Opus in `src/page/focus-proto.tsx`. To look at them again, check out `2821d44`, run `PORT=4788 bun run demo` and open `http://127.0.0.1:4788/?variant=D`.

## Resolution

Decided with the user. The build spec is in [Add the Focus list](04-focus-list-build.md).

- **Layout:** prototype D, a strip of three fixed slot cards above the tree. Stacked at phone width.
- **Opt-in:** hidden by default. A Focus header button with the count shows or hides it. The choice is kept in `localStorage`.
- **Add:** a ⌖ row button and an "Add to Focus" control on brief Actions.
- **Drag:** drag a row from the tree or the flat view onto the strip. A drop on an empty slot adds. A drop on a filled card replaces it after a quick confirmation in the card.
- **At 3 of 3:** the add buttons refuse with a hint. Only a drop on a card replaces.
- **Remove and order:** × on the slot or the pressed ⌖. No reorder inside the strip.
- **Settled or deleted:** leaves the list by itself.
- **Slot:** status icon, Wait, full title, Open, Show in tree. Show in tree scrolls, then flashes the row visibly.
- **Store:** `localStorage`. No T3 writes.
- **Waiting count:** the header Needs-you count is enough.
- **Keys 1 to 3:** handed to [the page keys](03-page-keys.md).
- **Name:** the domain term stays **Focus list**. The UI label is **Focus**.
- **Side fix in the build:** a pointer cursor on all row buttons.
