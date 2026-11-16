---
title: Keep the app alive with a hidden window, and add the app menu
type: wayfinder:task
status: closed
assignee: claude (desktop-08)
blocked-by: [07-electron-shell]
---

## Question

Make the window behave like a macOS utility app: it hides on close, keeps its size and place, and has the standard app menu.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Window".
- Close hides the window; a Dock click shows it. Cmd-Q quits. `backgroundThrottling: false`.
- `window.json` (size and place, dropped when off all screens) in the app data folder. Put the read, merge and default logic in a module with no Electron import, with tests.
- App menu: role menus. "Always on Top" was dropped: the full window covers too much of the screen.
- README "What you get": one entry for the desktop window.

## Done when

`bun run check` passes. In `bun run desktop:demo`: close and Dock click bring the window back with its tree; a quit and a new start restore the size and place.

## Handed over from desktop-07

- `src/desktop/main.ts` quits on `window-all-closed`. Replace that with hide-on-close and keep the app alive.
- `second-instance` already restores, shows and focuses `window`. A Dock click (`activate`) does not show it yet.
- A restarted child does not re-run the ready poll, and the window does not reload. The page reconnects to `/events` by itself.
- The README Run line says "Closing the window quits the app". Change it.
