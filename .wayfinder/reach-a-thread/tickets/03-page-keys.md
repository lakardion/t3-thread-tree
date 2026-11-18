---
title: Which keys does the page own, and when are they off?
type: grilling
status: open
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
