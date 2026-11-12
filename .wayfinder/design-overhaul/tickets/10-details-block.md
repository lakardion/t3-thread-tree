---
title: Add the inline details block
type: task
status: open
assignee:
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec, 07-thread-row]
---

Route key `design-overhaul-10`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

Each thread row has a details button that opens the block of `DESIGN-SPEC.md` › Details block.

## Scope

- Add `button` with the shadcn CLI.
- Decode the stream fields in the spec row Details. Send `ThreadNode.detail` and the details fields of `PrNode`.
- `launchedBy`: set when the thread has a spawner and does not nest under it. Add a test.
- The details button and the block (`Collapsible`), with the open ids in one Set in memory. The "+N" count becomes a button that opens the block.
- A line shows only when its value is present.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- An open block stays open after a push.
- A launched thread under "No issue key" shows "Launched by" with a link.
- The block shows no last message and no subagent or background task data.
