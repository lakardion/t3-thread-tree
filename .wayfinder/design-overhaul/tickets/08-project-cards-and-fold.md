---
title: Draw project cards, fold single-thread key groups, add the skeleton
type: task
status: open
assignee: claude (design-overhaul-08)
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec, 07-thread-row]
---

Route key `design-overhaul-08`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

Projects are cards, groups follow `DESIGN-SPEC.md` › Groups, and the first load shows a skeleton.

## Scope

- Add `card` and `skeleton` with the shadcn CLI.
- Project card with the neutral header gradient, chevron, monogram, name and repository. Decode `repositoryIdentity` and send `Branch.repo`.
- Fold a key group with one top-level thread: no header row, key chip on the row, key prefix removed from the title. Add a test for the prefix removal.
- Closed projects and groups show one status icon for each thread.
- Three row skeletons before the first push.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- A key group with one thread uses one row. A key group with two threads keeps its header.
- Closed rows stay closed after a push and after a reload.

## Handed over from design-overhaul-07

- The nested thread list in `ThreadRow` (`src/page/app.tsx`) still indents 18 px. The 16 px rule of `DESIGN-SPEC.md` › Groups is for this key.
- The key chip goes in `ThreadRow` between the phrase column and the title. Use the `CHIP` class string for the 6 px radius and the 11 px text.
- `StatusIcon` is the one status shape for a row and for a closed branch. It turns only inside `.thread-row`, so a closed branch shows still icons.
