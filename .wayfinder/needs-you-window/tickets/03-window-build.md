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

## Done when

<!-- written by 01-window-look and 02-window-rules when they close -->

- The window matches the look above in light and dark mode, with threads and when empty.
- A click on a row opens its thread; a click on a linked key opens Linear only.
- `bun run check` passes.
- `SPEC.md` › "Desktop app" and `README.md` describe the window.
- A draft PR is open. The user tests it with `bun run desktop:demo` and merges it.
