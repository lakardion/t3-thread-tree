---
title: Add the keyboard path through the rows
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [03-page-keys, 05-find-build]
---

## Question

Build M21: a roving focus on the rows, with the rules of [the page keys](03-page-keys.md).

## Brief

Stacks on 05-find-build and extends its key handler. Show the keys in the View panel legend. Update `SPEC.md` and `README.md`. One draft PR.

## Spec

Decided in [the page keys](03-page-keys.md).

**Model.** Real DOM focus. The focus of a thread row is its title link; the focus of a fold header is its fold button. Tab order does not change, and the row list gets no roving tabindex.

**Stops.** In DOM order: every visible thread row (top-level, subthreads, stack rows, context rows) and every fold header (project, key group, review group, PR stack, and the status section in the flat view). Rows in a closed fold are not in the DOM or not visible, so they are skipped. The "+N other threads" button is not a stop.

**Keys.** Add them to the shared handler of [the Find build](05-find-build.md), with its plain-key guard.

- `j` / `k`: focus the next / previous stop. They allow key repeat. At the last or first stop, nothing happens.
- ↑ / ↓: the same, but only when focus is already on a stop. Elsewhere the arrows scroll the page. Call `preventDefault` only when they move.
- With no stop focused, `j` or `k` focuses the first stop whose row is in the viewport.
- Each move calls `scrollIntoView({ block: "nearest" })`.
- On a thread row: Enter opens it in T3 (the native link), `o` toggles its details, `s` opens Send for it when the Send button shows. On a header, Enter folds or unfolds (the native button); `o` and `s` do nothing.
- Escape adds nothing.
- The drag handle is never a stop, so Enter and Space start no drag from a row.

**Tree updates.** Keep the focused thread id (or header id) in a ref.

- After a render, if the stop is still there but lost focus (the row moved), focus it again.
- If it is gone (settled, filtered, hidden), focus the stop now at its old index; with no stops, blur to the page.
- When the user folds a header with focus inside the fold, focus the header.

**Legend.** Add to the Keys fold: `j`/`k` or ↑/↓ move, Enter open, `o` details, `s` send.

**Focus look.** The focused row shows a clear `focus-visible` ring on the row, not only on the title link, in light and dark mode.

**Docs.** `SPEC.md` and `README.md` describe the row keys.

## Done when

- `j`/`k` and ↑/↓ move through thread rows and fold headers in the tree and the flat view (Group by None and Status), skipping rows in closed folds.
- The first `j`/`k` focuses the first stop in view; moves scroll only as needed.
- Enter opens the row in T3 or folds the header; `o` toggles details; `s` opens Send.
- Keys do nothing in a field, in a dialog or menu, with the View panel open, or with a modifier.
- Focus follows the thread through a reorder, goes to the old index when the row leaves, and goes to the header when its fold closes.
- The Keys fold lists the row keys.
- Tests cover the stop order and the "row left" fallback.
- `bun run check` passes, and `bun run demo` looks right in light and dark mode, desktop and phone width. `SPEC.md` and `README.md` are updated. One draft PR.

## Handed over from reach-a-thread-05

The shared page key handler is in place (#89). `pageKey(e, ctx)` in `src/page/keys.ts` decides each key press; it is pure and tested in `test/keys.test.ts`. The one `keydown` effect in `src/page/app.tsx` builds `ctx` (`field`, `panel`, `overlay`, `mac`) from the DOM and runs the action. Add `j`/`k`, `o` and `s` as new return values of `pageKey`, with their cases in the test, and add them to the `KEYS` legend in `app.tsx` (the Keys fold). The plain-key guard already returns null in a field, with the View panel open, in Find, a dialog, a menu or a listbox, and with a modifier or a repeat.
