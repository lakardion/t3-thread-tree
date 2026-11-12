---
id: 006
title: How does the standalone app run, and on which stack?
type: grilling
status: closed
assignee: claude (session 006)
blocked_by: [003]
---

## Question

How does the standalone tree app run on the user's machine, and what is it built with?

Decide:

- Start mode: a dev server started by hand, a launch at login (launchd), or another way.
- Port, and how the page finds the backend.
- Backend runtime and framework for the Node process that holds the shell WebSocket and the SQLite side-read.
- Frontend framework, and how live updates reach the page (WebSocket or SSE from the backend).
- How the backend gets its `orchestration:read` token and the T3 port (`server-runtime.json`) at each start, and what it does when T3 is not running.

Known: [Standalone webapp or a view inside T3 Code?](003-standalone-or-in-t3.md) chose a standalone app with a Node backend. [How can a local process read T3 thread data live?](001-data-source-for-local-reader.md) holds the protocol and auth facts.

## Resolution

Grilled with the user on 2026-11-12. Facts on token and linked environments came from a read-only study of the T3 source and data dir. The frontend comparison is on branch `research/frontend-framework`, file `research/frontend-framework.md` (commit `4d7deda`).

1. **Start mode:** one command, `bun start`, in the repo. The page and the API are on one origin, `http://127.0.0.1:4773`, so the page uses relative URLs. The app stops when the terminal closes. A launchd agent can come later with no code change.
2. **Backend:** Bun 1.3 with TypeScript and no framework. `Bun.serve` serves the page and the API. The Bun WebSocket client holds `orchestration.subscribeShell` with the bearer header. `bun:sqlite` does the launched-thread lineage read. This replaces "Node backend" in [Standalone webapp or a view inside T3 Code?](003-standalone-or-in-t3.md).
3. **Tree logic on the backend:** the backend keeps the thread map and builds the whole placed tree (the 004 and 005 rules) on each change, with a debounce. It pushes the whole tree as JSON over Server-Sent Events. The page only renders it. The settled toggle is a query parameter on the SSE request. The backend and the page share one `Tree` type.
   - `Bun.serve` closes a connection after 10 s with no bytes. Call `server.timeout(req, 0)` on the SSE request, and stop the push timer when the client disconnects.
4. **Frontend:** Preact with JSX and signals, built by Bun (HTML imports). No Vite and no plugin. Plain `tsc` checks the types. The page keeps the ids of closed rows in one Set, outside the pushed tree, so a push does not open them again. The Set is saved in `localStorage`, so a page reload keeps it.
5. **Token:** the user issues it once with `~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only` and puts it in the gitignored `.env`, which Bun loads. A token cannot be non-expiring. When T3 rejects the token (401), the banner shows this command.
6. **T3 not running:** the backend starts anyway. Every 3 s it reads `~/.t3/userdata/server-runtime.json` again (port, pid) and tries to connect. The page keeps the last tree, greyed, with a banner "T3 not running: last update HH:MM". Each reconnect takes a fresh snapshot and replaces the tree. The app does not use `afterSequence`.
7. **Linked machines: out of scope.** The user has zero linked environments. The local shell stream carries only local threads. A remote needs its own `subscribeShell` connection and a token that the remote issues. Server peer links forward MCP calls only.
