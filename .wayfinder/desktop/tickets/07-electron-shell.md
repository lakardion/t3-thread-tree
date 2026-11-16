---
title: Start the server and the window from an Electron shell
type: wayfinder:task
status: open
assignee:
blocked-by: [06-sidecar-build]
---

## Question

Add the Electron main process, the preload and the dev commands, so `bun run desktop` opens the tree in its own window.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Shape", "Shell PATH", "Window" (load and show only) and "Build and dev".
- `electron` as a dev dependency. `src/desktop/main.ts`, `src/desktop/preload.ts` (empty bridge object for now), `bun run desktop` and `bun run desktop:demo`.
- Port choice, ready poll, restart backoff, login-shell PATH, single-instance lock, child stop on quit, links through `shell.openExternal`.
- Put the port choice, the PATH parse and the backoff in modules with no Electron import. Tests for each.
- The desktop code joins `bun run check` (format, lint, typecheck).
- README: Run gets `bun run desktop` and `bun run desktop:demo`. Requirements: macOS on Apple Silicon for the desktop app.

## Done when

`bun run check` passes. `bun run desktop:demo` opens a window with the demo tree, in light and dark mode. With `bun start` on 4773, `bun run desktop` takes 4774 and works. A kill of the child server brings it back within a few seconds. A click on a thread opens T3 Code.

## Handed over from desktop-06

- The lineage worker is now `new Worker("./src/server/lineage-scan.ts")`. In dev the path resolves from the cwd. Start the dev child server (`bun run src/server.ts`) with its cwd at the repo root, or the lineage scan does not start.
- The compiled sidecar loads `.env` from its cwd.
