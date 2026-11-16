# Research 01: Bun inventory, T3 Code desktop pattern, other shells

Facts for ticket 02 (shell and runtime). No decision here. Collected 2026-11-15.

## Summary

- **Bun inventory:** 19 Bun-only uses. An Electron on Node port changes about 150–250 lines, plus a new page build (Vite) and a bundler for the main process and the worker. Section 3 calls the port effort "High" because each Bun API needs a rewrite. Section 1 counted the lines, and most rows are small. The risks are the dev loop (HTML import and HMR go away) and SQLite (`better-sqlite3` needs a rebuild per Electron version, and `node:sqlite` is still a release candidate).
- **Bun sidecar test:** a real `Bun.build` compile ran on darwin-arm64 (64 MB binary). The page, Tailwind, `bun:sqlite` and SSE work in it. The sidecar needs a build script, not the CLI (Tailwind plugin), plus two small code changes: a string worker path and an embedded `next-step-prompt.md`.
- **T3 Code pattern:** the parts this app needs come to about 250–400 lines of plain Electron, without Effect. Corrections to the ticket's "Known at charting": the window loads a custom `t3code://app/` scheme, not the server URL, and the "connecting" splash shows only in WSL-only mode. T3 Code has no tray, so a menu-bar entry has no model to copy. Notifications use the page's standard `new Notification()`.
- **Electrobun:** v2.0.6, one main author, many open platform bugs. It has no Dock badge API, and its notifications have no click event. Its build tool does not run bundler plugins (Tailwind).
- **All options:** an app that starts from Finder, the Dock or Spotlight does not get the shell PATH, so the brief cannot find `claude` or `codex` without a fix.

## 1. Bun inventory

Scope: all tracked files at `main` (`4380130`). The search covered `Bun.`, `bun:`, `import.meta.*`, HTML imports, `new Worker`, `bunfig.toml`, `package.json`, `tsconfig.json` and CI. Untracked copies under `.claude/worktrees/` are not counted.

The search found no use of `Bun.write`, `Bun.$`, `Bun.Glob`, `import.meta.dir`, `import.meta.main`, or a server-side `websocket` handler in `Bun.serve`. The server uses `Bun.serve` only for HTTP routes and Server-Sent Events (SSE).

Two items were not in the known list:

- `src/server/t3.ts:257` gives `{ headers }` to the global `WebSocket` client. This is a Bun extension.
- `src/server/brief.ts:298` reads `next-step-prompt.md` at run time through `new URL(..., import.meta.url)`.

### Inventory

Size: S = up to about 15 lines changed, M = about 15 to 60, L = more than 60.

| # | File:line | Bun API | What it does here | Node / Electron replacement | Size |
|---|---|---|---|---|---|
| 1 | `src/server.ts:1`, `scripts/demo.ts:2` | HTML import (`import index from "./page/index.html"`) | Bun bundles the page (TSX, CSS) and serves it at `/`. In development it rebuilds on each request. | Vite (or esbuild) builds `src/page/` to static files. The server serves the files, or Electron loads them with `loadFile`/`loadURL`. | M (config about 20 lines, 2 import sites) |
| 2 | `bunfig.toml:1-2` | `[serve.static] plugins = ["bun-plugin-tailwind"]` | Runs Tailwind v4 on `index.css` (`@import "tailwindcss"`) for the HTML import. | `@tailwindcss/vite` (or `@tailwindcss/postcss`) in the Vite config. Delete `bunfig.toml` and the `bun-plugin-tailwind` dependency. | S |
| 3 | `src/page/app.tsx:1080` | `import.meta.hot` (Bun HMR) | Keeps one React root across hot reloads. | Vite supports `import.meta.hot.data` with the same shape. No change if Vite is the page bundler. | S (0 lines) |
| 4 | `src/server.ts:170-201`, `scripts/demo.ts:326-357` | `Bun.serve({ routes })` | Serves `/`, `/events` (SSE through a `ReadableStream` `Response`) and the brief routes. Binds to `127.0.0.1:4773` (demo: `4774`). | `node:http` with a small Request/Response adapter, or a library that takes Web `Request`/`Response` handlers (for example `@hono/node-server` or `srvx`). The SSE stream and `Response.json` stay. | M (about 40 to 60 lines over both files) |
| 5 | `src/server.ts:177`, `scripts/demo.ts:332` | `server.timeout(req, 0)` | Turns off the idle timeout for the SSE stream. | `req.socket.setTimeout(0)`, or `server.requestTimeout = 0` in `node:http`. | S |
| 6 | `src/server.ts:21,202`, `scripts/demo.ts:358` | `server.url` | Prints the URL in the log. | Make the string from `server.address()`. | S |
| 7 | `src/server/brief.ts:384-428` (route object) | `Bun.serve` route shape `{ GET, POST }` | `briefService().routes` gives method maps that `Bun.serve` reads directly. | The adapter in row 4 must dispatch by method, or the routes change shape. Tests in `test/brief.test.ts` call these handlers directly. | S (part of row 4) |
| 8 | `src/server/lineage.ts:2,70-73,79,83,94` | `bun:sqlite` (`Database`, `{ readonly }`, `db.query()`, `.all()`, `.get()`) | Opens T3's `statev2.sqlite` read-only. Three prepared statements: launch tool calls, the sender of a first message, last assistant messages (`json_each`, `json_extract`, `?1` parameters). | `node:sqlite` (`Database`/`DatabaseSync`, `{ readOnly: true }`, `prepare().all()/.get()`). No flag since Node 22.13; status "1.2 Release candidate". Or `better-sqlite3`: a native module, it must be rebuilt for Electron's ABI with `@electron/rebuild` after each install and each Electron upgrade. Check that the `?1` numbered parameter binds the same way in the chosen library. | S (about 6 lines) |
| 9 | `src/server.ts:40`, `src/server/lineage-scan.ts:4,7` | Web `Worker` on a `.ts` file, `self.postMessage` | Runs the full lineage scan off the main thread. | `node:worker_threads` `Worker` plus `parentPort.postMessage`, or an Electron `utilityProcess`. The bundler must emit the worker as its own entry file. | S (about 10 lines) |
| 10 | `src/server/brief.ts:20` | `Bun.spawn(...).exited` | Runs `claude auth status` / `codex login status` to find logged-in CLIs. | `node:child_process` `spawn` plus a `once("exit")` promise, or `execFile`. | S (about 8 lines) |
| 11 | `src/server/brief.ts:326,331-346,370` | `Bun.spawn` with `stdin: Buffer`, `stdout/stderr: "pipe"`, `proc.kill`, `proc.exited`, `new Response(proc.stdout).text()` | Runs one CLI with the prompt on stdin, reads stdout and stderr, kills it on time-out or cancel. | `child_process.spawn`, write and end `stdin`, collect `stdout`/`stderr` chunks, wait for `close`. | S to M (about 20 lines) |
| 12 | `src/server/brief.ts:298,328` | `Bun.file(URL).text()` with `import.meta.url` | Reads `next-step-prompt.md` next to the source file. | `fs.promises.readFile(GUIDE, "utf8")`. A bundler must copy the `.md` file, or the code must import it as text. | S |
| 13 | `src/server/t3.ts:221,225` | `Bun.file(path).text()`, `.json()` | Reads `~/.t3/userdata/environment-id` and `server-runtime.json`. | `fs.promises.readFile` plus `JSON.parse`. | S (about 4 lines) |
| 14 | `src/server/t3.ts:257` | `new WebSocket(url, { headers })` (Bun extension) | Sends `Authorization: Bearer` on the T3 WebSocket handshake. | Node's global `WebSocket` is undici. undici documents `WebSocketInit.headers` as "an undici-specific extension". Node 22 accepts the call as written. Electron's main process: verify that the global exists, else import `WebSocket` from `undici`. | S (0 to 3 lines) |
| 15 | `test/*.test.ts:1` (7 files) | `bun:test` (`describe`, `expect`, `test`) | Unit tests. No `mock`, `spyOn` or snapshot use. | `vitest` (same names, change the import), or `node:test` plus `node:assert` (larger rewrite of `expect`). | S with vitest (7 lines) |
| 16 | `test/brief.test.ts:332,374` | `Bun.sleep(0)` | Flushes pending promises. | `await new Promise((r) => setTimeout(r, 0))` or `node:timers/promises`. | S (2 lines) |
| 17 | `scripts/demo.ts:334` | `Bun.sleep(ms)` | Adds a `DELAY` before the demo SSE stream. | `node:timers/promises` `setTimeout`. | S |
| 18 | `package.json` scripts | `bun run`, `bun test` | `start`, `demo`, `check` run on Bun. | `node`/`electron` start scripts, `vitest`. A bundle step is needed because the source imports `.ts` paths (`allowImportingTsExtensions`). | S |
| 19 | `package.json` deps, `tsconfig.json:7`, `bun.lock`, `.github/workflows/ci.yml` | `@types/bun`, `"types": ["bun"]`, `oven-sh/setup-bun@v2` (Bun 1.3.14) | Types and CI for Bun. | `@types/node`, `actions/setup-node`, a Node lockfile. | S |

### Total

Rough total for a port to Electron on Node: about 150 to 250 lines changed, plus new build configuration (Vite for the page, a bundler for the main process and the worker). The server logic itself (`build-tree.ts`, the T3 decoder, the brief rules) uses no Bun API.

Riskiest items:

1. **Rows 1, 2, 4: page build and HTTP server.** This replaces Bun's built-in bundler, HMR and router with Vite plus a Node HTTP layer. It changes the development workflow, not only code.
2. **Row 8: SQLite.** `better-sqlite3` needs a native rebuild for each Electron version. `node:sqlite` needs no rebuild, but it is not stable yet, and its availability in Electron's bundled Node was not verified here.
3. **Rows 10, 11: subprocesses in a GUI app.** The brief runs `claude` and `codex` from `PATH`. A macOS app started from Finder or the Dock does not get the shell `PATH`. This applies to all three desktop options.
4. **Row 9: Worker packaging.** The worker file must be a separate output in every option (see the sidecar test below).

### Bun-sidecar approach (`bun build --compile`)

A sidecar keeps all rows 1 to 17 as they are. Only the build changes. Test run in the scratchpad on Bun 1.3.14 (no repo change):

- **HTML import: works.** Bun bundles the page into the binary. The binary served `/`, the hashed JS and CSS chunks, `/brief/clis` and `/events` from another working folder. Source: `bun-types/docs/bundler/executables.mdx`, "Full-stack executables".
- **Tailwind plugin: works only through the JS API.** The docs say `[serve.static]` plugins "work in `Bun.build()`'s JS API, but not yet in the CLI" (`bundler/fullstack.mdx`). A `Bun.build({ compile, plugins: [tailwind] })` script produced CSS with `tailwindcss v4.1.14` and the theme classes. So the sidecar needs a small `build.ts`, not a plain `bun build --compile` command.
- **`bun:sqlite`: works.** The docs say "You can use `bun:sqlite` imports with `bun build --compile`". No native rebuild is needed. The binary opened `statev2.sqlite` at start.
- **Worker: needs a change.** The worker file must be an extra entry point (docs, "Worker" section). Test result: with the worker in a subfolder, the current form `new Worker(new URL("./server/lineage-scan.ts", import.meta.url))` fails in the binary with `ModuleNotFound resolving "/$bunfs/root/server/w.ts"`. The string form `new Worker("./server/w.ts")` works in the binary. The docs say a string specifier resolves "relative to the project root", so the dev path then also changes. Size S.
- **Prompt file: needs a change.** `next-step-prompt.md` is not in the binary (the embedded file list holds only the HTML, JS, CSS chunks and `lineage-scan.js`). The brief CLI run would fail. Fix: `import guide from "./next-step-prompt.md" with { type: "file" }` (docs, "Embed assets & files"). Size S.
- **Other facts:** the binary for darwin-arm64 is 64 MB. Bun loads `.env` and `bunfig.toml` from the working folder at run time by default (`--no-compile-autoload-bunfig` turns this off). Each target OS and CPU needs its own `--target` build.

Electrobun runs Bun in its main process, so the server rows keep their Bun APIs. Whether Electrobun's view build accepts the HTML import plus the Tailwind plugin was not checked here.

Sources: repo files at `main`; Bun docs shipped in `node_modules/bun-types/docs/` (`bundler/executables.mdx`, `bundler/fullstack.mdx`, `runtime/workers.mdx`); Node `sqlite` API page (nodejs.org/api/sqlite.html); undici `WebSocket` API doc (github.com/nodejs/undici, `docs/docs/api/WebSocket.md`); Electron "Using Native Node Modules" (electronjs.org).

## 2. T3 Code desktop pattern

Source: `/Users/lakardion/repos/t3code`, commit `b054400645f921db8843b8d4fc4ff787f7b1bfa7`. All paths below are relative to that repo root unless they start with `/`. LOC counts are `wc -l` of the non-test source files.

The desktop app is large: about 84,700 lines in `apps/desktop` (source, tests and scripts). Most of that size is T3-only (preview browser, snapshot capture, WSL, SSH, Clerk, updates). The parts that this app needs are small.

### 2.1 Corrections to the "already known" list

Two facts in the brief are not exact. Read these first.

- **The window does not load the server HTTP URL.** It loads a custom privileged scheme, `t3code://app/` (`t3code-dev://app/` in dev). `apps/desktop/src/electron/ElectronProtocol.ts` (295 LOC) registers it with `protocol.registerSchemesAsPrivileged` (`standard`, `secure`) and `protocol.handle`. In production the handler serves static files from `apps/server/dist/client` on disk, with an SPA fallback to `index.html` (`serveDesktopAsset`). In dev it proxies each request with `net.fetch` to `VITE_DEV_SERVER_URL` (`proxyRequest`). The web app then talks to the backend over HTTP/WS at `http://127.0.0.1:<port>`. It gets that address from the preload (`getLocalEnvironmentBootstraps`). The caller is `apps/desktop/src/app/DesktopApp.ts` lines 172-178. The URL builder is `getDesktopUrl` in `ElectronProtocol.ts`, used in `apps/desktop/src/window/DesktopWindow.ts` line 362.
- **The "connecting" splash shows only in WSL-only mode.** `DesktopApp.ts` line 243 calls `showConnectingSplash` only when `settings.wslOnly && settings.wslBackendEnabled`. Its text is hard-coded "Connecting to WSL…" (`DesktopWindow.ts` `buildConnectingSplashDataUrl`, line 178). In the normal path there is no splash. The main window is created with `show: false` and is shown on `ready-to-show`, after the backend reports ready (`handleBackendReady` → `createMainIfBackendReady`, `DesktopWindow.ts` line 1023).

The rest of the brief is correct: Electron `44.10.1`, Effect, `vite-plus pack` to CJS in `dist-electron/`, child server via `process.execPath` + `ELECTRON_RUN_AS_NODE=1`, Schema-checked IPC, `app.setBadgeCount`, electron-builder, electron-updater.

### 2.2 Main process

- Entry: `apps/desktop/src/boot.ts` (2 LOC) does `require("./compileCache.cjs"); require("./main.cjs")`. `package.json` `main` is `dist-electron/boot.cjs`.
- `apps/desktop/src/main.ts` (253 LOC) only builds the Effect `Layer` graph and runs `DesktopApp.program`. About 75 imports. Most layers are T3-only.
- Startup sequence: `apps/desktop/src/app/DesktopApp.ts` (367 LOC). Order: register protocol → install IPC handlers → pick port → start backend → create main window when ready → start app activation socket.
- Lifecycle: `apps/desktop/src/app/DesktopLifecycle.ts` (314 LOC). `activate` reopens the window. `window-all-closed` quits on all platforms except macOS. SIGINT/SIGTERM quit cleanly. `before-quit` runs a quit hold (`apps/desktop/src/window/QuitHold.ts`, 196 LOC).
- Single-instance lock: `app.requestSingleInstanceLock()` is called from `apps/desktop/src/app/DesktopClerk.ts` line 115. It is in the Clerk file, but the lock itself is generic and this app needs it.
- Thin Electron wrappers as Effect services: `apps/desktop/src/electron/ElectronApp.ts` (253), `ElectronWindow.ts` (398), `ElectronMenu.ts` (282), `ElectronShell.ts` (91), `ElectronTheme.ts` (98). Each one wraps a few Electron calls for tests. `ElectronApp.ts` line 220 calls `app.dock?.setIcon(iconPath)` in dev.
- Bundling: `apps/desktop/vite.config.ts` (154 LOC). One `pack` entry per output: `main.ts`, `boot.ts`, `preload.ts`, workers and extra preloads. `electron` and native packages stay external (`scripts/lib/desktop-external-packages.ts`, 23 LOC). Everything else is bundled into `main.cjs`. Sandboxed preloads must be self-contained, so `preload.cjs` is its own bundle.

Rewrite without Effect: yes. The generic part (single-instance lock, `whenReady`, `activate`, `window-all-closed`, signals) is about 40-60 lines of plain Electron.

### 2.3 Backend process

Files: `apps/desktop/src/backend/DesktopBackendConfiguration.ts` (854 LOC), `DesktopBackendManager.ts` (1,168 LOC), `DesktopBackendPool.ts` (350 LOC).

- **Port choice.** `DesktopApp.ts` lines 41 and 80-112. If a port is configured (`T3CODE_PORT`), use it. Otherwise scan up from `3773` and take the first port that can listen on every probe host. Dev mode requires an explicit port (`DesktopDevelopmentBackendPortRequiredError`). Bind host is `127.0.0.1` (`DesktopServerExposure.ts` line 33) unless LAN/Tailscale exposure is on.
- **Spawn.** `DesktopBackendConfiguration.ts` lines 521-545. `executablePath: process.execPath`, args `[<entry>, "--bootstrap-fd", "3"]`, env `ELECTRON_RUN_AS_NODE=1`. The entry is `apps/server/dist/bin.mjs` (`apps/desktop/src/app/DesktopEnvironment.ts` line 210). `cwd` is the home directory when packaged, the repo root in dev. Config (port, host, mode, tokens) goes to the child as one JSON line on fd 3. Extra fds 4-7 carry telemetry and preview-browser control (T3-only).
- **Health check.** `DesktopBackendManager.ts` lines 39-45 and 324-340. Poll `GET <httpBaseUrl>/.well-known/t3/environment` every 100 ms, 1 s per probe, up to 3 min total.
- **Restart.** `DesktopBackendManager.ts` lines 35-36 and 297-298. Restart on exit with backoff `500 ms × 2^attempt`, capped at 10 s. Graceful stop sends a terminate signal, then waits 5 s. When the backend becomes ready, the window gets `handleBackendReady`. When it stops, `handleBackendNotReady`.

Important for this app: `ELECTRON_RUN_AS_NODE` runs the child on Electron's embedded **Node**, not Bun. The t3-thread-tree server uses Bun-only APIs: `Bun.serve` (`src/server.ts` line 170), `bun:sqlite` (`src/server/lineage.ts` line 2), `Bun.file` (`src/server/t3.ts`), `Bun.spawn` (`src/server/brief.ts`). So the T3 spawn recipe does not run this server as-is. The server must either be ported to Node APIs, or the app must ship and spawn a `bun` binary (or a `bun build --compile` executable) instead of `process.execPath`.

Rewrite without Effect: yes. Spawn + poll + backoff restart is about 60-100 lines of plain `child_process`. The 2,400 Effect lines cover fd plumbing, WSL, a pool of backends, output capture and telemetry.

### 2.4 Window and splash

File: `apps/desktop/src/window/DesktopWindow.ts` (1,075 LOC).

- `BrowserWindow` options (lines 394-407): `show: false`, `webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true }`.
- macOS title bar (lines 238-246): `titleBarStyle: "hiddenInset"` and a custom `trafficLightPosition`. The web UI must then leave room for the traffic lights and mark a drag region.
- Load: `window.loadURL(applicationUrl)` (line 727), where `applicationUrl` is `t3code://app/`. In dev it retries load errors.
- Reveal: shown on `ready-to-show` or `did-finish-load` (line 830).
- Window bounds are saved and restored through app settings.
- Splash (WSL-only, see 2.1): a second `BrowserWindow` that loads a `data:text/html` spinner page with a strict CSP (lines 178-185, 940-960). It closes when the main window is ready.

Rewrite without Effect: yes. One window, `loadURL` of the local server URL, `show` on `ready-to-show`, and an optional spinner page is about 40-60 lines. If this app loads `http://127.0.0.1:<port>` directly, it does not need the custom scheme at all. The custom scheme exists so the renderer origin stays fixed while the backend port changes.

### 2.5 Preload bridge

File: `apps/desktop/src/preload.ts` (437 LOC). It calls `contextBridge.exposeInMainWorld("desktopBridge", { ... })` (line 75). Each method is a one-line `ipcRenderer.invoke(channel, payload)` or `ipcRenderer.sendSync`. Event methods return an unsubscribe function. The bridge type is `DesktopBridge` in `packages/contracts/src/ipc.ts` line 1025.

Members that this app would copy:

- `setNotificationBadge({ count, image })` → invoke `desktop:set-notification-badge` (lines 87-88).
- `onNotificationBadgeClear(listener)` → listens on the same channel (lines 89-93).
- `revealWindow()` → invoke `desktop:reveal-window` (line 104).

Rewrite without Effect: the preload has no Effect. The needed part is about 15 lines.

### 2.6 IPC

- Channel names: `apps/desktop/src/ipc/channels.ts` (126 LOC), plain string constants like `desktop:set-notification-badge`.
- Typed handler helper: `apps/desktop/src/ipc/DesktopIpc.ts` (274 LOC). `makeIpcMethod({ channel, payload: Schema, result: Schema, handler })` decodes the payload with Effect Schema before the handler runs, and encodes the result.
- Registration: `apps/desktop/src/ipc/DesktopIpcHandlers.ts` (170 LOC) installs all methods.
- Reveal handler: `apps/desktop/src/ipc/methods/window.ts` lines 418-434. It reveals the main window only if the sender is the main window's `webContents`.

Rewrite without Effect: yes. For 2-3 channels, `ipcMain.handle(channel, (event, raw) => { validate; act })` with a manual type check is about 20-30 lines.

### 2.7 Dock badge

Main side: `apps/desktop/src/ipc/methods/notificationBadge.ts` (71 LOC).

- Payload: `{ count: int 0..2^31-1, image: PNG data URL or null }`. `image` is for the Windows overlay icon only.
- macOS and Linux: `app.setBadgeCount(count)`. Windows: `win.setOverlayIcon`.
- If any window has focus, the count is forced to 0.
- On `browser-window-focus` and `before-quit`, the main process clears the badge and sends `desktop:set-notification-badge` to every window. The renderer then clears its pending set.

Renderer side: `apps/web/src/threadNotifications.ts` `setNotificationBadge(count)` (line 41) draws the Windows overlay image on a canvas, then calls `desktopBridge.setNotificationBadge`. `apps/web/src/components/ThreadNotificationCoordinator.tsx` (419 LOC) owns the count. It keeps a `pending` set of notified threads and calls `setNotificationBadge(pending.size)`. It clears on window `focus` and on `onNotificationBadgeClear` (lines 370-375).

Rewrite without Effect: yes. On macOS only, the main side is about 10 lines (`app.setBadgeCount` + clear on focus).

### 2.8 Native notifications

There is **no** main-process notification code in `apps/desktop`. No `Electron.Notification` and no `Tray` appear in `apps/desktop/src`.

- Notifications come from the renderer through the standard Web `Notification` API. Electron maps it to native macOS notifications. Code: `apps/web/src/components/ThreadNotificationCoordinator.tsx` lines 189-216.
- Conditions to show: the desktop mode setting is on, the document is not visible-and-focused, and `Notification.permission === "granted"`.
- Options: `body: thread.title`, `tag` per thread (a new one replaces the old one), `silent: true` (the app plays its own sound), `requireInteraction` only for completions on Windows.
- Click handling: `notification.close()`, `window.focus()`, `desktopBridge.revealWindow()`, then route to `/$environmentId/$threadId`.
- Permission request: `apps/web/src/components/settings/NotificationSettings.tsx` line 50 calls `Notification.requestPermission()` from the settings UI.
- The main window session sets no `setPermissionRequestHandler`. Only the preview browser session sets one (`apps/desktop/src/preview/BrowserSession.ts` lines 319-340). So the main window uses Electron's default, which grants the notification permission.

Rewrite without Effect: nothing to write in the main process. The page's existing web code can call `new Notification(...)`. The app adds only `revealWindow` for the click.

### 2.9 Menu bar (tray) and app menu

- **Tray: none.** T3 Code has no `Tray` and no menu-bar extra. A tray for this app is new work with no T3 model to copy.
- No `app.dock.setMenu` and no `app.dock.bounce`.
- App menu: `apps/desktop/src/window/DesktopApplicationMenu.ts` (325 LOC). It is built with `Menu.buildFromTemplate` through `ElectronMenu.ts`. The macOS app menu has About, Check for Updates, Settings (`Cmd+,`), Services, Hide, Hide Others, Show All, Quit. The other menus are File, Edit (with a custom Paste as Text), View (Reload, Force Reload, DevTools, zoom items, full screen) and Window. Custom items send `desktop:menu-action` to the renderer.
- About panel: `apps/desktop/src/app/DesktopAppIdentity.ts` line 98, `app.setAboutPanelOptions`.

Rewrite without Effect: yes. A role-based template (appMenu, editMenu, viewMenu, windowMenu) is about 15-30 lines.

### 2.10 Packaging

Driver: `scripts/build-desktop-artifact.ts` (4,196 LOC). Command `dist:desktop:dmg` = `node scripts/build-desktop-artifact.ts --platform mac --target dmg` (root `package.json` line 47). There is no static `electron-builder.yml`. The script writes the config into a staged `package.json` under the `build` key (`createBuildConfig`, lines 2757-2900).

Steps:

1. Build: desktop `dist-electron`, server `apps/server/dist` (which includes the web client at `apps/server/dist/client`).
2. Stage into a temp `app/` dir (line 3646). Copy `apps/desktop/dist-electron` and `apps/server/dist` there (lines 3737, 3757).
3. Write the staged `package.json` (lines 3856-3891): `main: "apps/desktop/dist-electron/boot.cjs"`, `dependencies` = the server's production dependencies plus the desktop native externals, `devDependencies: { electron }`, and `build`.
4. Install production `node_modules` in the stage with `vp install --prod` (lines 975, 3912-3920). The server bundle and its runtime dependencies go into the same `app.asar`. Windows uses a separate `server.asar` sidecar (T3/Windows-only).
5. Run `electron-builder --projectDir <stage> --mac --<arch> --publish never` (lines 4009-4031).

electron-builder config (mac):

- `appId: "com.t3tools.t3code"` (line 65). `productName` depends on the version channel.
- `directories.buildResources: "apps/desktop/resources"`. `files` is a list of exclusion globs (drop other-platform prebuilds and SDK binaries).
- `asar`: default (on) for mac. Only Windows sets `smartUnpack: false` and `asarUnpack`.
- `afterPack: scripts/prepare-server-compile-cache.cjs` (68 LOC). It warms the Node compile cache for the server.
- `mac.target: ["dmg", "zip"]`. The zip is for electron-updater. `mac.icon: "icon.icns"`. `mac.category: "public.app-category.developer-tools"`.
- `mac.extendInfo`: usage strings (local network, screen capture, camera, mic) and a web-page document type. Most are T3-only.
- `mac.protocols`: `t3code`, `t3code-dev`, and `http`/`https` (T3 wants to be a default browser).
- `mac.sign: scripts/sign-macos.ts` when signed. It is 5 LOC that call `@electron/osx-sign` with `batchCodesignCalls: true`. `entitlements` and `provisioningProfile` are set only for passkeys (T3-only).
- `dmg`: background `dmg/dmg-background-<channel>.png`, 640×432 window, app icon and an `/Applications` link.
- `publish`: a GitHub provider for electron-updater, or `null`.

Icons: generated at build time from `assets/prod/black-macos-1024.png` (`scripts/lib/brand-assets.ts` line 8). The script runs `sips` for each size and `iconutil -c icns` (`stageMacIcons` and `generateMacIconSet`, about lines 2460-2515). There is no checked-in `.icns`.

Signing and notarization env:

- `T3CODE_DESKTOP_SIGNED=1` turns signing on (line 1641). When it is off, the script sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and deletes the signing vars (lines 3979-3986).
- Certificate: `CSC_LINK` (base64 `.p12`) and `CSC_KEY_PASSWORD`.
- Notarization: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. electron-builder reads them by itself. See `.github/workflows/release-desktop.yml`.
- `T3CODE_APPLE_TEAM_ID` is needed only for passkey entitlements (T3-only).
- Empty env values are deleted before the build, because electron-builder treats an empty var as set (lines 3956-3963).

Updates: `apps/desktop/src/electron/ElectronUpdater.ts` (186 LOC) wraps electron-updater. `apps/desktop/src/updates/` holds about 2,700 more lines (channels, state machine, remote updates, release notes).

Rewrite without Effect: yes. For one unsigned or signed mac DMG, a static `electron-builder.yml` (about 20-30 lines), a checked-in `icon.icns`, and a 2-3 line build script replace the 4,196-line driver. Auto-update is optional and can come later.

### 2.11 Dev loop

- Root: `dev:desktop` → `node scripts/dev-runner.ts dev:desktop` (root `package.json` line 13). `scripts/dev-runner.ts` (1,000 LOC) picks ports and sets `T3CODE_PORT` and `VITE_DEV_SERVER_URL`. Then it runs `vp run --filter=@t3tools/desktop --filter=@t3tools/web dev` (line 77). So the Vite web dev server and the desktop `dev` task run in parallel.
- Desktop `dev` task (`apps/desktop/vite.config.ts`): `T3CODE_DESKTOP_DEV=1 vp pack --watch`. It depends on `t3#build`, so the server is built once first. After each pack, `onSuccess` runs `scripts/dev-electron.mjs`.
- `apps/desktop/scripts/dev-electron.mjs` (273 LOC):
  - It waits until the built files exist (`dist-electron/main.cjs`, `preload.cjs`, `../server/dist/bin.mjs`) and the Vite TCP port is open (`scripts/wait-for-resources.mjs`, 119 LOC).
  - It spawns Electron with `ELECTRON_RUN_AS_NODE` removed.
  - It watches `main.cjs`, `preload.cjs` and `server/dist/bin.mjs` with `fs.watch`. On a change it kills the Electron process tree and starts it again (120 ms debounce).
- Electron itself still spawns the server as a child in dev, from `apps/server/dist/bin.mjs`. The renderer reaches Vite through the `t3code-dev://` proxy, so Vite HMR works.
- `apps/desktop/scripts/electron-launcher.mjs` (474 LOC) and `ensure-electron-runtime.mjs` (216 LOC) copy Electron.app into `.electron-runtime/` and patch its `Info.plist` (name "T3 Code (Dev)", dev bundle id, dev icon, URL schemes). This gives the right Dock name and icon in dev. It is optional polish.

Rewrite without Effect: the dev scripts have no Effect. For this app, a plain `electron .` plus `bun --watch src/server.ts` (or Electron spawning the server) is enough. The dev `.app` rename is optional.

### 2.12 Size summary

| Part | T3 files | T3 LOC (non-test) | Needed core | Effect needed? |
|---|---|---|---|---|
| Main process and lifecycle | `main.ts`, `boot.ts`, `app/DesktopApp.ts`, `app/DesktopLifecycle.ts`, `electron/*` | ~2,500 | ~40-60 | No |
| Backend spawn, health, restart | `backend/DesktopBackend*.ts` | ~2,400 | ~60-100 | No |
| Port choice | `app/DesktopApp.ts` 80-112 | ~35 | ~15 (or fixed 4773) | No |
| Window, splash | `window/DesktopWindow.ts`, `electron/ElectronProtocol.ts` | ~1,370 | ~40-60 | No |
| Preload bridge | `preload.ts` | 437 | ~15 | No (none used) |
| IPC | `ipc/DesktopIpc.ts`, `channels.ts`, `DesktopIpcHandlers.ts` | ~570 | ~20-30 | No |
| Dock badge | `ipc/methods/notificationBadge.ts` | 71 | ~10 | No |
| Notifications | in `apps/web` (Web API) | ~420 (web) | 0 main-side | No |
| Tray | none | 0 | new work | No |
| App menu | `window/DesktopApplicationMenu.ts` | 325 | ~15-30 | No |
| Packaging | `scripts/build-desktop-artifact.ts`, `sign-macos.ts` | ~4,200 | ~30 config | No |
| Dev loop | `scripts/dev-runner.ts`, `apps/desktop/scripts/*` | ~1,900 | ~10 | No |
| Updates | `electron/ElectronUpdater.ts`, `updates/*` | ~2,900 | optional | No |

Every part that this app needs is small enough to write in plain Electron without Effect. All parts together come to about 250-400 lines plus a builder config.

### 2.13 T3-only parts (build tickets skip these)

- **Clerk auth**: `app/DesktopClerk.ts`, `app/ClerkTokenStore.ts`, `@clerk/electron`, `@clerk/electron-passkeys`, Clerk host in the CSP, `T3CODE_CLERK_PUBLISHABLE_KEY` define. Copy only the single-instance lock call.
- **SSH remote environments**: `ssh/*`, `ipc/methods/sshEnvironment.ts`, `@t3tools/ssh`.
- **WSL**: `wsl/*`, `ipc/methods/wsl.ts`, the WSL splash, `server.asar` sidecar and WSL runtime resources.
- **Preview browser**: `preview/*` (about 9,000 LOC, including `Manager.ts` with 3,702), `preview-pick-preload.ts`, `preview-pip-preload.ts`, `ipc/methods/preview.ts`, `playwright-core`, `react-grab`, CDP relay, cookie import (Chromium, Firefox, Safari), passkeys, `electron-webauthn`, the fds 6-7 browser channel.
- **Snapshot / screen capture**: `snapShot/*` (about 7,000 LOC), `ipc/methods/snapShot.ts`, the global shortcut and accessibility workers, `@crowecawcaw/xa11y`, `ffi-rs`.
- **GNOME extension**: `apps/desktop/gnome-extension/`, `snapShot/GnomeCaptureSetup.ts`, `gnomeCaptureBundle.ts`.
- **Linux and Windows specifics**: `DesktopLinuxUrlHandler.ts`, `LinuxColorScheme.ts`, `linuxSecretStorage.ts`, `dbus-next`, `WindowsForeground*.ts`, NSIS `installer.nsh`, AppImage/deb config, Azure Trusted Signing.
- **macOS permissions helper**: `permissions/*`, `mac-permission-preload.ts`, and the camera, mic, screen-capture and local-network usage strings.
- **Server exposure / Tailscale / LAN**: `backend/DesktopServerExposure.ts`, `tailscaleEndpointProvider.ts`, `DesktopNetworkInterfaces.ts`, `ipc/methods/serverExposure.ts`, `@t3tools/tailscale`.
- **Backend pool and local auth**: `backend/DesktopBackendPool.ts`, `DesktopLocalEnvironmentAuth.ts`, the bootstrap token and secret on fd 3.
- **Telemetry and observability**: `telemetry/*`, `app/DesktopObservability.ts`, OTLP env vars, fds 4-5.
- **CLI shim and app activation socket**: `app/DesktopCliCommand.ts`, `DesktopCliShim.ts`, `DesktopAppActivation*.ts`, `ipc/methods/cliCommand.ts`, `appActivation.ts`.
- **Default-browser role**: the `http`/`https` protocols, the web-page document type, `DesktopWebLinks.ts`.
- **Shell environment discovery**: `shell/DesktopShellEnvironment.ts` (677 LOC). It loads the login shell `PATH` for agent subprocesses. Note: a GUI-launched app on macOS does not inherit the shell `PATH`. If this app's server runs `t3` or other CLIs (`src/server/brief.ts` uses `Bun.spawn`), it may need a small version of this.
- **Settings, connection catalog, legacy localStorage merge, keyring**: `settings/*`, `DesktopConnectionCatalogStore.ts`, `DesktopLegacyLocalStorage.ts`, `chromiumLocalStorage.ts`, `@napi-rs/keyring`, `electron-store`.
- **Provider auth and Codex callback**: `ipc/methods/providerAuth.ts`, `app/CodexAuthCallback.ts`.
- **Update channels, remote updates, release notes, managed policy**: `updates/*` beyond a plain `autoUpdater.checkForUpdatesAndNotify()`, `DesktopManagedPolicy.ts`.
- **Cursor SDK and resource-monitor extra resources**, the Rust and `fff` native build checks, and the browser-secret and annotation-CSS prebuild scripts.
- **Dev launcher `.app` rename**: `electron-launcher.mjs`, `ensure-electron-runtime.mjs`. Optional, not T3-only in purpose, but not needed for a first build.

## 3. Other shells

This section compares two shells for the macOS desktop app: Electrobun, and Electron with a Bun sidecar. All data is from 2026-11-15. Each claim has a source. Text marked "Inference" is not stated in a source.

### 3.1 Electrobun

#### Maturity

- The repository has 13,066 stars, 167 open issues and pull requests, and an MIT license. It started on 2024-02-28. Source: GitHub API, https://github.com/blackboardsh/electrobun
- The latest stable release is v2.0.6 (2026-11-04). Stable releases in the last two months: v2.0.4 (2026-10-18), v2.0.5 (2026-10-26), v2.0.6 (2026-11-04). Beta releases come out almost every day (v2.0.7-beta.24 on 2026-11-15). Source: https://github.com/blackboardsh/electrobun/releases
- v2.0.1 (2026-08-22) was the first 2.x stable release. The 1.x line went from v1.12.1 (2026-02-08) to v1.18.1 (2026-05-04). Source: https://github.com/blackboardsh/electrobun/releases
- One person writes almost all the code: YoavCodes has 2,746 commits. The next contributor has 24. Source: https://api.github.com/repos/blackboardsh/electrobun/contributors
- 2.x adds a new build CLI ("Hutch") and an experimental runtime ("Cottontail"). Bun is the default main-process runtime again. The pinned Bun is 1.4.4, which is also the latest Bun release (2026-10-22). Sources: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/compatability.mdx, https://github.com/oven-sh/bun/releases
- The website says JetBrains, elizaOS, Context Labs and the DeerFlow team use it. The README lists about 50 apps, most of them small open-source tools. Sources: https://electrobun.dev/electrobun/, https://github.com/blackboardsh/electrobun#apps-built-with-electrobun
- Open issue themes (sorted by comments):
  - Linux: GLIBC version (#240), no native Wayland (#568), helper crash on exit (#537).
  - Windows: tray ignores PNG images, window icon not set (#565), tray IDs overflow (#610), separate taskbar entry (#514).
  - macOS: the release app rewrites itself on first launch (#359), the ARM build does not work on macOS 14 (#434), a global shortcut needs Accessibility permission (#334).
  - Updater: the 2.0.6 update helper hangs at 100% CPU (#605).
  - Missing features: notification click callbacks (#384), single-instance lock (#465), native drag and drop (#63), detection of dev vs packaged mode (#432), autostart (#222).
  - Source: https://github.com/blackboardsh/electrobun/issues

#### App size

- The website says a hello-world app is "about a megabyte" and updates start "from 4 KB" as binary diffs. Source: https://electrobun.dev/electrobun/
- The Bun runtime adds much more. The 2.0 release notes give the extracted Bun executable as 63,072,928 B on macOS ARM64 (Bun 1.3.13). Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/changelog/v2-x.mdx
- One app author reports a Windows x64 installer of 63.02 MiB with Electrobun 2.0.5 and Bun 1.4.4. Source: https://github.com/blackboardsh/electrobun/issues/599
- The system webview (WKWebView on macOS) is the default renderer. A bundled Chromium (CEF) is optional (`bundleCEF`). The CEF archive for darwin-arm64 is about 148 MB. Sources: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/compatability.mdx, https://github.com/blackboardsh/electrobun/releases/tag/v2.0.6
- Releases use a Zstandard self-extracting wrapper and BSDIFF patches, with a fallback to a full compressed download. Source: https://github.com/blackboardsh/electrobun#readme

#### Can the existing Bun server run unchanged?

- `Bun.serve`: an issue comment reports that running your own `Bun.serve` from the main process works. Source: https://github.com/blackboardsh/electrobun/issues/536
- Threading: "Cottontail and Bun run your application JavaScript on a worker while Electrobun Core owns the main-thread event loop." So the app's own `Worker` is a worker started from a worker. The docs do not say if this has limits. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/architecture/overview.mdx
- Bundling: Hutch bundles the main process itself. It forwards only `minify`, `sourcemap`, `target`, `external`, `define`, `alias`. "Function-valued bundler plugins ... are not currently supported in `electrobun.config.ts`." So `bun-plugin-tailwind` does not run in the Hutch build. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/cli/build-configuration.mdx
- HTML imports in the main process: the docs do not say if Hutch keeps them. An open issue asks for Bun HTML-import bundling instead of Vite (#151). Templates that need plugins "run their own Vite build and copy its output". Sources: https://github.com/blackboardsh/electrobun/issues/151, https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/cli/build-configuration.mdx
- Inference: the likely path is a pre-build step (`Bun.build` with the tailwind plugin) and then Hutch bundles or copies its output. This is not tested.
- `bun:sqlite` and `Bun.spawn`: the main process is a normal Bun 1.4.4 runtime, so these APIs are available. The Cottontail scanner lists `bun:sqlite` as a known capability. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/cli/build-configuration.mdx

#### macOS APIs

- Dock badge: no API. The Utils docs have only `setDockIconVisible` and `isDockIconVisible`. The macOS native wrapper has no `dockTile` call. Sources: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/utils.mdx, https://github.com/blackboardsh/electrobun/blob/main/package/src/native/macos/nativeWrapper.mm
- Notifications: `Utils.showNotification({ title, subtitle, body, silent })` exists. It uses `UNUserNotificationCenter`, with a fallback to the deprecated `NSUserNotification`. It is "fire-and-forget": there is no click event and no metadata. Issue #384 asks for this and is open. Sources: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/utils.mdx, https://github.com/blackboardsh/electrobun/issues/384
- App events: `application-menu-clicked`, `context-menu-clicked`, `open-url`, `reopen`, `before-quit`. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/events.mdx
- Tray: `new Tray({ title, image, template, width, height })`, `setMenu([...])`, and the `tray-clicked` event. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/tray.mdx
- App menu: an ApplicationMenu API exists. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/application-menu.mdx

#### Packaging, signing, updates

- On macOS, Hutch makes a DMG (`createDmg`, default true). On Windows it makes a Setup ZIP. On Linux it makes a self-extracting archive. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/architecture/overview.mdx
- With `codesign: true` and `notarize: true`, Hutch signs, notarizes and staples canary and stable builds. It accepts an App Store Connect API key or an Apple ID and app-specific password. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/code-signing.mdx
- "Electrobun supplies the JIT and dynamic-library entitlements needed by its runtime by default." Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/code-signing.mdx
- Auto-update: an Updater API checks a hash, applies patches or a full archive, and swaps the app with rollback protection. Static file hosting is enough. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/updates.mdx

#### Dev loop

- `hutch electrobun dev --watch` rebuilds and relaunches the whole app. Main-process state resets. Webview HMR needs a Vite template. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/hot-reloading.mdx

#### Windows and Linux

- Supported: macOS 14+ (x64, arm64), Windows (x64, arm64, WebView2), Linux (x64, arm64, WebKitGTK 4.1). Hutch does not cross-compile, so each OS needs its own CI runner. Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/compatability.mdx

### 3.2 Electron with a Bun sidecar

In this setup, the Electron main process starts a `bun build --compile` executable. That executable runs the existing server. The Electron window loads it over localhost.

#### Versions

- Electron v45.3.3 (2026-11-14) is the latest stable. It contains Node v24.22.3 and Chromium 156. The repository has about 124k stars. Sources: https://github.com/electron/electron/releases/tag/v45.3.3, https://github.com/electron/electron/blob/v45.3.3/DEPS
- electron-builder 26.18.1 is the latest stable. 27.0.0 is in alpha. Source: https://github.com/electron-userland/electron-builder/releases

#### `bun build --compile` support

- HTML imports and full-stack servers: supported since Bun 1.2.17. "When you import an HTML file in your server code, Bun bundles the frontend assets ... and embeds them into the executable." Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx
- Plugins (tailwind): `[serve.static] plugins` in `bunfig.toml` "work in `Bun.build()`'s JS API, but not yet in the CLI." So the compile step must use `Bun.build({ compile, plugins })`, not the `bun build` CLI. Source: https://github.com/oven-sh/bun/blob/main/docs/bundler/fullstack.mdx
- Workers: you must add the worker file as an extra entrypoint. Bun does not detect `new Worker(path)` yet. Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx
- `bun:sqlite`: supported. A database can also be embedded with `embed: "true"`, but an embedded database lives in memory and loses changes on exit. Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx
- Embedded assets: `with { type: "file" }`, `--asset` for directories, and `Bun.embeddedFiles`. Embedded files are read-only. Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx
- `bunfig.toml` and `.env` load at runtime by default. You can turn this off with `--no-compile-autoload-bunfig`. Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx

#### Binary size

- "A standalone executable is a copy of `bun` with your program attached." The Bun 1.4.4 macOS arm64 download is 40.3 MB zipped. Sources: https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx, https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4
- The extracted Bun executable was 63 MB on macOS ARM64 (Bun 1.3.13). Source: https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/guides/changelog/v2-x.mdx
- `--trim` (experimental) removes the CLI, about 44.8 MB on macOS arm64. Source: https://github.com/oven-sh/bun/blob/main/docs/compiler/size.mdx

#### Signing and notarizing the Bun binary in an Electron app

- Bun recommends these entitlements for a compiled binary: `allow-jit`, `allow-unsigned-executable-memory`, `disable-executable-page-protection`, `allow-dyld-environment-variables`, `disable-library-validation`. Codesign needs Bun 1.2.4 or later. Sources: https://github.com/oven-sh/bun/blob/main/docs/guides/runtime/codesign-macos-executable.mdx, https://github.com/oven-sh/bun/blob/main/docs/compiler/executables.mdx
- electron-builder signs nested binaries with `entitlementsInherit`. Without that file, `@electron/osx-sign` uses `default.darwin.plist` for "everything else". That default has `allow-jit` but not the other four Bun entitlements. Sources: https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/macOptions.ts, https://github.com/electron/osx-sign/blob/main/entitlements/default.darwin.plist
- `@electron/osx-sign` has `optionsForFile` to give one file its own options. Source: https://github.com/electron/osx-sign#readme
- Known issues:
  - A codesign regression in Bun 1.3.12 ("invalid or unsupported format for signature") is closed (#29361, #29276).
  - An invalid ad-hoc signature on darwin-arm64 output is fixed (#39772).
  - A Bun process on macOS 27 sometimes dies at startup with SIGTRAP in `pthread_jit_write_protect_np`. This issue is open (#42687).
  - Sources: https://github.com/oven-sh/bun/issues/29361, https://github.com/oven-sh/bun/issues/39772, https://github.com/oven-sh/bun/issues/42687
- electron-builder has `hardenedRuntime` and `notarize` options. Source: https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/options/macOptions.ts

#### `extraResources`

- `extraResources` copies files to `MyApp.app/Contents/Resources/`. In 27.x the key moves under `fileOptions`. `electron-builder migrate-schema` moves it. Source: https://github.com/electron-userland/electron-builder/blob/master/website/docs/contents.md

#### App size

- The Electron v45.3.3 darwin-arm64 zip is 121 MB. Add about 40 MB (zipped) for the Bun sidecar. Sources: https://github.com/electron/electron/releases/tag/v45.3.3, https://github.com/oven-sh/bun/releases/tag/bun-v1.4.4

#### Electron native APIs

- Badge: `app.setBadgeCount([count])` (Linux, macOS). `dock.setBadge(text)` (macOS). Sources: https://www.electronjs.org/docs/latest/api/app#appsetbadgecountcount-linux-macos, https://www.electronjs.org/docs/latest/api/dock
- Notifications: the `Notification` class has a `click` event. Your handler can show and focus the window. Source: https://www.electronjs.org/docs/latest/api/notification
- Tray: the `Tray` class. Source: https://www.electronjs.org/docs/latest/api/tray
- Auto-update: `electron-updater`. Source: https://www.electron.build/auto-update

#### Electron with a Node port (no sidecar)

- Electron runs Node v24. The port replaces `Bun.serve` HTML imports, `bun:sqlite`, Bun `Worker`, and `Bun.spawn` with Node equivalents. `node:sqlite` is "Stability: 1.2 - Release candidate" on v24.x. Sources: https://github.com/electron/electron/blob/v45.3.3/DEPS, https://github.com/nodejs/node/blob/v24.x/doc/api/sqlite.md

### 3.3 Comparison

| | Electron + Node port | Electron + Bun sidecar | Electrobun |
| --- | --- | --- | --- |
| Size (macOS arm64) | About 121 MB zipped Electron base | About 121 MB + about 40 MB zipped Bun binary | About 1 MB core. Bun adds about 63 MB extracted. Installers of about 50 to 63 MiB are reported (Windows) |
| Maturity | Electron v45, about 124k stars, large ecosystem | Same as Electron. Bun `--compile` HTML imports since 1.2.17 | v2.0.6, about 13k stars, one main author, almost daily betas, many open platform bugs |
| Port effort | High: rewrite Bun APIs (serve, HTML imports, sqlite, Worker, spawn) for Node | Low code change. Build with `Bun.build` (JS API) for the tailwind plugin. List the worker as an entrypoint. Add sidecar start and stop | Medium: Hutch does not run bundler plugins, and HTML-import support is not documented, so a pre-build step is likely. The app's Worker runs inside a worker |
| Badge / notify / tray | Yes / yes, with click event / yes | Yes / yes, with click event / yes | No badge API / notify with no click event (#384 open) / yes |
| Packaging | electron-builder: DMG, sign, notarize, electron-updater | Same, plus extra entitlements for the Bun binary (`entitlementsInherit` or `optionsForFile`) | Hutch: DMG, sign, notarize, staple, built-in bsdiff updater, JIT entitlements by default |
