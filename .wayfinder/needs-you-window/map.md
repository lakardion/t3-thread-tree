---
label: wayfinder:map
status: closed
created: 2026-11-18
---

# Map: A small Needs-you window

Resume the decision tickets with `/wayfinder .wayfinder/needs-you-window/map.md`. Resume the route key with `/wayfinder-implement .wayfinder/needs-you-window/map.md`. Run `/wayfinder-implement .wayfinder/needs-you-window/map.md <ticket>` after a PR opens or merges.

## Destination

The desktop app has a small always-on-top window that stays beside the editor. It lists the threads that "Open next" takes (needs input, plan ready, your turn), oldest **Wait** first, each with its Wait, and it has "Open next". M23 is merged to `main` as one draft PR that the user tests and merges.

## Route

Source: markdown tickets in `tickets/`. The two decision tickets run in parallel, with the user. Then the build key runs on autopilot.

### Decisions (with the user)

1. [How does the small window look?](tickets/01-window-look.md) — prototype
2. [How does the small window behave?](tickets/02-window-rules.md) — grilling

### Lane 1 (autopilot)

1. [Add the small window to the desktop app](tickets/03-window-build.md) — after 01-window-look and 02-window-rules

The destination is reached when every route key is done and no map ticket is open.

## Stacks

None yet.

## Notes

- Mode: autopilot, for the build key only. Tickets 01 and 02 run with `/wayfinder` in sessions with the user.
- **Execution lives in this map** (override of plan, don't do): the route key delivers code and a PR. Each decision ticket writes its part of the build ticket's `## Spec` when it closes.
- **The PR stops for the user.** The PR is a draft. The user tests it with `bun run desktop:demo` and the packaged app, then merges it. No auto-merge.
- **Rollback.** M23 merges as one PR, so `git revert` removes it cleanly. No feature toggles.
- **Spec:** each route ticket, then `SPEC.md` › "Desktop app" and "Open next", `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. The build key updates `SPEC.md` and `README.md` (see `CLAUDE.md`).
- **Source:** [the merged review](../improvements/research/03-merged-review.md) › M23, and the "Not yet specified" line of the closed [desktop map](../desktop/map.md). Parent: [Effort I: a small Needs-you window](../improvements-program/tickets/09-effort-i-needs-you-window.md).
- **User profile.** The user runs many T3 Code threads at once and gets overwhelmed. Judge each choice against: less noise, a clear next step, low effort to re-enter a thread.
- **Look at the app:** `bun run desktop:demo` and `bun run demo`, light and dark. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01. `grilling` and `domain-modeling` for 02. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md` (**Wait**, **Needs you**, **Desktop app**).
- **Check every change** with `bun run check`, and every UI change in the demo in light and dark mode.
- Tickets use the `brief-speed` frontmatter (`blocked-by` with file stems, `wayfinder:task` for route keys). Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** a new small window, not a change to the menu-bar menu. The full window and the menu-bar menu stay as they are.
- **Threads:** the same set as "Open next" (needs input, plan ready, your turn, not settled, subthreads in), oldest Wait first. So the top row is the Open next target when the skip memory is empty. This set is wider than **Needs you**; ticket 02 settles the window's name in `CONTEXT.md`.
- **Show and hide:** a toggle item in the menu-bar menu, and an app-menu item with a shortcut. Not restored at restart. No button in the full tree.
- **Empty:** the window stays and shows "Nothing waits". It does not hide itself.
- **Desktop only.** The browser version does not change.
- **Look:** decided with a prototype ticket.
- **Process:** decide with the user, then one autopilot build key. One PR, not a stack.

- [How does the small window look?](tickets/01-window-look.md): a compact one-line list (status icon, project icon, linked key, title, Wait), count and Open next in a top bar, target row marked, 360×360.
- [How does the small window behave?](tickets/02-window-rules.md): named "Up next"; the main page owns the list and skip memory and main forwards it; a row click counts as an Open next; ⌥⌘U global toggle, Window-menu and menu-bar checkbox; floating panel on all Spaces; size and place saved.

## Not yet specified

None.

## Out of scope

- The small window in the browser version (desktop only, by the user).
- Restore the small window at restart (not chosen).
- A button in the full tree that opens the small window (not chosen).
- Changes to the menu-bar menu, the Dock badge or the notifications.
- Writes to T3 (settle, snooze, approve). The window only opens threads.
- Feature toggles.
