---
title: Remove the edge and the wash from working rows
type: wayfinder:task
status: closed
assignee: claude (less-noise-04)
blocked-by: [03-section-fold-build]
---

## Question

Build M13: a `working` row has no colored left edge and no wash. The turning icon stays.

## Spec

Decided at charting (see the map). A working thread needs nothing from the user. The edge and the wash mean "look here", and the turning icon already says "alive".

- `src/page/index.css`: remove the `.thread-row[data-status="working"]` background rule and its `::before` edge (at `main`, near line 249 and in the shared `::before` selector near line 220). Keep the `needs-input` edge and wash, and the `[data-waiting]` edge and wash of a closed row.
- Keep the turning icon of `working` (`.thread-row[data-status="working"] .status-icon`), with its reduced-motion and T3-down rules.
- `main` gave flat rows a project-colored left edge (#76). Check that it still shows on a working row, and that no empty gap or stray edge is left.
- `DESIGN-SPEC.md`: remove the working gradient from › Gradients ("Five gradients" becomes four), and update the Motion and Gradients lines of the choices table if they name the working wash. `SPEC.md` if it names the wash.
- `README.md`: update the line that describes the row colors, if one exists.

## Done when

- In `bun run demo`, light and dark, desktop and phone width, tree and flat: working rows show no edge and no wash, and their icon turns; needs-input rows and closed rows that hide a waiting thread keep the amber edge and wash.
- `bun run check` passes.
- `DESIGN-SPEC.md` (and `SPEC.md`, `README.md` where they name it) updated.
- One draft PR, stacked on the branch of 03-section-fold-build.

## Result

Merged to `main` in [PR #83](https://github.com/lakardion/t3-thread-tree/pull/83) as `eabdd3f`.
