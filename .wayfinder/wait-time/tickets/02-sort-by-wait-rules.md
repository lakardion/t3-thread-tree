---
title: How do the waiting sections of the flat view sort by Wait?
type: grilling
status: open
assignee:
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
