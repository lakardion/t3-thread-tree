---
title: Add the status model and the row data to the tree
type: task
status: in-review
assignee: claude (design-overhaul-06)
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec]
---

Route key `design-overhaul-06`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

The backend sends the eleven statuses of `DESIGN-SPEC.md` › Status model, with `phrase`, `since`, and the row fields of `ThreadNode` and `PrNode`.

## Scope

- Extend `decodeThread` in `src/server/t3.ts` with the stream fields in the spec rows Status, Elapsed time and PR marks.
- Change `Status`, `ThreadNode` and `PrNode` in `src/shared/tree.ts` to the spec shape, without `detail`, `Branch.repo` and `Branch.stack`. Those fields come with the keys that draw them.
- Change `statusOf` in `src/server/build-tree.ts` to the ordered rules of the spec, and set `phrase`, `since`, `key`, `updatedAt`, `settled` and `input`.
- Add tests for each status rule, the request phrases, and the unseen rule.
- Keep the page as it is: map the new statuses to the current dot colors and labels so that the typecheck passes.
- Add a thread for each status to `scripts/demo.ts`.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- `bun test` covers each row of the status table and the request table.
- The demo shows each status with its phrase in the dot tooltip.
