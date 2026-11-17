---
title: Add "Open next"
type: wayfinder:task
status: in-review
assignee: damian.lucero
blocked-by: [03-open-next-rules, 04-row-wait-build, 05-sort-by-wait-build]
---

## Question

Build M19: one "Open next" control that opens in T3 the thread with the longest **Wait**, with the rules of [the Open next rules](03-open-next-rules.md).

## Spec

Rules from [the Open next rules](03-open-next-rules.md) › Resolution.

- **Target.** From all threads of the tree, subthreads included: status `needs-input`, `plan-ready` or `your-turn`, not settled. The filter, "Show settled", folds, layout and sort do not change it. Sort by `since`, oldest first; no `since` last; ties keep the tree order.
- **Skip memory.** In memory, keyed by thread id plus `since`. Skip a remembered thread. When all are skipped, clear the memory and take the top thread.
- **Header button.** Next to the "Needs you" filter. Icon plus "Open next"; icon only with an `aria-label` at phone width. Tooltip "<phrase> · <title> · <Wait>". With no target: disabled, tooltip "Nothing waits".
- **Key `n`.** No modifiers. Off when focus is in an input, a textarea or a contenteditable element, and when a dialog, a menu or the View panel is open.
- **Menu bar.** First item of the menu-bar menu: "Open next · <title>", hidden with no target. It uses the same target and the same skip memory as the page, so the button and the item open the same thread. The rest of the menu-bar menu does not change.
- It writes nothing to T3. It opens `t3code://threads/<environmentId>/<threadId>` (`threadUrl`, `src/desktop/runtime.ts`).
- The blocker on 05-sort-by-wait-build is forced: it keeps the order M04 → M05 → M19.
- Update `SPEC.md` and `README.md`.
- One draft PR in the stack 04 ← 05 ← 06. The user tests the stack and merges it.

## Done when

- The button, the key `n` and the menu-bar item open the same thread: the oldest Wait of the filter set, settled threads left out, subthreads included.
- A second press opens the next thread; when all were opened, it starts again at the top. A new Wait of an opened thread makes it a target again.
- With nothing to open, the button is disabled with "Nothing waits", `n` does nothing and the menu-bar item is hidden.
- `n` does nothing while the user types in a field or a dialog, a menu or the View panel is open.
- Unit tests cover the target order, the skip memory and the empty set.
- `SPEC.md` and `README.md` describe "Open next".
- `bun run check` passes. `bun run demo` looks right in light and dark mode, at desktop and phone width.
