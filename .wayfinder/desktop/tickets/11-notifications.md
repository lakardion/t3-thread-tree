---
title: Send a notification when a thread starts to need you
type: wayfinder:task
status: open
assignee:
blocked-by: [10-dock-badge]
---

## Question

Notify the user when a thread enters needs input, plan ready or failed, with a mute switch.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Notifications" and "Preload bridge".
- Page: a pure function `(lastStatuses | null, tree) → { events, nextStatuses }` for trigger, baseline and grouping, with tests (baseline sends nothing, conn not up sends nothing, 2 threads give 2 events, 3 give a summary, a new thread in a trigger status counts).
- Main: check the payload, then show an Electron `Notification` per event unless muted. Keep one notification per thread id and close the earlier one. Click: `t3code://threads/<environmentId>/<threadId>` through `shell.openExternal`, or show the window for the summary.
- "Mute Notifications" in the app menu (checkbox, saved in `settings.json`).
- Demo: `PUSH=1` makes at least one thread enter a trigger status, so the demo shows a notification.
- README "What you get": notifications and the mute switch.

## Done when

`bun run check` passes. In `bun run desktop:demo` with `PUSH=1`: no notification at start, one when a demo thread enters a trigger status, none when muted. A click on a thread notification opens T3 Code (or tries to, with the demo id).

## Handed over from desktop-08

- `settings.json` does not exist yet: "Always on Top" was dropped. Add `parseSettings` (default `{ muted: false }`) to `src/desktop/store.ts`, next to `readJson`, `writeJson` and `parseBounds`, with a test in `test/desktop-store.test.ts`. Write it with `save("settings.json", …)` in `src/desktop/main.ts`.
- `setMenu()` in `main.ts` builds the app menu from role menus only (`{ role: "appMenu" }` …). To add "Mute Notifications", replace `{ role: "appMenu" }` with an explicit app submenu (about, separator, the checkbox, separator, services, hide, hideOthers, unhide, separator, quit).
- `showWindow()` in `main.ts` restores, shows and focuses the window. Use it for a summary notification click.

## Handed over from desktop-09

- Add `notify` to `DesktopBridge` in `src/shared/desktop.ts` and to the preload object (`satisfies DesktopBridge`). Main accepts IPC only from `window?.webContents`, as the `setToken` handler does.
