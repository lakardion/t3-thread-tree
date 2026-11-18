---
title: Add the small window to the desktop app
type: wayfinder:task
status: open
assignee: 
blocked-by: [01-window-look, 02-window-rules]
---

## Question

Build M23: a small always-on-top desktop window that lists the Open next threads with their Wait and has "Open next", with the look of [the window look](01-window-look.md) and the rules of [the window rules](02-window-rules.md).

## Spec

<!-- written by 01-window-look and 02-window-rules when they close -->

### Look (from 01-window-look)

Reference: `VariantA` in `src/page/small-window.prototype.tsx` on branch `prototype/needs-you-window-look` (commit `deb3693`), screenshots `win-A2-*.png` in `.wayfinder/needs-you-window/assets/01-window-look/` on that branch. Do not copy its variant switch, fake title bar or URL params.

- **Window.** 360×360 by default, resizable. About 10 rows fit before the list scrolls.
- **Top bar.** The window name (from 02-window-rules), the count of all listed threads, and an outline "Open next" button at the right (`SkipForward` icon). The button is disabled when the list is empty.
- **Row.** One line, 28 px: status icon (`StatusIcon`), project icon (`ProjectIcon`, no name), issue key, title, Wait. No phrase text. The key is mono, muted, and links to Linear when `linearHref` gives a URL; a click on the key does not open the thread. The title drops its key prefix (`stripKey`) and ends in an ellipsis when long. The Wait uses the status colour and mono digits.
- **Click and hover.** A click on the row opens the thread in T3. The row has the full title as a tooltip.
- **Target.** The row that Open next opens has an amber left mark and a tint.
- **Empty.** The top bar stays. The list area shows "Nothing waits" and, under it, "Threads that need you show here.", centred.
- Light and dark mode follow the app theme.

### Rules (from 02-window-rules)

- **Name.** The window is the **Up next window** (`CONTEXT.md`). Its title, its top bar and both menu items say "Up next".
- **Data path.** The main page owns the list, the target and the skip memory. It sends the **Open next queue** to main with a new bridge call, for example `setUpNext(rows, targetId)`. Each row carries what the look needs: id, title, environment id, status, `since`, project and issue key (or the Linear URL). Main checks the payload by hand, stores the last one and forwards it to the Up next window. The window loads a small page from the same server with its own preload. It has no SSE stream, no tree logic and no skip memory of its own. Main accepts IPC from the main window and from the Up next window only, and each window only for its own calls.
- **First show.** When the window loads, it gets the last list that main stores, so it never opens empty while threads wait.
- **Open next.** The button sends `openNext` to the main page, the same as the menu-bar item. All controls open the same thread.
- **Row click.** It goes through the main page, which opens the thread and adds it to the skip memory. So after a click on the top row, Open next goes to the next row. This applies to this window only; tree rows and menu-bar rows do not change.
- **Key click.** A linked issue key opens Linear through `shell.openExternal`. It does not touch the skip memory.
- **Toggle.** A checkbox item "Up next" in the menu-bar menu, after "Open tree", and in the **Window** menu. The Window menu keeps its role items (Minimize, Zoom, Bring All to Front). The shortcut is **⌥⌘U**, registered with `globalShortcut` so it works while the editor has focus, and shown as the accelerator of the Window-menu item. When registration fails, main logs it and the menu items still work. The window is hidden at start; it is not restored at restart.
- **On top.** `type: "panel"`, at the floating level, on all Spaces (`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`), visible over full-screen apps. No Dock or Cmd-Tab entry. A click on it does not bring the main window forward.
- **Size and place.** Main saves the size and place in `up-next.json` and restores them with the same off-screen check as `window.json` (`parseBounds`). Resizable, with a minimum size of about 280×160. On the first show with no saved place, it sits at the top right of the work area of the screen that holds the cursor.
- **Close.** The close button hides the window and clears the check in both menus. ⌥⌘U shows it again. Cmd-Q quits the app as now.

## Done when

<!-- written by 01-window-look and 02-window-rules when they close -->

- The window matches the look above in light and dark mode, with threads and when empty.
- A click on a row opens its thread; a click on a linked key opens Linear only.
- "Open next" in the window, the page button, the key `n` and the menu-bar item open the same thread.
- After a row click in the window, the target moves to the next thread, in the window and on the page.
- ⌥⌘U and both "Up next" items show and hide the window, while another app has focus too; the check follows the state, also after the close button.
- The window stays on top on another Space and over a full-screen app, in the packaged app.
- The size and place come back after a restart; a place that is off all screens is dropped.
- The window opens with the current list, not empty, when threads wait.
- `CONTEXT.md` has **Open next queue** and **Up next window**.
- `bun run check` passes.
- `SPEC.md` › "Desktop app" and `README.md` describe the window.
- A draft PR is open. The user tests it with `bun run desktop:demo` and merges it.
