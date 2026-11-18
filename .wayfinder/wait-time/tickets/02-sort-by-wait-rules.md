---
title: How do the waiting sections of the flat view sort by Wait?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: [01-row-wait-look]
---

## Question

When the flat view groups by status, how do the Needs input, Plan ready and Your turn sections sort by **Wait**, and what happens to the manual order there?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M05. The review asks for oldest Wait first in these three sections.

Decide:

- **Reversal.** `SPEC.md:103` says that "Manual" keeps the tree order in the flat list and that a row drags inside its section. Confirm with the user that the sort by Wait overrides the manual order in these three sections.
- **Sort menu.** Does the Wait order apply with "Manual", with "Last updated", or with both?
- **Drag.** Is drag off in these three sections, as it is in "Last updated"? What happens to the stored flat order of their rows?
- **No Wait.** Where does a row with no `since` go (the guest message case, and any case that [the row look](01-row-wait-look.md) leaves)? The menu bar puts it last (`src/desktop/runtime.ts:49`).
- **Stacks and subthreads.** A stack goes to the section of its most urgent thread and moves as one block. Which Wait sorts the block? Subthreads stay under their parent.
- **Tree view.** Confirm that the tree view keeps its order.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](05-sort-by-wait-build.md) from the answer.

## Resolution

The user agreed to these rules:

- **Reversal confirmed.** In the flat view with "Group by: Status", the Needs input, Plan ready and Your turn sections sort by **Wait**. This overrides the manual order of `SPEC.md:103` in these three sections only. The other sections keep their order.
- **Sort menu.** The Wait order applies with "Manual" and with "Last updated". The menu changes only the other sections.
- **Drag.** Drag is off in the three sections. The stored flat order (`thread-tree:order`, list `flat`) stays unchanged, so a row that stops waiting goes back to its stored position. Drag stays on in the other sections with "Manual".
- **Order.** Oldest Wait first. A row with no `since` (a guest message) goes last. Ties keep the input order (the manual order with "Manual", the `lastRun` order with "Last updated").
- **Stacks.** A stack sorts by the oldest Wait of its threads whose status is in its section's set. Example: a stack in Needs input sorts by its oldest needs-input thread.
- **Subthreads.** They stay under their parent and do not change its position. The parent's own Wait sorts the unit.
- **Tree view and "Group by: None".** They keep their order, with no Wait sort.
