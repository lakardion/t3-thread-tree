---
title: Write the desktop spec and cut the build tickets
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [02-shell-and-runtime, 03-desktop-features, 04-build-and-install]
---

## Question

Turn the decisions of 02, 03 and 04 into a spec and a build route. No code.

1. Write a "Desktop app" section in `SPEC.md`. Update `CONTEXT.md` for new terms, and the README sections that change (Requirements, Setup, Run, How it works).
2. Write one route ticket per PR in `tickets/`, numbered from 06, each small enough for one PR. The usual order: runtime port (if 02 chose one), Electron shell with window and server process, page build, badge, notifications, menu-bar entry, packaging. Each ticket states its own check.
3. Put the tickets under "Lane 1 (autopilot)" in the map as one chain, mark forced edges, and move the open questions out of "Not yet specified".

Close this ticket. Dispatch then launches the first build key with `/start-issue-auto`.

## Resolution

Done on 2026-11-16, on branch `desktop-05-spec` (the base PR of the build stack; no push to `main`).

- `SPEC.md` › "Desktop app" holds the spec: shape, shell PATH, window, preload bridge, Needs you, Dock badge, notifications, menu-bar entry, token, build and dev, package and install, release and updates, CI. The scope lines and the token section point to it.
- `CONTEXT.md`: new terms **Needs you**, **Desktop app** and **Browser version**.
- `README.md`: one Status line that says the desktop app is in build. Each build ticket adds its own README part.
- Defaults taken (not grilled, change them in review if wrong):
  - Main code in `src/desktop/`; the packaged server runs in the app data folder, so a `.env` there loads.
  - Ready check: poll `GET /t3/cli` every 100 ms for up to 30 s. A child that ran 60 s resets the backoff.
  - Notifications go through the bridge to Electron `Notification` in main, so the mute switch lives in main with the menus.
  - `window.json` and `settings.json` in the app data folder.
- Route: tickets 06–14, one chain in "Lane 1 (autopilot)".
