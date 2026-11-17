---
title: How do the flat sections fold, and how does "Show snoozed threads" work?
type: grilling
status: open
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
