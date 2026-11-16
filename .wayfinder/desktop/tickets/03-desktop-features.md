---
title: What do the badge, the notifications and the menu-bar entry do?
type: wayfinder:grilling
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

Grill the user on the behavior of the three desktop features. The shell choice (02) does not change these answers, so this ticket can run at the same time.

- **Dock badge:** which count. The header "needs you" count, or needs input only, or needs input plus your turn. Does it clear when the window has focus (T3 does this)?
- **Notifications:** which status changes send one (needs input, plan ready, your turn, failed, PR checks failing). Grouping when many change at once. What a click does: open the thread in T3 Code (`t3code://`), or focus the tree on that row. A mute switch, and Do Not Disturb.
- **Menu-bar entry:** an icon with the count only, a menu with the threads that need you, or a small popover with the tree. Does the app keep running when the last window closes?
- **Window:** remember size and place, always-on-top option, one window or several.
- **Settings:** where the user turns these on and off, and where the app keeps the T3 token instead of `.env`.

Write the answers in a `## Resolution` section, then set `status: closed` and add one line to the map's "Decisions so far".

## Resolution

Grilled with the user on 2026-11-15. All defaults below are the user's choices.

- **Needs you** (the glossary term): threads with status needs input or plan ready. The Dock badge, the header chip, the menu-bar list and the notifications all use this set. The "Needs you" filter keeps its label and also keeps your turn. No filter rename on this map.
- **Dock badge:** the Needs-you count. It always shows. It does not clear on window focus.
- **Notifications:** one notification when a thread enters needs input, plan ready or failed. None for your turn and none for PR checks failing.
  - The first load after app start sets the baseline. It sends no notifications.
  - 1–2 threads change in one refresh: one notification per thread. A new notification for a thread replaces the earlier one for that thread. 3 or more: one summary ("N threads need you").
  - A click on a thread notification opens the thread in T3 Code (`t3code://threads/<env>/<id>`). A click on the summary focuses the tree window.
  - One mute switch. It stops notifications only, not the badge or the menu. macOS Focus covers Do Not Disturb. No per-status or per-project rules.
- **Menu-bar entry:** an icon with the Needs-you count and a native menu. The menu lists up to 10 Needs-you threads, the longest wait first, then a "+N more… (open tree)" item. A click on a thread opens it in T3 Code. The menu also holds the mute switch and always-on-top.
- **App lifetime:** the app keeps running when the last window closes (menu bar and notifications stay on). Cmd-Q quits.
- **Window:** one window. The app remembers its size and place. Always-on-top is a menu item, off by default.
- **Settings:** no settings page. The toggles live in the menu-bar menu and the app menu.
- **T3 token:** kept in the macOS Keychain (Electron `safeStorage`, or the shell's equivalent if ticket 02 chooses Electrobun). The user enters it on the existing "no token" screen. `T3_TOKEN` in the env stays as a fallback for dev.
