---
title: Draw project cards, fold single-thread key groups, add the skeleton
type: task
status: open
assignee:
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
