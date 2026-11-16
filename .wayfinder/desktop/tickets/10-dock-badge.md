---
title: Show the Needs-you count on the Dock icon
type: wayfinder:task
status: open
assignee: claude (desktop-10)
blocked-by: [09-token-entry]
---

## Question

Show the Needs-you count as the Dock badge.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Needs you", "Dock badge" and "Preload bridge".
- Page: a pure function from a tree to `NeedsYouThread[]` (visible top-level threads, `needs-input` or `plan-ready`), with tests. Its length equals the header chip count. Call `setNeedsYou` on each tree, only when the list changed.
- Main: check the payload (array of at most 500 items, string fields), then `app.setBadgeCount(length)`. Keep the last list for the menu-bar entry.
- README "What you get": the Dock badge.

## Done when

`bun run check` passes. In `bun run desktop:demo` the badge equals the header chip count, with the window shown and hidden. With `PUSH=1`, the badge follows the changes.

## Handed over from desktop-09

- The bridge type lives in `src/shared/desktop.ts` (`DesktopBridge`, with the `window.desktopBridge` global). It has only `setToken` today. Add `setNeedsYou` there, and add it to the object in `src/desktop/preload.ts`, which uses `satisfies DesktopBridge`.
- IPC pattern in `src/desktop/main.ts`: `ipcMain.handle` in `main()`, and the handler rejects any sender that is not `window?.webContents`. Check the payload in a module with no Electron import (`store.ts` has `parseToken` as the model), so `bun test` covers it.
