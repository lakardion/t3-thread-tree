---
title: What does Find match, and how does the user pick a result?
type: grilling
status: closed
assignee: damian.lucero
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

## Resolution

Decided with the user. The build spec is in [Add Find](05-find-build.md).

- **Form:** a dialog, opened by a Find header button and Cmd/Ctrl+K. Full screen at phone width. Built with the shadcn `Command` (adds `cmdk`), with `shouldFilter={false}`.
- **Set:** the threads the tree has loaded, subthreads included. The "Needs you" filter does not limit Find.
- **Settled:** a last "Search settled threads" row, when the query is not empty and "Show settled threads" is off. It asks the server (`GET /find?q=`), and the matches show in a "Settled" group for the rest of the dialog session.
- **Match:** case-insensitive substring. Every query word must match the title, issue key, project label, branch or a PR number (`#123`). One shared match function for the page and the server. Fuzzy only if needed later.
- **Order:** match quality first (issue key or title start before a match inside a word), then tree order.
- **Row:** status icon, full title (wraps), a muted line with project, issue key and branch, Wait or age at the right, "in <parent title>" for a subthread. No PR badges.
- **Actions:** Enter opens in T3 and closes the dialog. "Show in tree" is a row button and Shift+Enter: it unfolds the path and stores the folds, scrolls, flashes the row for about 1.5 s.
- **Hidden rows:** a fold is opened. A row hidden by the "Needs you" filter, by hidden snoozed threads, or a settled result, gets no "Show in tree". Find never turns off a view setting.
- **Empty input:** the Focus list threads, then recent threads, up to 8. With none, an icon state with a hint.
- **No match:** an icon state ("No thread matches") plus the "Search settled threads" row.
