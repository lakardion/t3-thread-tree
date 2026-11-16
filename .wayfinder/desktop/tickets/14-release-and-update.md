---
title: Release the .dmg from a tag and show "Update available"
type: wayfinder:task
status: in-review
assignee: claude (desktop-14)
blocked-by: [13-package-install]
---

## Question

Publish the `.dmg` on GitHub Releases from a tag, and tell the user in the menus when a newer release exists.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Release and updates".
- `.github/workflows/release.yml`: on a `v*` tag, `macos-14`, `bun run desktop:dmg`, attach the `.dmg` to the Release (`gh release create` or upload).
- Update check in the packaged app only: start and every 6 h. A pure version compare with tests. On a newer version, "Update available: vX.Y.Z…" in the app menu and the menu-bar menu opens the release page.
- README: the release install path, the "Open Anyway" step and the update item.

## Done when

`bun run check` passes. The workflow passes `actionlint` (or a dry run on a test tag in a fork or branch, if the user allows it). With a faked older `app.getVersion()`, the update item shows and opens the release page.

## Handed over from desktop-08

- `setMenu()` in `src/desktop/main.ts` builds the app menu. Add "Update available: vX.Y.Z…" to its app submenu, and call `setMenu()` again when an update is found.

## Handed over from desktop-12

- The menu-bar menu is built in `setTrayMenu()` in `src/desktop/main.ts`. Put "Update available: vX.Y.Z…" between "Mute Notifications" and "Quit" (SPEC.md › "Menu-bar entry"), and call `setTrayMenu()` when an update is found.

## Handed over from desktop-13

- `bun run desktop:dmg` writes `release/T3 Thread Tree-<version>-arm64.dmg`, ad-hoc signed through `mac.identity: "-"` in `package.json` `build`. It needs no signing secrets on the runner. `package.json` `version` is `0.1.0`.
- The README Setup › Install already has the `.dmg` path with the "Open Anyway" and `xattr` step. The release ticket adds only the update item to the README.
