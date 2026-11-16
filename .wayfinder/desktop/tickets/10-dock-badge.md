---
title: Show the Needs-you count on the Dock icon
type: wayfinder:task
status: open
assignee:
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
