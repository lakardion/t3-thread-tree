---
title: One menu for Sort, Layout and Group by on a phone
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [08-key-m18-tab-count]
---

## Question

Build M17 (effort H).

## Spec

See [the merged review](../../improvements/research/03-merged-review.md) › M17 for the problem, the options and the file:line references (at `5bf8567`).

- One draft PR. The user tests it with `bun run demo` and the real app, and merges it.
- `bun run check` passes. Update `README.md` for a visible change (see `CLAUDE.md`).

## Handed over from improvements-program-10

PR #69 adds `useQuietTip()` in `src/page/app.tsx`. `SortMenu` and `FoldOrGroup` use it, so a tooltip around a menu trigger does not open when the menu closes and focus returns to the trigger. The phone menu of this key also wraps a menu trigger in a tooltip, or replaces these menus. When this branch merges with #69, keep the hook on every tooltip that wraps a `DropdownMenuTrigger`: spread `tip` on the `<Tooltip>` and pass `onCloseAutoFocus` to the `<DropdownMenuContent>`.
