---
title: Draw the stack rail around key groups of one PR stack
type: task
status: open
assignee:
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec, 08-project-cards-and-fold]
---

Route key `design-overhaul-09`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

Key groups that share a PR stack sit in one rail with a label row, as in `DESIGN-SPEC.md` › Stack rail.

## Scope

- Decode `pullRequests[].stack.base`. Send `Branch.stack` (`id`, `total`, `base`) from `build-tree.ts` for each key group in a stack. Add a test.
- The page wraps adjacent groups with the same stack id in `.stack-rail`, with the label row. A folded group stays in the rail.
- The order of the groups does not change.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- The demo stack shows one rail, the label "PR stack · N PRs", and the base when the data has it.
- A group that is not in a stack has no rail.
