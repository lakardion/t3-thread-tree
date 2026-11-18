---
id: "004"
title: Do separate or combined views make active work easier to scan?
type: prototype
status: closed
assignee: damian.lucero
blocked_by: ["003"]
---

## Question

Can an engineer find a PR or issue and open the right T3 thread faster with separate GitHub and Linear views or with one combined view?

Prototype both options using the same sample. Include a PR stack, several threads linked to a single item, a thread linked to both a PR and a Linear issue, and a waiting or snoozed thread. Try each design on desktop and at phone width. Decide where the overview sits relative to Tree and Flat, how items are grouped and ordered, and where clicks on an item and on a thread lead. [Current page spec](../../../SPEC.md), [current page UI](../../../src/page/app.tsx).

Close after the engineer uses both prototypes to find an item and reach its thread. Link the prototypes and record the chosen layout and navigation rules.

## Resolution

Ruled out of scope on 2026-11-18. The engineer tried three overview layouts and dropped the overview: no PR or Linear sections, no overview view. Grouping the main view by Linear project and milestone ([How does the main view group by Linear project and milestone?](006-group-by-linear-project.md)) is the part of this map that matters.

The three layouts were A, separate PR and Linear tabs; B, one view with a PR section and a Linear section; C, Linear issues that hold their PRs. Prototype: branch `prototype/overview-layout` (commit `50c5a26`, `src/page/overview.prototype.tsx`). Run `PORT=4823 bun run demo` on that branch and open `?prototype=overview&variant=A|B|C`.
