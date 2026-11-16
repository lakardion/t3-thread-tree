---
title: How is the app built, run in dev and installed?
type: wayfinder:grilling
status: closed
assignee: damian.lucero
blocked-by: [02-shell-and-runtime]
---

## Question

Grill the user, from the answers of [02](02-shell-and-runtime.md). Decide:

- **Dev loop:** one command that starts the app with hot reload of the page, and the demo mode (`bun run demo` today) inside the desktop window.
- **Build:** the bundler for main and preload, the `Bun.build({ compile })` script for the server sidecar (Tailwind plugin, worker entry, embedded `next-step-prompt.md`), how the sidecar goes into the app (`extraResources`), and the output folder.
- **Dev loop runtime:** in dev, does Electron spawn `bun src/server.ts` (keeps HMR) or the compiled sidecar?
- **Shell PATH:** how the server finds `claude` and `codex` when the app starts from the Dock.
- **Install:** signing must give the Bun sidecar its JIT entitlements. A local unsigned `.app` or `.dmg` for the user's own Mac, or a signed and notarized build. Auto-update, or a manual rebuild.
- **Platforms:** macOS only, or also Linux and Windows builds.
- **CI:** what `check` runs in CI, and whether CI builds the app.

Write the answers in a `## Resolution` section, then set `status: closed` and add one line to the map's "Decisions so far".

## Resolution

Grilled with the user on 2026-11-16. All choices below are the user's.

- **Platform:** macOS on Apple Silicon (arm64) only. Linux, Windows and Intel Macs are out of scope.
- **Dev loop:** `bun run desktop` bundles `main` and `preload` with `Bun.build({ target: "node", external: ["electron"] })` into `dist/desktop/`, then starts Electron. No electron-vite and no watch mode for main: restart the command after a main change.
- **Dev loop runtime:** in dev, Electron spawns `bun src/server.ts`, so Bun's HMR stays. `bun run desktop:demo` spawns `scripts/demo.ts` instead. The packaged app spawns the compiled sidecar. `app.isPackaged` (or one env var) selects the command.
- **Build:** a `Bun.build({ compile })` script makes the sidecar for `bun-darwin-arm64` in `dist/sidecar/` (Tailwind plugin, string worker path, embedded `next-step-prompt.md`). electron-builder adds it through `extraResources` and writes the app to `release/`. `dist/` and `release/` go in `.gitignore`.
- **Shell PATH:** at start, main runs `$SHELL -l -c env` once, with a 5 s timeout, and merges its `PATH` into the sidecar env. `env` prints a colon-joined `PATH` in every shell, fish too. On failure, main keeps the current PATH and appends `/opt/homebrew/bin`, `~/.local/bin` and `~/.bun/bin`.
- **Signing:** ad-hoc (`codesign -s -`), with the Bun JIT entitlements (`allow-jit`, `allow-unsigned-executable-memory`) for the sidecar. No Apple Developer ID and no notarization: the user does not pay for the Apple Developer Program.
- **Install, three paths** (all in the README):
  - `.dmg` from GitHub Releases. Other people allow it once in System Settings > Privacy & Security > "Open Anyway", or run `xattr -dr com.apple.quarantine`.
  - From source: `bun run desktop:install` compiles the sidecar, bundles main and preload, packages with electron-builder `--dir`, signs ad-hoc and copies the `.app` to `/Applications`. A local build has no quarantine flag.
  - Browser: `bun run start`, as today.
- **Release:** a tag push (`v*`) runs a workflow on a `macos-14` runner. It builds the ad-hoc signed `.dmg` and attaches it to the GitHub Release. `package.json` holds the version.
- **Updates:** no auto-update (Squirrel.Mac needs a Developer ID signature). The packaged app checks the GitHub latest-release API at start and every 6 h. If a newer version exists, it adds "Update available: vX.Y.Z…" to the app menu and the menu-bar menu. A click opens the release page. No notification.
- **T3 token (changes ticket 03):** a file in `~/Library/Application Support/<app>/token`, mode `0600`, no Keychain. Reason: an ad-hoc signature changes with each build, so the Keychain would prompt after each update. The token gives no new power to a process that runs as the user (it can run `~/.t3/bin/t3`), and `.env` holds it in plaintext today. `T3_TOKEN` in the env stays as a fallback for dev.
- **CI:** `bun run check` keeps its name and also lints, typechecks and tests the desktop code (pure logic: port choice, PATH parsing, restart backoff). CI also compiles the sidecar for `bun-darwin-arm64` on ubuntu. CI does not package the app; the release workflow is separate.
- **Process (user, at resolution):** the build keys run on autopilot as one PR stack, so the user can test each part. No push to `main`. The stack merges only after the whole stack is reviewed and approved.
