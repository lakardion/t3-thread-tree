---
title: Save the T3 token from the desktop window
type: wayfinder:task
status: in-review
assignee: claude (desktop-09)
blocked-by: [08-window-lifetime]
---

## Question

Let the user paste the T3 token in the desktop window, so the packaged app needs no `.env`.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Token" and "Preload bridge".
- Main reads `token` (mode `0600`) from the app data folder at start and passes it as `T3_TOKEN`. No file: the env stays as it is.
- Bridge `setToken`: main checks the value (non-empty string, no whitespace inside, at most 4 KB), writes the file `0600`, and restarts the child.
- Page: with `conn: "unauthorized"` and `window.desktopBridge`, the banner shows the issue command, a password field and "Save". In a browser, the banner stays as today. Use shadcn `Input` and `Button`.
- The working folder of the packaged child is the app data folder, so a `.env` there loads.
- README Setup: the desktop token path.

## Done when

`bun run check` passes. With a bad `T3_TOKEN` in dev, the banner shows the field; a good token saves to the file with mode `0600` and the tree loads with no restart of the app. The banner looks right in light and dark mode.

## Handed over from desktop-07

- To restart the child after `setToken`, send it SIGTERM. The `exit` handler in `startServer` (`src/desktop/main.ts`) starts it again after 500 ms on the same port. Pass the token through the env that `startServer` builds.

## Handed over from desktop-10

- On this branch the preload never loads: Bun bakes the source folder into `__dirname`, so `join(__dirname, "preload.cjs")` in `src/desktop/main.ts` points at `src/desktop/preload.cjs`. `window.desktopBridge` is absent and the token field never shows. desktop-10 (#36) fixes it with `join(app.getAppPath(), "dist", "desktop", "preload.cjs")`.
