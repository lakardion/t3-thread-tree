---
title: UI/UX design proposal A (Claude Opus)
type: research
status: open
assignee:
blocked-by: [01-shadcn-migration]
---

Run this ticket on **Claude Opus**. Do not read `research/03-*`. The two proposals must be independent.

## Question

How should the thread tree page look and behave, so the user sees at a glance what each thread is doing and what needs them?

## Brief

The app is the shadcn page from 01. Read `SPEC.md`, `CONTEXT.md`, `src/shared/tree.ts`, `src/server/t3.ts` and `src/page/`. Run `bun run demo` to see it.

Cover each of these:

1. **Information inventory.** List every thread and project field that the T3 shell stream sends (see `src/server/t3.ts` and the T3 Code source at `~/repos/t3code`). For each field, say if the page shows it now, and if it should. The user wants the page to show as much of the T3 data as is useful. You may challenge the "not shown" choices of ticket 005 (subagents, age, last message, "launched by" hints). Mark each such challenge.
2. **Color palette.** A named palette as shadcn CSS variables for light and dark mode, with the status colors. Give contrast ratios for text and status colors.
3. **Gradients.** Where gradients go and why (for example project headers, running rows, stack badges). Give the CSS.
4. **In-progress indicators.** How running, queued, starting and needs-input threads look, including motion and the reduced-motion form.
5. **Layout and density.** Row anatomy, hierarchy, spacing, typography, and the place of PRs and stacks.
6. **Components.** Which shadcn components to use for each part.

## Output

- `.wayfinder/design-overhaul/research/02-opus-proposal.md`: the proposal, in ASD-STE100.
- `.wayfinder/design-overhaul/research/02-opus-mockup.html`: one static mockup with demo data, light and dark.

Add a `## Resolution` with a link to both files, then set `status: closed`.
