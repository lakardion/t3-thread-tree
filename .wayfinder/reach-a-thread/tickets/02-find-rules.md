---
title: What does Find match, and how does the user pick a result?
type: grilling
status: open
assignee:
blocked-by: []
---

## Question

What does the Find control match, how does it show results, and what do Enter and "Show in tree" do?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M22. The review proposes: a Find control and Cmd/Ctrl+K; match title, issue key, project and branch from the tree data; full titles and statuses in the results; Enter opens the thread in T3; "Show in tree" opens its folded place.

Decide:

- **Form.** A dialog (shadcn `Command`) or an inline field in the header. Phone width.
- **Set.** Active threads only, or settled too? Subthreads? Does the "Needs you" filter apply?
- **Match.** Substring or fuzzy. Which fields, and the order of results (status, Wait, tree order).
- **Result row.** Status icon, full title, project, issue key, Wait.
- **Actions.** Enter opens in T3. "Show in tree": unfold the project, the key group and the stack, scroll to the row, mark it for a moment. Does it change the stored folds?
- **Empty and no match** states.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](05-find-build.md) from the answer.
