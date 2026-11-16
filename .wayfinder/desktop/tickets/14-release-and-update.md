---
title: Release the .dmg from a tag and show "Update available"
type: wayfinder:task
status: open
assignee:
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
