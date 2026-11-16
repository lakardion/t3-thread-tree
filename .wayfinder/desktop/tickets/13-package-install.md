---
title: Package, sign and install the app from source
type: wayfinder:task
status: open
assignee:
blocked-by: [12-menu-bar]
---

## Question

Package the app with electron-builder, sign it ad-hoc, and install it with one command.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Package, sign and install".
- `electron-builder` as a dev dependency. Config in `package.json` `build` or `electron-builder.yml`: product name, `arm64`, `extraResources` for the sidecar, entitlements file, an app icon (`.icns`).
- `bun run desktop:install`: sidecar, main and preload bundles, `electron-builder --dir`, ad-hoc sign, copy to `/Applications`.
- `bun run desktop:dmg`: the same build as a `.dmg` in `release/`.
- README: the three install paths in Setup, and the desktop part of "How it works".

## Done when

`bun run check` passes. `bun run desktop:install` installs the app. Started from Spotlight, it shows the tree, the badge, the menu-bar entry and a notification, and "What's next" finds `claude` or `codex` (shell PATH). `codesign -dv --entitlements -` on the sidecar shows the JIT entitlements.

## Handed over from desktop-06

- Confirmed: the compiled sidecar loads `.env` from its cwd, so a `.env` in the app data folder loads when main starts the sidecar there.
- Not yet confirmed: whether the ubuntu cross-compile from CI runs on a Mac. The release build on `macos-14` compiles natively, so it does not depend on it.
