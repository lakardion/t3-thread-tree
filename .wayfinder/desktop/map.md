---
label: wayfinder:map
status: open
created: 2026-11-15
---

# Map: Thread tree as a desktop app, execution

Resume with `/wayfinder-implement .wayfinder/desktop/map.md`. Run `/wayfinder-implement .wayfinder/desktop/map.md <ticket>` after a PR opens or merges.

## Destination

The thread tree runs as a desktop app on macOS, modelled on the T3 Code desktop app (`~/repos/t3code/apps/desktop`):

- Its own window and Dock icon. You open it from the Dock or Spotlight, not from a browser tab.
- Needs-you signals: a Dock badge with the "needs you" count, and native notifications when a thread starts to need you.
- A menu-bar (tray) entry.

Every route key is merged to `main`, together, as one stack. Autopilot threads build it, one `/start-issue-auto` thread per ticket. Drastic changes and full rewrites are allowed (user, at charting).

## Route

Source: markdown tickets in `tickets/`. The decisions come first and are grilled with the user. The build keys do not exist yet: ticket 05 writes them.

### Decisions (grilled with the user, not autopilot)

1. [What does the Bun app use, and how does T3 Code ship its desktop app?](tickets/01-port-inventory.md) — research
2. [Which shell and runtime: Electron on Node, Electron with a Bun sidecar, or Electrobun?](tickets/02-shell-and-runtime.md) — grilling
3. [What do the badge, the notifications and the menu-bar entry do?](tickets/03-desktop-features.md) — grilling
4. [How is the app built, run in dev and installed?](tickets/04-build-and-install.md) — grilling
5. [Write the desktop spec and cut the build tickets](tickets/05-spec-and-route.md) — task

### Lane 1 (autopilot)

One chain. Each key stacks on the one before it. "forced" marks a key that needs code from the key it names.

6. [Compile the server into a sidecar binary](tickets/06-sidecar-build.md) — stacks on `desktop-05-spec`
7. [Start the server and the window from an Electron shell](tickets/07-electron-shell.md)
8. [Keep the app alive with a hidden window, and add the app menu](tickets/08-window-lifetime.md) — after 07 (forced)
9. [Save the T3 token from the desktop window](tickets/09-token-entry.md) — after 07 (forced: bridge)
10. [Show the Needs-you count on the Dock icon](tickets/10-dock-badge.md) — after 07 (forced: bridge)
11. [Send a notification when a thread starts to need you](tickets/11-notifications.md) — after 08 (forced: `settings.json`)
12. [Add the menu-bar entry with the Needs-you threads](tickets/12-menu-bar.md) — after 10 and 11 (forced: list and mute)
13. [Package, sign and install the app from source](tickets/13-package-install.md) — after 06 and 12 (forced)
14. [Release the .dmg from a tag and show "Update available"](tickets/14-release-and-update.md) — after 13 (forced)

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- `main ← desktop-05-spec (#30)` (spec, base of the build stack)

## Notes

- Mode: autopilot, for the build keys only. Tickets 01 to 05 run with `/wayfinder` in sessions with the user. Autopilot starts after ticket 05 closes.
- **Run to completion** (build keys). Do not stop for the user, except for a real decision that the tickets and the spec do not answer. A choice with a clear default is not a stop: take the default and name it in the PR body.
- **Stack, do not wait.** When a key's PR opens, upkeep launches the next key at once, stacked on that key's branch. No key waits for a merge.
- **No merge until the end.** The user merges the whole stack as one feature when the last key is in review.
- **Never push to `main`.** Every change goes through the PR stack. The stack merges only after the user reviews and approves all of it (user, ticket 04).
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key that adds a visible feature updates `README.md` (see `CLAUDE.md`).
- **Skills:** `grilling` for 02 to 04, `domain-modeling` for 05, `vercel:shadcn` for UI work. Write in ASD-STE100.
- **Check every change** with the repo check script (`bun run check` today; ticket 04 can change it), and every UI change in the demo in light and dark mode.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Goal:** own window and Dock icon, needs-you signals (badge, notifications), menu-bar entry. Launch at login was not chosen.
- **Reference:** take the T3 Code desktop app as the model. Rewrites are allowed.
- **Process:** grill the decisions first, then autopilot the build.

- [What does the Bun app use, and how does T3 Code ship its desktop app?](tickets/01-port-inventory.md): Node port is about 150–250 lines plus a new page build; a compiled Bun sidecar works (64 MB); Electrobun has no Dock badge and no notification click; T3 Code loads a custom scheme and has no tray.

Closed map tickets:

- [Which shell and runtime: Electron on Node, Electron with a Bun sidecar, or Electrobun?](tickets/02-shell-and-runtime.md): Electron with the current server as a compiled Bun child process on 4773 or the next free port; the window loads the server URL; the hidden page drives badge, menu bar and notifications; the browser version stays; tools stay on Bun.
- [What do the badge, the notifications and the menu-bar entry do?](tickets/03-desktop-features.md): the badge and the menu bar show the Needs-you count (needs input + plan ready), notifications fire when a thread enters needs input, plan ready or failed, the app stays alive after the window closes, and the token lives in the Keychain (changed by 04: a `0600` file).
- [How is the app built, run in dev and installed?](tickets/04-build-and-install.md): macOS arm64 only; `bun run desktop` with Bun.build for main and the dev server for HMR; ad-hoc signed `.dmg` on GitHub Releases from a tag workflow, plus from-source install and the browser version; no auto-update, an "Update available" menu item; token in a `0600` file; CI compiles the sidecar.
- [Write the desktop spec and cut the build tickets](tickets/05-spec-and-route.md): `SPEC.md` › "Desktop app" is the spec; new terms Needs you, Desktop app, Browser version; build route 06–14 as one chain on branch `desktop-05-spec`.

## Not yet specified


## Out of scope

- Launch at login (not chosen at charting).
- New write actions on T3 (settle, snooze, interrupt). This map changes where the app runs, not what it does to T3.
- Threads of linked T3 environments on other machines.
- Windows, Linux and Intel Mac builds (ticket 04: macOS arm64 only).
- Developer ID signing, notarization and auto-update (ticket 04: the user does not pay for the Apple Developer Program).
