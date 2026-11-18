---
title: How does the small window behave?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

How does the small window get its list and share "Open next" with the page, how does it show and hide, and how does it sit on the screen?

## Brief

Source: [the map](../map.md) › Decisions so far, and `SPEC.md` › "Desktop app" and "Open next". Read `src/desktop/main.ts`, `src/desktop/preload.ts`, `src/shared/desktop.ts` and `src/page/attention.ts` first.

Decide:

- **Data path.** "The page owns the target and the skip memory" (`SPEC.md` › Open next). The hidden main page already drives the menu-bar menu through `setNeedsYou`, `setOpenNext` and `onOpenNext`. Options: the main page sends the list to main and main forwards it to the small window, or the small window loads its own page and its own SSE stream. Decide how "Open next" in the small window uses the main page's skip memory, so all controls open the same thread.
- **Toggle.** The text of the menu-bar item and of the app-menu item (which menu), and the shortcut key. Check the key against the macOS and Electron defaults.
- **On top.** The `setAlwaysOnTop` level, all Spaces or one, and full-screen apps.
- **Size and place.** Saved like `window.json`, or fixed. Resizable or not.
- **Close.** The close button hides the window and clears the toggle check.
- **Name.** The window lists your-turn threads too, so it is wider than **Needs you** in `CONTEXT.md`. Settle its user-facing name and add it to `CONTEXT.md`.

## On resolution

Write the rules part of the `## Spec` and `## Done when` of [the build ticket](03-window-build.md). Update `CONTEXT.md` with the name.

## Resolution

The user took every recommendation:

- **Name.** "Up next". `CONTEXT.md` now has **Up next window** and **Open next queue** (the thread set, wider than **Needs you**).
- **Data path.** The main page sends the queue and the target to main with a new bridge call. Main stores the last list and forwards it to the window, which loads a small page with its own preload, no SSE stream and no skip memory of its own.
- **Clicks.** "Open next" in the window sends `openNext` to the main page. A row click also goes through the main page and adds the thread to the skip memory, in this window only.
- **Toggle.** A checkbox "Up next" in the menu-bar menu (after "Open tree") and in the Window menu, with ⌥⌘U as a global shortcut.
- **On top.** `type: "panel"`, floating, all Spaces, over full-screen apps, no Dock or Cmd-Tab entry.
- **Size and place.** Saved in `up-next.json` with the `window.json` off-screen check, resizable with a minimum size. First show at the top right of the screen with the cursor.
- **Close.** Hides the window and clears both checks. The window gets the last stored list when it loads.

The full rules are in [the build ticket](03-window-build.md) › Spec › Rules.
