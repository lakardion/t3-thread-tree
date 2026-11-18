---
title: Which keys does the page own, and when are they off?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: [02-find-rules]
---

## Question

Which keys does the page own, what does each do, and when are the keys off? This includes the roving focus of M21.

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M21, M22. Today one page key handler closes the View panel with Escape (`app.tsx:632` at `5bf8567`). M19 adds `n` ("Open next"), off in inputs, textareas, contenteditable elements, dialogs, menus and the View panel ([the Open next rules](../../wait-time/tickets/03-open-next-rules.md)).

Decide:

- **Key list.** `n`, Cmd/Ctrl+K (Find), `/` as a second Find key?, `j`/`k`, Enter, `o` (details), `s` (send), Escape. Any key for the Focus list? [The Focus list look](01-focus-list-look.md) hands over keys 1 to 3 to open a Focus slot.
- **Guards.** One rule for all keys, or Cmd/Ctrl+K also inside fields?
- **Roving focus.** One tab stop for the row list; `j`/`k` (and the arrow keys?) move. Which rows count: subthreads, stack rows, project and group headers? What about folded projects and the flat view? Where does focus start, and what happens on a tree update?
- **Clash with drag.** Space and Enter start a keyboard drag on the handle (`@dnd-kit/dom` default). Enter on a row opens in T3.
- **Legend.** The keys in the View panel legend. A `?` key?

## On resolution

Write the `## Spec` and `## Done when` of [the Find build](05-find-build.md) (its key part) and [the row keys build](06-row-keys-build.md) from the answer. Graduate or clear the "Not yet specified" patch on folds and the flat view.

## Resolution

Decided with the user. The build specs are in [Add Find](05-find-build.md) (shared handler, Cmd/Ctrl+K, keys 1 to 3, Keys fold) and [Add the keyboard path through the rows](06-row-keys-build.md) (row keys).

- **Key list.** `n` (Open next, from M19), Cmd/Ctrl+K (Find), `1` to `3` (Focus slots), `j`/`k` and ↑/↓ (move), Enter (open, the native link), `o` (details), `s` (Send), Escape (closes what is open, as today). No `/`, no `f`, no `?`.
- **`/` stays free.** No page key uses it. The desktop app has no find-in-page; a find bar there is out of scope for this map.
- **One handler, one guard.** All plain keys share M19's guard: off in an input, a textarea or a contenteditable element; off while a dialog, alert dialog, menu or listbox is open; off while the View panel is open; off with any modifier. Key repeat is off, except for `j`/`k` and ↑/↓.
- **Cmd/Ctrl+K** also works in text fields. It does nothing while another dialog is open. In the open Find dialog it closes Find.
- **Keys 1 to 3** open that Focus slot's thread in T3. An empty slot does nothing.
- **Roving focus: real DOM focus on the row's title link.** `j`/`k` move it. ↑/↓ move it only when focus is already on a row or a fold header. Tab order does not change.
- **Stops.** Every visible thread row (subthreads and stack rows too) and every fold header (project, key group, review group, PR stack, status section in the flat view). Rows in a closed fold are not visible, so they are skipped. Enter on a header folds or unfolds it.
- **Start.** With no focus in the list, `j` or `k` focuses the first stop in the viewport. Each move scrolls with `block: "nearest"`.
- **Tree update.** Focus follows the thread id. When the row leaves, focus goes to the stop now at its old index; with no stops, to the page.
- **Fold with focus inside.** Focus goes to the header that folded.
- **Escape** on a row does nothing.
- **Drag.** `j`/`k` never land on the drag handle, so Enter and Space on a row do not start a drag.
- **Legend.** A "Keys" fold in the View panel, beside "Status icons". The Find and Open next tooltips name their keys.
