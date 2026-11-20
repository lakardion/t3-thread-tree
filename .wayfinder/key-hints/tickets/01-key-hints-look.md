---
title: How do the key hints look, and when do they show?
type: prototype
status: closed
assignee: claude (key-hints-01 session)
blocked-by: []
---

## Question

Where does each **Key hint** sit, how does it look, and does it show all the time, only while the user holds Alt/Option, or both?

## Brief

The page keys come from [the page keys](../../reach-a-thread/tickets/03-page-keys.md). Their code is on `reach-a-thread-06-add-row-keys` (#91, stacked on Find #89): `src/page/keys.ts`, `src/page/find.tsx`, the `KEYS` legend and the header buttons in `src/page/app.tsx`, the slots in `src/page/focus.tsx`. Branch the prototype from it.

The pain: in Find, Shift+Enter (or the ⌖ row button) closes Find and shows the row in the tree. The user did not know this, and found it unexpected. The user runs many threads and is overwhelmed: every hint must earn its place.

Make a prototype with variants on the real page (`?variant=`), and decide:

- **Mode.** (A) Always-on soft hints. (B) No hints until the user holds Alt/Option, then all hints show. (C) Both: always-on hints in Find only, all hints on hold. Hold time before the hints show, and what a quick tap does. On macOS, Option+key types a character: holding Option must not break typing in a field.
- **Find.** Hints on the selected result row only (↵ Open · ⇧↵ Show in tree), or a footer bar under the list (↑↓ · ↵ · ⇧↵ · esc). The ⌖ button's tooltip. A row that cannot show in tree (`canShow` false).
- **Header buttons.** A key cap in the Find (⌘K / Ctrl+K) and Open next (`n`) buttons, or none (the tooltips already name the keys). Phone width hides the button labels.
- **Focused row.** `o` Details · `s` Send on the row with keyboard focus only, or none.
- **Focus slots.** `1`, `2`, `3` on each filled slot, or none.
- **Look.** Size, color and contrast in light and dark: soft (muted, small) but legible. The key cap is the shadcn `Kbd` component (decided at charting); tune its size and tone here.
- **Touch.** No keyboard, no hints? `(pointer: coarse)` or `(hover: none)` as the test.
- **Switch.** "Show key hints" in the View group of Settings, on by default, kept in `localStorage`. With mode B, does the switch turn off the hold too?

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](02-key-hints-build.md) from the answer. Link the prototype. Rule out any surface that the user drops.

## Resolution

Decided by the user on the prototype: [`prototype/key-hints-look`](https://github.com/lakardion/t3-thread-tree/tree/prototype/key-hints-look) (commit `4c0c6bc`, `src/page/key-hints.prototype.tsx`, variants A–D, `bun run demo` then `?variant=B`).

- **Mode: B, hold only.** No key hint shows until the user asks for it. The user holds Alt/Option alone for 300 ms, then all hints show. They hide on key up, on any other key (a chord, so Option+key typing in a field is safe), on a click, and on window blur. A shorter tap does nothing. Always-on hints (A, C, D) are rejected: "none should show the hints if not requested".
- **Find: footer bar** under the list, on hold: `↑↓ Move · ↵ Open · ⇧↵ Show in tree · esc Close`. Not hints on the selected row. The ⌖ row button tooltip becomes "Show in tree (Shift+Enter)" (always, it is a tooltip).
- **Header:** `n` in Open next, `t` in Triage, on hold. The Find header button no longer exists (#94), so ⌘K has no header surface.
- **Focused row:** `o Details · s Send` on the thread row whose stop has keyboard focus, on hold.
- **Focus slots:** `1`, `2`, `3` next to the Open button of each filled slot, on hold.
- **Look:** shadcn `Kbd`, small (`h-4`/`h-5`, 10–12 px) and muted (`bg-muted`, `text-muted-foreground`). Readable in light and dark in the prototype.
- **Touch:** no hints when `(hover: none), (pointer: coarse)`. Below 720 px the header hints hide with the button labels.
- **Switch:** "Show key hints", on by default. Off turns the hold off too: no key hint shows at all.
- No surface is dropped.
