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

- `src/desktop/store.ts` `parseSettings` drops unknown keys. Add `muted` to `Settings` and to `parseSettings` (default `false`), with a test in `test/desktop-store.test.ts`.
- `setMenu()` in `src/desktop/main.ts` builds the app menu. Put "Mute Notifications" next to "Always on Top"; copy its `click`, which updates `settings` and calls `save("settings.json", settings)`.
- `showWindow()` in `main.ts` restores, shows and focuses the window. Use it for a summary notification click.
