---
title: Fold the flat sections and add "Show snoozed threads"
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [01-section-fold-rules]
---

## Question

Build M09: the flat sections fold, and a "Show snoozed threads" switch hides snoozed threads.

## Gate

Start only after the wait-time stack and the status-groups stack are merged to `main`. Branch from `main`. This key is the bottom of the stack 03 ← 04 ← 05.

## Spec

From [the fold rules](01-section-fold-rules.md). Read the code at `origin/main` again first.

**Section folds** (flat view, "Group by Status")

- Each status section header (`FlatRow`, the `kind === "section"` branch in `src/page/app.tsx`) is a fold button with a chevron, the label and the count. It toggles one section key in a new state `sections`, stored under `thread-tree:sections` as a JSON list of closed `SECTIONS` keys. With no stored key, the list is `["idle","done"]`. Keep it apart from `closed` (`thread-tree:closed`).
- A closed section keeps its header and count, and shows none of its units. The count is the same open or closed. Drop the units of a closed section from `view.flat`, so `flatLists` gives them no drag and the row signature skips them.
- A new thread in a closed section does not open it. The "Needs you" filter and the sort do not change the folds. "Group by None" has no sections and no folds. No fold-all in the flat view.
- Use the header look of a tree fold for the chevron and focus ring. The header keeps its `view-transition-name`.

**"Show snoozed threads"**

- A switch in the View panel, right below "Show settled threads": label "Show snoozed threads", id `snoozed`. State stored under `thread-tree:snoozed`; `"0"` hides, anything else shows. On by default.
- Off: a page step in `pipeline`, next to `onlyNeedsYou`, drops threads with `status === "snoozed"` in the tree and in the flat view. A hidden thread with a visible subthread stays as a **Context row** (keep it the way `keepThreads` keeps a spawner, with the muted look). A snoozed thread with a pending request has status `needs-input` and always shows.
- Hidden threads leave the section counts and the closed-row icons, because both read the filtered view. The Needs-you count, the Dock badge, the brief and the notifications do not change. No server parameter.

**Docs**

- `SPEC.md`: tree rule 3 (snoozed threads stay visible, unless "Show snoozed threads" is off); the flat-view paragraph ("The flat list has no folds") and the View panel list; add the two keys.
- `DESIGN-SPEC.md` › Flat view › Section headers: a header folds; "Idle and snoozed" and "Done" start closed.
- `CONTEXT.md`: add after **Context row**:

  ```
  **Status section**:
  A group of the flat view, with "Group by Status", that holds the threads of one or more statuses, most urgent first. Its header counts the threads that match it. It folds.
  _Avoid_: status group, bucket
  ```

- `README.md` › "What you get": the section folds and the snoozed switch.

## Done when

- With "Group by Status" and no stored key, "Idle and snoozed" and "Done" are closed and show their counts; the other sections are open.
- A click on a header opens or closes it, and the state stays after a reload. The tree folds do not change.
- A closed section shows no rows and its rows have no drag; its count equals the open count.
- With "Show snoozed threads" off, no `snoozed` row shows in the tree or the flat view, and the counts drop them. A snoozed thread with a pending request still shows. A snoozed parent with a visible subthread shows as a muted context row.
- The switch is on with no stored key.
- Unit tests cover the snoozed filter (`test/`, next to `attention.test.ts`) and the closed-section drop in the flat sequence.
- `bun run check` passes. `bun run demo` checked in light and dark, desktop and phone width.
- `SPEC.md:72` (tree rule 3), the `SPEC.md` flat-view paragraph, `DESIGN-SPEC.md` › Flat view, `CONTEXT.md` and `README.md` updated.
- One draft PR from `main`, the bottom of the stack 03 ← 04 ← 05.

## Result

Merged to `main` in [PR #82](https://github.com/lakardion/t3-thread-tree/pull/82) as `37b1cde`.
