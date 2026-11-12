---
title: UI/UX design proposal B (OpenAI Sol)
type: research
status: closed
assignee: codex (design-overhaul-03)
blocked-by: [01-shadcn-migration]
---

Run this ticket on **Codex `gpt-6.1-sol`**. Start it with `delegate_task` (provider `codex`, model `gpt-6.1-sol`). Do not read `research/02-*`. The two proposals must be independent.

## Question and brief

Use the same question and brief as [02](02-design-proposal-opus.md), sections "Question" and "Brief". The brief has six parts: information inventory, color palette, gradients, in-progress indicators, layout and density, and components.

## Output

- `.wayfinder/design-overhaul/research/03-sol-proposal.md`: the proposal, in ASD-STE100.
- `.wayfinder/design-overhaul/research/03-sol-mockup.html`: one static mockup with demo data, light and dark.

Add a `## Resolution` with a link to both files, then set `status: closed`.

## Resolution

Completed the independent [Slate signal proposal](../research/03-sol-proposal.md) and [static light and dark mockup](../research/03-sol-mockup.html).

The proposal covers the stream field inventory, color variables and contrast ratios, gradients, status indicators, layout and shadcn components. It marks challenges to the rough tree UI choices. The synthesis ticket can use this proposal as one input. The proposal does not select the final design.

Checked the demo on port 4776 in light and dark mode. Rendered the mockup at 728 and 390 pixels wide. All 18 tests and typechecking passed. No app source files changed.
