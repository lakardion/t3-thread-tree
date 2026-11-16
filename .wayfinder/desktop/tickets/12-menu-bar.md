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
- Menu: the threads, "Open tree", "Always on Top", "Mute Notifications", "Quit". The two checkboxes share their state with the app menu.
- README "What you get": the menu-bar entry.

## Done when

`bun run check` passes. In `bun run desktop:demo` the tray count equals the badge, the menu lists the threads longest wait first, a thread item opens T3 Code, and the toggles match the app menu. The icon reads in a light and a dark menu bar.
