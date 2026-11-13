---
title: Build the "What's next" button and the inline brief panel
type: task
status: closed
assignee: claude
blocked-by: [07-brief-endpoints]
---

## Question

Build the page part from the resolution of ticket 04: the split button with the model dropdown (saved in `localStorage`), the inline panel with its loading, error, empty and brief states, the kind chips, the copy icon, and the live thread links.

## Brief

Rewrite from the prototype (branch `prototype/brief-layout`); do not copy it. Use `vercel:shadcn`. Check with `bun run demo` in light and dark mode, plus `bun test` and `bun run typecheck`. HITL for the final look.

## Resolution

Built in [src/page/brief.tsx](../../../src/page/brief.tsx) (`BriefControls`, `BriefPanel`), wired in [src/page/app.tsx](../../../src/page/app.tsx), with the loading animation in [src/page/index.css](../../../src/page/index.css). The user approved the final look.

- **State:** `App` reads the named SSE event `brief` on the existing `/events` stream and fetches `/brief/clis` once. The model pick is saved as `thread-tree:cli`; a saved pick that is not offered falls back to the first CLI.
- **Panel:** it shows when the brief state is not `idle`. The close button hides it until the next click on "What's next".
- **Live links:** the map of live threads comes from the full tree, not the "Needs you" filter, so a filtered-out thread keeps its live link.
- **Error:** the alert also shows the error text next to "The brief failed.", because a timeout or a parse error has an empty stderr tail.
- **Checked** with `bun run demo` in light and dark mode, at phone width, and with `BRIEF=failed`, `BRIEF=empty` and `CLIS=0`. `bun test` (122 pass) and `bun run typecheck` are green.
