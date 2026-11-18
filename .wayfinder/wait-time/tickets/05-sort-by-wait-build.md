---
title: Sort the waiting sections of the flat view by Wait
type: wayfinder:task
status: closed
assignee: damian.lucero
blocked-by: [02-sort-by-wait-rules, 04-row-wait-build]
---

## Question

Build M05: in the flat view with "Group by: Status", sort the Needs input, Plan ready and Your turn sections by **Wait**, with the rules of [the sort rules](02-sort-by-wait-rules.md).

## Spec

From [the sort rules](02-sort-by-wait-rules.md).

Order (`src/page/view.ts`):

- In the flat view with "Group by: Status", sort the units of the Needs input, Plan ready and Your turn sections by **Wait**, oldest first. Do this with "Manual" and with "Last updated". The other sections keep their order.
- A thread unit sorts by its own `since`. Subthreads do not count.
- A stack unit sorts by the oldest `since` of its threads whose status is in its section's status set.
- A unit with no `since` goes last. Ties keep the input order (stable sort). Use the same compare as the menu bar (`src/desktop/runtime.ts:49`).
- The tree view and "Group by: None" do not change.

Drag:

- Drag is off in the three sections, with both sort choices. Drag stays on in the other sections with "Manual".
- The stored flat order (`thread-tree:order`, list `flat`) does not change. A row that leaves a waiting section goes back to its stored position.

Docs:

- Update `SPEC.md:103` (manual order in the flat view) for the three sections, and `DESIGN-SPEC.md` if it describes the flat drag. Update `README.md` ("What you get").
- One draft PR in the stack 04 ← 05 ← 06. The user tests the stack with `bun run demo` and the real app, and merges it.

## Done when

- `view.ts` tests: the three sections sort oldest Wait first with "Manual" and "Last updated"; a no-`since` unit goes last; ties keep the input order; a stack sorts by the oldest Wait of its threads in the section's status set; a subthread's Wait does not move its parent; the other sections, the tree view and "Group by: None" keep their order.
- In `bun run demo`, light and dark, desktop and phone width: the waiting sections show the longest Wait at the top, and their rows do not drag; rows in the other sections still drag with "Manual".
- A row that stops waiting goes back to its stored flat position.
- `SPEC.md` and `README.md` are updated.
- `bun run check` passes. The draft PR is open, and the session hands off to the next key.
