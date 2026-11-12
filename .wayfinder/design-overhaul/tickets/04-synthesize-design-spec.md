---
title: Synthesize the two proposals into DESIGN-SPEC.md
type: grilling
status: open
assignee:
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
