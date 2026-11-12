---
title: Synthesize the two proposals into DESIGN-SPEC.md
type: grilling
status: closed
assignee: Damian Lucero
blocked-by: [02-design-proposal-opus, 03-design-proposal-sol]
---

Run this ticket on **Claude Fable** (`claude-fable-5-2`).

## Goal

Read both proposals and both mockups in `research/`. Write one final design spec at the repo root, `DESIGN-SPEC.md`. Then cut the build keys.

## Steps

1. Compare the two proposals for each part of the brief: inventory, palette, gradients, in-progress indicators, layout, and components. For each part, take one proposal, merge the two, or reject both. Give one reason for each choice.
2. Show the open choices to the user (`AskUserQuestion`) before you write. Include the palette choice and each challenge to a 005 "not shown" rule.
3. Write `DESIGN-SPEC.md` with the `technical-writing` skill. It must give exact tokens and CSS, and a row anatomy for each status. It must also give the new stream fields the backend must send, if any.
4. Cut the build keys as tickets `05-…` onward in `tickets/`. Each key must be one reviewable change. Each key is blocked by 01 and 04. Add the keys to the map's Route, in order, and remove the line in "Not yet specified".

Add a `## Resolution` with a link to `DESIGN-SPEC.md` and the new keys, then set `status: closed`.

## Resolution

The final design is in [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Its "Choices" section gives each choice and its reason.

The user decided these points:

- Palette: Harbor, with the stronger borders of proposal B and no lowered text opacity.
- Row: one line with a status column (icon, phrase, elapsed time). Details: an inline block with the curated set.
- Motion: working and needs input only. Projects: cards with a neutral gradient.
- Layout: fold single-thread key groups, stack rail, 1200 px column. Header: attention summary, "Needs you" filter, theme choice, skeleton.
- "Not shown" rules: update age and the launched-by hint are overturned. The last message and the subagent counts stay not shown.
- A pending request wins over snooze. Unseen completions show as "Your turn" with a bold title.
- On the row: PR marks only. The model, tags, pin, limit and stop data are in details.

Build keys, in route order:

1. [Apply the Harbor tokens, the theme choice and the page column](05-palette-and-theme.md)
2. [Add the status model and the row data to the tree](06-status-model.md)
3. [Draw the thread row: status column, PR marks, age and motion](07-thread-row.md)
4. [Draw project cards, fold single-thread key groups, add the skeleton](08-project-cards-and-fold.md)
5. [Draw the stack rail around key groups of one PR stack](09-stack-rail.md)
6. [Add the inline details block](10-details-block.md)
7. [Add the attention summary and the "Needs you" filter](11-attention-header.md)
