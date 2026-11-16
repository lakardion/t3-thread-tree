---
title: Add the menu-bar entry with the Needs-you threads
type: wayfinder:task
status: open
assignee:
blocked-by: [11-notifications]
---

## Question

Add a menu-bar (tray) entry that shows the Needs-you count and lists the threads that need you.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Menu-bar entry".
- A template tray icon (16 and 32 px PNG, black on clear, in the repo). Title: the count, none at 0.
- A pure function from `NeedsYouThread[]` to the menu items (order, cap of 10, "+N more…"), with tests.
- Menu: the threads, "Open tree", "Mute Notifications", "Quit". The checkbox shares its state with the app menu.
- README "What you get": the menu-bar entry.

## Done when

`bun run check` passes. In `bun run desktop:demo` the tray count equals the badge, the menu lists the threads longest wait first, a thread item opens T3 Code, and the toggles match the app menu. The icon reads in a light and a dark menu bar.

## Handed over from desktop-08

- "Open tree" calls `showWindow()` in `src/desktop/main.ts`. It is defined inside the single-instance `else` block; move it to module level if the tray code needs it there.
- "Always on Top" was dropped from the app; do not add it to the menu-bar menu.

## Handed over from desktop-09

- `openExternal` is not on the bridge yet. Add it to `DesktopBridge` in `src/shared/desktop.ts` and to the preload object if the page needs it; main already has `openOutside(url)` with the URL check.

## Handed over from desktop-10

- Main keeps the last list in `let needsYou: NeedsYouThread[]` in `src/desktop/main.ts`, already checked, set in the `setNeedsYou` handler. Read it for the tray and remove its `oxlint-disable-next-line` line. Rebuild the tray menu in that handler, after `app.setBadgeCount`.
- `NeedsYouThread.since` is `null` for some threads; the menu sorts those last.
