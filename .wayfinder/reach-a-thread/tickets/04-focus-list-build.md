---
title: Add the Focus list
type: wayfinder:task
status: open
assignee: damian.lucero
blocked-by: [01-focus-list-look]
---

## Question

Build M20: the **Focus list**, with the rules of [the Focus list look](01-focus-list-look.md).

## Brief

Start on `main` after the wait-time stack (M04 ← M05 ← M19) merges. Bottom of the stack 04 ← 05 ← 06. Update `SPEC.md`, `CONTEXT.md` and `README.md`. One draft PR.

## Spec

Decided in [the Focus list look](01-focus-list-look.md). The model is prototype D, "Strip above the tree", in `src/page/focus-proto.tsx` at commit `2821d44`. Read it for the look, but do not copy its prototype parts (variant switcher, seed data, memory state, keys 1 to 3).

**Name.** The domain term stays **Focus list** in `CONTEXT.md`. The UI label is **Focus**: the header button, the strip heading and the tooltips ("Add to Focus", "Remove from Focus").

**Toggle.**

- A **Focus** button in the header shows or hides the strip. It shows the count, for example `2/3`, and a pressed state when the strip shows.
- The strip is hidden by default. The page keeps the on/off choice in `localStorage`.
- An add or remove does not change the toggle. The header count shows the change.

**Strip.** It sits above the tree, under the header (and under the brief panel when it shows).

- The heading reads `Focus 2 of 3`. At 3 of 3 it adds `· full, remove one to add another`.
- Three fixed slots in a row. At phone width (720px and less) the slots stack in one column, and empty slots after the first one hide.
- A filled slot is a card. Its first line: status icon, Wait text (the row's phrase, plus the time for a thread that needs the user), and a remove (×) button. Then the full title on up to 2 lines (no limit at phone width). Then an **Open** button (link to the thread) and a **Show in tree** button.
- An empty slot is a dashed box: `Empty. Use ⌖ on a row.`

**Add.**

- **Row.** A ⌖ button in each thread row, before the Details button. It shows on hover and focus, and always on touch screens. On a row that is in the list, it stays visible, shows pressed, and removes the thread.
- **Brief.** Each Action with linked threads gets an "Add to Focus" icon button next to its other buttons. With one linked thread, it adds that thread. With more than one, it opens a menu of the linked threads. A thread that is in the list shows as checked and is not offered again.
- **Drag.** The user drags a thread row from the tree or the flat view onto the strip, with the row's existing drag handle and the `@dnd-kit` setup of the tree. The strip must show to take a drop.
  - Drop on an empty slot: adds the thread there.
  - Drop on a filled card: the card shows a quick confirmation in place ("Replace with <title>?" with Replace and Cancel). Replace swaps the entry. Cancel, Escape or a click outside keeps it.
  - Drop of a thread that is in the list already: no change.
  - A drop outside the strip keeps the tree reorder as today.
- **At 3 of 3** the add buttons are disabled. A tooltip says "Focus is full (3 of 3). Remove one first." Only a drop on a card replaces an entry, after the confirmation.

**Remove and order.**

- The × on a slot or the pressed ⌖ on the row removes the entry.
- A thread that is settled or deleted leaves the list by itself. Remove it only from a live tree (connection `ok`), so a down or loading tree never clears the list.

**Show in tree.** It scrolls the tree to the row (smooth, or instant with reduced motion). After the scroll ends, the row flashes so the eye finds it: a clear ring or highlight for about 1.5 s. In the prototype, the flash runs during the scroll and is not visible. If the row is not rendered (folded project, closed stack, filter), the button shows a short note that the row is hidden. Unfold rules are fog on the map.

**Store.** The entry ids live in `localStorage`, like the stored order in `src/page/order.ts`. Wrap reads and writes in try/catch, like the existing storage helpers in `app.tsx`. No T3 writes. The tree order does not change.

**Waiting count.** None in the strip. The Needs-you count in the header covers it.

**Keys.** No Focus keys in this build. The keys 1 to 3 go to [the page keys](03-page-keys.md).

**Side fix.** All row buttons (Send message, Details, the new ⌖, and the others that use `ROW_BUTTON`) get `cursor: pointer`. Disabled buttons keep the default cursor.

**Docs.** Update `CONTEXT.md` (Focus list: opt-in, UI label Focus, add from row or brief), `SPEC.md`, and `README.md` ("What you get").

## Done when

- The header has a Focus button with the count. The strip is hidden by default. The on/off choice survives a reload.
- The ⌖ row button and the brief Action add a thread. The list holds at most 3. At 3 of 3, the add buttons are disabled and say why.
- The list survives a reload. A settled or deleted thread leaves it. A down or loading tree does not clear it.
- A thread row dragged from the tree or the flat view onto an empty slot adds it. A drop on a filled card asks in the card, then replaces on Replace and keeps on Cancel. A drop outside the strip reorders the tree as before.
- Show in tree scrolls to the row, then the row flashes visibly. A hidden row gives a note.
- Open goes to the thread.
- All row buttons show a pointer cursor.
- Unit tests cover the list rules: add, the limit of 3, remove, replace at a slot, prune of settled and deleted threads, no prune when the tree is not live, and store read and write.
- `bun run check` passes. `bun run demo` looks right in light and dark mode, at desktop and phone width.
- `CONTEXT.md`, `SPEC.md` and `README.md` are updated. One draft PR.
