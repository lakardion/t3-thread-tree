---
title: Add Find
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [02-find-rules, 03-page-keys, 04-focus-list-build]
---

## Question

Build M22: the Find control and Cmd/Ctrl+K, with the rules of [the Find rules](02-find-rules.md) and [the page keys](03-page-keys.md).

## Brief

Starts on `main`: 04-focus-list-build (M20) is merged in #88. It adds the shared page key handler, or extends the one that M19 added. Update `SPEC.md` and `README.md`. One draft PR.

## Spec

Decided in [the Find rules](02-find-rules.md) and, for the keys, [the page keys](03-page-keys.md).

**Form.**

- A **Find** button in the header (search icon, tooltip with the key) and Cmd/Ctrl+K open a dialog: a search input on top, the results below. Full screen at phone width.
- Build it with the shadcn `Command` component (`shadcn add command`, adds `cmdk`) inside the existing `Dialog`. Set `shouldFilter={false}`: the match below decides the results. `cmdk` gives the arrow keys, the selected row and the aria roles.
- Escape or a pick closes it. The query clears on close.

**Set.** Every thread of the loaded tree, subthreads included. The "Needs you" filter, the folds and hidden snoozed threads do not limit the results. Settled threads come in only when "Show settled threads" is on, or through the settled search below.

**Match.** One pure function in `src/shared/` that the page and the server share.

- Case-insensitive substring. Split the query on spaces. Every word must match at least one field: title, issue key, project label, `detail.branch`, or a PR number (`#123` or `123` against `prs[].n`).
- Order: match quality first (a word that matches the issue key or the start of the title or of a title word, before a match inside a word), then tree order.
- No fuzzy match. A later change can swap this one function.

**Result row.**

- Status icon, the full title (wraps, not cut), and at the right the Wait text, or the age for a thread that does not wait on the user.
- A muted second line: project, issue key, branch. A subthread adds "in <parent title>".
- No PR badges. Settled results show muted, as in the tree.

**Actions.**

- **Enter** (or a click) opens the thread in T3, like the row link, and closes the dialog.
- **Show in tree**, a row button and Shift+Enter: closes the dialog, unfolds every fold on the path to the row (project, key group, PR stack; in the flat view, the status section) and stores the folds, then scrolls to the row and flashes it for about 1.5 s. Use the Show in tree of [the Focus list build](04-focus-list-build.md) (`revealRow` in `src/page/focus.tsx`, which finds `.thread-row[data-thread]`), and replace its "row is hidden" note for folded rows with this unfold, so the Focus strip unfolds too.
- A result that a view setting hides (the "Needs you" filter is on and it does not match, or it is snoozed and snoozed threads are hidden) and a settled result while the switch is off get no Show in tree. Enter still works. Find never turns off a view setting.

**Settled search.**

- When the query is not empty and "Show settled threads" is off, the last row is **Search settled threads**. With no active match, it is the only row, so Enter picks it.
- A pick calls `GET /find?q=<query>`. The server runs the shared match over the settled threads only (`treeFor(true)` minus the active ones) and returns result rows. They show in a **Settled** group below the active results.
- For the rest of the dialog session, a query change fetches the group again (debounced, about 200 ms). On close, Find goes back to active threads only.

**Empty and no match.**

- Empty input: the Focus list threads, then the most recently updated threads, up to 8 in all. If there are none, an icon state with the hint "Find by title, issue key, project, branch or #PR".
- No match: an icon state (search-x icon, "No thread matches"), plus the Search settled threads row when it applies.

**Keys.**

- **One page key handler.** Move M19's `n` handler into one shared `keydown` handler with one guard for plain keys: no modifier, no key repeat, focus not in an input, a textarea or a contenteditable element, no dialog, alert dialog, menu or listbox open, View panel closed. [The row keys build](06-row-keys-build.md) adds its keys to this handler.
- **Cmd/Ctrl+K** opens Find, also from a text field. It does nothing while another dialog is open. In the open Find dialog it closes Find. Call `preventDefault`.
- **`1` to `3`** open the thread of that Focus slot in T3, like its card. An empty slot does nothing. They use the plain-key guard.
- **`/`** is not a page key. Leave it free.
- **Keys fold.** A "Keys" fold in the View panel, beside "Status icons": `n` Open next, Cmd/Ctrl+K Find (⌘K on macOS, Ctrl+K elsewhere), `1`–`3` open a Focus slot. The Find button tooltip names its key.

**Docs.** `SPEC.md` and `README.md` describe Find. `CONTEXT.md` has the term **Find**.

## Done when

- The Find button and Cmd/Ctrl+K open the dialog, light and dark, desktop and phone width.
- A query matches title, issue key, project, branch and PR number, with every word required, in match-quality then tree order.
- Enter opens the thread. Show in tree and Shift+Enter unfold the path, store the folds, scroll and flash the row, in the tree and the flat view.
- A result hidden by a view setting, and a settled result, show no Show in tree.
- Search settled threads lists matching settled threads in a Settled group, from `GET /find`.
- The empty input lists Focus and recent threads; the empty and no-match icon states show.
- Unit tests cover the match function (fields, every word, order, PR number) and the `/find` handler.
- One shared key handler holds `n`, Cmd/Ctrl+K and `1` to `3`. A test covers the guard: plain keys do nothing in a field, in an open dialog or menu, with the View panel open, or with a modifier; Cmd/Ctrl+K works in a field and not in the Send dialog.
- `1` to `3` open the Focus slot thread; an empty slot does nothing.
- The View panel shows the Keys fold.
- `bun run check` passes. `SPEC.md`, `README.md` and `CONTEXT.md` are updated. One draft PR.
