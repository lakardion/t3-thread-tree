---
title: Add key hints and the "Show key hints" switch
type: wayfinder:task
status: open
assignee: claude (key-hints-02 session)
blocked-by: [01-key-hints-look]
---

## Question

Build the **Key hints** and the "Show key hints" switch, with the rules of [the key hints look](01-key-hints-look.md).

## Brief

Starts on `main` after the reach-a-thread stack (Find #89 ← row keys #91) merges. Do not start before: the hints name the keys that this stack adds. Add the shadcn `Kbd` component (`bunx shadcn add kbd`) and move the Keys legend in Settings to it. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md`. One draft PR.

## Spec

From [the key hints look](01-key-hints-look.md). Reference code (throwaway, rewrite, do not copy): branch `prototype/key-hints-look`, `src/page/key-hints.prototype.tsx` and the `.key-hint` rules at the end of `src/page/index.css`.

- **Kbd.** `bunx shadcn add kbd`. The generator writes `import { cn } from "cn"` and adds a `cn` package to `package.json`: fix the import to `@/lib/utils` and drop the package. Move the Keys legend in Settings (`KEYS` in `src/page/app.tsx`) to `Kbd`.
- **Hold.** No key hint shows by default. When the user holds Alt/Option alone for 300 ms, all key hints show. They hide on Alt key up, on any other keydown (Option+key types a character on macOS), on pointerdown, and on window blur. A shorter tap shows nothing. Alt with Cmd/Ctrl/Shift does not start the hold. The hold does not change what any key does.
- **Floating.** Every key hint floats over the page: `position: absolute` on a `relative` host, `pointer-events: none`, a small border, popover background and shadow. A hint takes no space, so showing or hiding it never shifts the layout.
- **Surfaces** (all shown only on hold):
  - Find: a bar that floats over the bottom of the result list: `↑↓ Move · ↵ Open · ⇧↵ Show in tree · esc Close`.
  - Header: `n` on the top-right corner of the Open next button, `t` on the Triage button. Hidden below 720 px, like the labels.
  - Focused row: one pill `o Details · s Send` above the right side of the thread row whose `data-stop` has keyboard focus. `s` only when Send is available on that row.
  - Triage card: the existing always-on key caps (`Kbd` in `src/page/triage.tsx`: `space`, `e`, `z`, `f`, `o`, `1`–`n`, `j`) become key hints, on the top-right corner of their control. Nothing in the card shows a key cap without the hold.
  - Focus slots: the slot number (`1`–`3`) on the top-left corner of each filled slot card.
- **Always (not a hint):** the ⌖ button in a Find row gets the tooltip "Show in tree (Shift+Enter)".
- **Look.** `Kbd` small and muted: about `h-4`–`h-5`, 10–12 px text, `bg-muted`, `text-muted-foreground`. Check light and dark.
- **Touch.** No hints, and no hold, under `(hover: none), (pointer: coarse)`.
- **Switch.** "Show key hints" in the View group of Settings, on by default, kept in `localStorage`. Off: the hold does nothing and no key hint shows.
- **Terms.** Add **Key hint** to `CONTEXT.md`. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` ("What you get": hold Alt/Option to see the keys; the switch).

## Done when

- With the switch on, no key hint is visible until Alt/Option is held for 300 ms; then the Find bar (if Find is open), the header caps, the focused-row hints and the slot numbers show; on release they hide.
- A quick Alt tap, an Option+letter typed in a field, and Alt with Cmd/Ctrl/Shift show no hints and do not break typing.
- The Triage card shows no key cap until the hold.
- Showing or hiding the hints moves no other element on the page (no layout shift).
- With the switch off, holding Alt/Option shows nothing.
- The Find ⌖ tooltip reads "Show in tree (Shift+Enter)".
- The Keys legend in Settings uses `Kbd`. No `cn` package in `package.json`.
- No hints on a touch device; no header hints below 720 px.
- Unit test for the hold rule (tap, hold, chord, modifier). `bun run check` passes. Checked in `bun run demo`, light and dark, desktop and phone width.
- One draft PR to `main`, README updated.
