---
id: "006"
title: Build the Watched labels setting and the Label pill
type: wayfinder:task
status: in-review
assignee: claude (pr-label-pill-06)
blocked-by: [005-label-data-build]
---

## Question

Build the page half of Label pills: the Watched labels fold in Settings and the Label pill in Tree and Flat rows.

## Brief

Stack on the branch of [Build the label data path on the server](005-label-data-build.md). One draft PR. `bun run check` passes. Update `README.md` ("What you get": the pill and the Settings fold, next to "Linear links"), the row anatomy table in `DESIGN-SPEC.md` › Thread row (a "Label pill" line before "PR chips"), and `SPEC.md` when the build changes a fact. Use `vercel:shadcn` for the UI. Look at it with `bun run demo`, light and dark, desktop and phone width.

## Spec

`SPEC.md` › Label pills › Watched labels setting, Match and Label pill. Look and code to copy from: branch `prototype/label-pill-look`, `src/page/label-pill.prototype.tsx`, variant C with `color=fill` and `name=short` (`initials`, `ink`, the `Badge` classes).

- **Setting** (`src/page/app.tsx`): a "Watched labels" `Fold` after "Linear links", in the form of the Linear form. Store under `thread-tree:labels`. Add `labels=` to the `EventSource` URL when the list is not empty, and open the stream again on a change.
- **Pill:** one per Tree and Flat row, in the right group before the PR chips. Count the open PRs of the row, not a settled row. Order by Watched-label order, one name once, "+N" for the rest. Tooltip "<name>: #<PR>" joined with " · ". A `null` color uses the `secondary` badge colors.
- **Check:** in the demo with the three prototype names saved, the example rows of [How does a Label pill read in the row?](002-label-pill-look.md) › Resolution show as listed there. With an empty list, no row shows a pill and `/events` has no `labels=`.

## Handed over from pr-label-pill-05

- `parseLabels(s)` in `src/shared/tree.ts` already splits, trims and drops empty names. Use it for the Settings field, so the page and the server parse the list the same way.
- `type Label = { name: string; color: string | null }` is exported from `src/shared/tree.ts`; `PrNode.labels` holds only the watched matches, in the PR's own label order (sort by Watched-label order on the page).
- `bun run demo` with `labels=ready-for-review,needs-qa-on-staging-before-merge,do-not-merge` serves the prototype labels.
