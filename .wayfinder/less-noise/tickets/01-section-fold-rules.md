---
title: How do the flat sections fold, and how does "Show snoozed threads" work?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

Settle the rules of M09 so that [the build key](03-section-fold-build.md) has no open choice.

## Brief

The reversal is accepted (see the map). Open choices:

- **Section folds.** Where is the fold state saved: with the tree folds (`closed` set in `localStorage`) or under its own key? Which sections start closed ("Idle and snoozed" and "Done", per M09)? What does a closed header show: the label, the count, and the status icons of its threads? Does a section that gets a new thread open itself? Does the fold-all button come back in the flat view, now that sections fold? How do folds behave with the "Needs you" filter and with "Last updated"?
- **Snoozed switch.** Does it apply in the flat view too, or only in the tree? Where is it: the View panel next to "Show settled threads", or elsewhere? The storage key. A snoozed thread with a pending request is `needs-input`, so it always shows; confirm. A hidden snoozed parent with visible subthreads: does the parent row show? What do the closed-row icons, counts and the Needs-you count do with hidden snoozed threads? Is the filter done on the page or on the server (settled is done on the server: `/events?settled=1`)?
- **Glossary.** Add a term for a section fold or a snoozed thread to `CONTEXT.md` if one is needed.

Code at `main`: `SECTIONS` in `src/page/view.ts`, `SETTLED_KEY` and the View panel in `src/page/app.tsx`. Read the code after the wait-time and status-groups stacks if they have merged.

When this ticket closes, write the `## Spec` and `## Done when` of [the build key](03-section-fold-build.md).

## Resolution

The user accepted every recommendation in one grilling round. Code read at `origin/main` `83fd3b5`: the wait-time and status-groups stacks are merged.

**Section folds**

- **Every status section folds.** At first, "Idle and snoozed" and "Done" are closed. All other sections are open.
- **Storage:** its own key `thread-tree:sections`, a JSON list of closed section keys (`SECTIONS` keys). With no key, the list is `["idle","done"]`. The tree folds (`thread-tree:closed`) do not change, and the tree fold-all does not touch the sections.
- **Closed header:** label, count and a chevron. No status icons. The count does not change when the section closes: it counts the matching threads, context rows left out.
- **No auto-open.** A new thread in a closed section changes only the count.
- **No fold-all in the flat view.** The header button stays "Group by".
- **Filter and sort.** The "Needs you" filter and "Last updated" do not change the folds. A closed section stays closed. With "Group by None" there are no sections and no folds. A closed section shows no rows, so its rows have no drag.

**"Show snoozed threads"**

- **Scope:** the tree and the flat view. In flat, it removes snoozed threads from "Idle and snoozed"; the label stays, and the section hides when it has no thread.
- **Place:** the View panel, right below "Show settled threads", label "Show snoozed threads". Key `thread-tree:snoozed`: `"0"` hides, any other value or no key shows. On by default.
- **What hides:** threads with `status === "snoozed"` only. A snoozed thread with a pending request has status `needs-input` (`statusOf` makes the request win), so it always shows.
- **Hidden parent with visible subthreads:** the parent stays as a **Context row**, as a spawner does under the "Needs you" filter.
- **Counts:** hidden threads leave every page count and mark: section counts, closed-row icons. The Needs-you count never holds a snoozed thread. The brief and the desktop notifications do not change.
- **Page filter**, in `pipeline` next to `onlyNeedsYou`. No server parameter.

**Glossary:** new term **Status section** in `CONTEXT.md`, added by the build key (local `main` is behind `origin/main`, so the term goes in with the code).
