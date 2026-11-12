---
title: Draw the stack rail around key groups of one PR stack
type: task
status: closed
assignee: claude (design-overhaul-09)
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

## Handed over from design-overhaul-08

- `ProjectCard` (`src/page/app.tsx`) maps `b.branches` to `GroupRow` in one `<ul>`. The rail wraps adjacent groups there. `GroupRow` returns a bare `ThreadRow` (one `<li>`) for a folded group and a `Collapsible` `<li>` for all other groups.
- `Branch` in `src/shared/tree.ts` has `repo?` now. Add `stack?` next to it.
- `.project-head` is in `src/page/index.css` in `@layer components`. Put `.stack-rail` there.
- The demo stack is four folded groups (`SHOP-412`, `SHOP-413`, `SHOP-415`, `SHOP-418`), so the rail holds four rows and no group header.
- `BuildInput.projects` is `Map<string, Project>` (`title`, `repo`) from `src/server/t3.ts`.

## Handed over from design-overhaul-10

- `ThreadNode` has a required `detail` field and `PrNode` has `title`, `additions`, `deletions` and `changedFiles`. A test that builds a `ThreadNode` by hand must set `detail` (see `test/attention.test.ts`).
- `ThreadRow` wraps its `<li>` in a `Collapsible`, and an open details block makes the row taller. Check the stack rail with a details block open inside it.
