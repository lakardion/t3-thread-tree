---
title: Which shell and runtime: Electron on Node, Electron with a Bun sidecar, or Electrobun?
type: wayfinder:grilling
status: closed
assignee: claude (desktop-02)
blocked-by: [01-port-inventory]
---

## Question

Grill the user with the facts of [01](01-port-inventory.md). Decide:

- **Shell:** Electron, or Electrobun.
- **Server runtime:** with Electron, port the server to Node and run it the T3 way (`ELECTRON_RUN_AS_NODE` child process), or keep Bun as a compiled sidecar. A Node port means `node:sqlite` or `better-sqlite3`, `node:http`, a WebSocket client, `worker_threads`, and a page build step.
- **Where the server runs:** a child process (T3 pattern, crash isolation, restart) or inside the main process.
- **Page loading:** the window loads the server URL, a custom scheme that serves the built page from disk (the real T3 pattern, see 01), or a bundled file with data over IPC.
- **Browser version:** the server keeps serving the page at `127.0.0.1:4773` for a browser and a phone, or the app is desktop only.
- **Package manager and tools:** stay on Bun for install, scripts and tests, or move to pnpm, Vite and Vitest like T3.

Write the answers in a `## Resolution` section, then set `status: closed` and add one line to the map's "Decisions so far".

## Resolution

Grilled with the user on 2026-11-15. Facts: [research/01-port-inventory.md](../research/01-port-inventory.md).

- **Shell:** Electron. Electrobun has no Dock badge API and no notification click event, so it cannot deliver ticket 03 without native code.
- **Server runtime:** a Bun sidecar. Electron spawns a `Bun.build({ compile })` binary of the current server. No Node port. The sidecar needs a small `build.ts` (the Tailwind plugin works only through the JS API), a string worker path, `next-step-prompt.md` embedded in the binary, and Bun's JIT entitlements to sign the binary.
- **Where the server runs:** a child process of the main process (forced by the sidecar). On exit, main restarts it with T3 Code's backoff (500 ms, growing to 10 s). Main stops the child when the app quits.
- **Port:** `127.0.0.1`, try 4773 first, then the next free port.
- **Page loading:** the window loads `http://127.0.0.1:<port>`. No custom scheme. Known cost: if the port moves (for example `bun run start` holds 4773), that run uses a separate `localStorage`, so the theme and fold state are the defaults.
- **Browser version:** stays, the T3 way. The same server runs alone (`bun run start`) for a browser. A browser can also open the app's server.
- **Package manager and tools:** stay on Bun for install, scripts and tests. Electron and electron-builder are dev dependencies.
- **Signal driver:** closing the window hides it. The page keeps running and drives the Dock badge, the menu-bar list and the notifications through the preload bridge. `backgroundThrottling` is off. The Needs-you set and the notification rules live in the page. Cmd-Q quits.
