---
title: What does the Bun app use, and how does T3 Code ship its desktop app?
type: wayfinder:research
status: closed
assignee: claude (desktop-01)
blocked-by: []
---

## Question

Collect the facts that ticket 02 needs to choose a shell and a runtime. No decision here.

1. **Bun inventory.** List each Bun-only API in this repo, the file, and its Node or Electron replacement with a size estimate. Files that use Bun today: `src/server.ts`, `src/server/t3.ts`, `src/server/lineage.ts` (`bun:sqlite`), `src/server/lineage-scan.ts` (Bun `Worker`), `src/server/brief.ts` (subprocesses), `scripts/demo.ts`, all of `test/` (`bun:test`). Also the page build: Bun HTML imports and `bun-plugin-tailwind` from `bunfig.toml`.
2. **T3 Code desktop pattern.** Read `~/repos/t3code/apps/desktop` and describe the parts this app would copy: main process, backend process, window URL, preload bridge, IPC, badge, menu, packaging, dev loop. Note what is T3-only (Clerk, SSH, WSL, preview, snapshot) so the build keys skip it.
3. **Other shells.** For Electrobun and for Electron with a Bun sidecar (`bun build --compile`), state the maturity, the app size, the macOS badge, notification and tray APIs, and the packaging story. Use primary sources.

Write the result to `research/01-port-inventory.md` and link it here.

## Known at charting

Read in `~/repos/t3code` at commit `b054400645`:

- `apps/desktop` is Electron 44 with Effect. The main entry is `src/main.ts`, bundled to CJS by `vite-plus pack` into `dist-electron/` (`boot.cjs`, `main.cjs`, `preload.cjs`).
- The main process spawns the server as a child process: `process.execPath` with `ELECTRON_RUN_AS_NODE=1` and the entry `apps/server/dist/bin.mjs` (`src/backend/DesktopBackendConfiguration.ts`, `src/backend/DesktopBackendManager.ts`). So the server runs on Electron's own Node, not on Bun. The manager restarts the server when it exits.
- The window loads the server's HTTP URL with `loadURL` (`src/window/DesktopWindow.ts`), and shows a "connecting" splash page first. The web app is the same build that a browser loads.
- The preload exposes one `desktopBridge` object through `contextBridge` (`src/preload.ts`). Each IPC method has a channel name and a Schema-checked payload (`src/ipc/`).
- The Dock badge is an IPC method: the page sends a count, main calls `app.setBadgeCount` and clears it when a window has focus (`src/ipc/methods/notificationBadge.ts`).
- Packaging is `electron-builder` (`scripts/build-desktop-artifact.ts` at the repo root, `dist:desktop:dmg`). Updates use `electron-updater`.

## Resolution

Findings: [research/01-port-inventory.md](../research/01-port-inventory.md). The file starts with a summary.

- **Bun inventory:** 19 Bun-only uses. A Node port changes about 150–250 lines, plus a new page build and a main-process bundler. The risks are the dev loop (no HTML import or HMR) and SQLite (`better-sqlite3` rebuilds, or `node:sqlite` as a release candidate).
- **Bun sidecar:** a real compile works (64 MB). It needs a `Bun.build()` script for Tailwind, a string worker path and an embedded `next-step-prompt.md`.
- **T3 Code pattern:** the needed parts are about 250–400 lines of plain Electron. Two corrections to "Known at charting": the window loads a custom `t3code://app/` scheme, not the server URL, and the splash shows only in WSL-only mode. T3 Code has no tray. Notifications come from the page's `new Notification()`.
- **Electrobun:** v2.0.6, one main author, no Dock badge API, no notification click event, no bundler plugins in its build.
- **All options:** an app started from the Dock or Spotlight does not get the shell PATH, so the brief cannot find `claude` or `codex` without a fix.
