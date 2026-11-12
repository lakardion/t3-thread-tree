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

## Handed over from design-overhaul-07

- The "+N" count in `ThreadRow` (`src/page/app.tsx`) is a plain `<span>`. This key makes it the button that opens the details block.
- Key 07 added no button to the row, so it added no touch-target rule. The 44 px touch target of `DESIGN-SPEC.md` › Narrow screens is for the details button and the "+N" button of this key.
- Below 720 px the right group of the row wraps to its own line (`max-[720px]:` classes on the row). Put the details button in that group.

## Handed over from design-overhaul-11

- `ThreadRow` in `src/page/app.tsx` reads the `NeedsOnly` context and has a `dim` value for the muted spawner row of the "Needs you" filter. Keep both when the row gets the details button.
- With the filter on, a thread row can leave the page while its details block is open. Its id can stay in the Set of open blocks.
- The shadcn CLI wrote `import { cn } from "cn"` in the new components and added the `cn` npm package. Set the import to `@/lib/utils` and run `bun remove cn`.

## Handed over from design-overhaul-08

- `ThreadRow` has an optional `chip` prop for a folded key group. Below 720 px, the title of a row with a chip takes its own line (`basis-full`, 20 px left padding), below the phrase and the chip. Check the details button and the indent of the details block on such a row at 390 px.
- The body of a project card has 6 px padding, and the card has `overflow-hidden`. Check that the focus ring of the details button is not clipped.
