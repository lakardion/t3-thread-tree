---
title: Where and how does the brief show on the page?
type: prototype
status: closed
assignee: damian.lucero
blocked-by: [03-ranking-rules-and-brief-shape]
---

## Question

Where does the Next-step brief show (inline panel above the tree, side drawer, or dialog), and how do the button, model dropdown, loading text animation, error, and stale links look?

## Brief

Make two or three layouts in the demo (`bun run demo`) with a fixed sample brief in the shape from 03. Show light and dark mode. The user picks one. Include the colour-coded kind chips, the copy button for `prompt`, and the empty state ("Nothing needs you right now").

## Resolution

The user picked **A: inline panel**. Prototype: branch `prototype/brief-layout`, file `src/page/brief-prototype.tsx` (commit `6735f79`). Main keeps only this decision.

- **Controls:** a "What's next" primary button with a Sparkles icon, joined to a model `Select` ("Claude Haiku", "Codex Luna") as one split control in the header, after the filter. The button is disabled while a run is active.
- **Panel:** a card between the header and the tree, with the project-header gradient. Head: Sparkles icon, "Next steps", a mono stamp "generated HH:MM · <model>", and a close button that hides the panel. The panel shows only after the first click.
- **Action row:** rank number, kind chip (fixed width), title (weight 650) with the reason in muted text on the same line, then the thread links below. A copy icon at the row end copies `prompt`. The prompt text shows only in the tooltip. No icon when `prompt` is `null`.
- **Kind chips:** dot plus label on a status-token wash. Answer = `needs-input` (amber), Merge = `done` (green), Unblock = `plan` (purple), Fix = `failed` (red), Review = `working` (blue), Clean up = `idle` (grey, muted text).
- **Thread links:** the live `StatusIcon` plus the title, truncated. A thread that is not in the live tree shows its title struck through in muted text. So the brief **saves each thread's title** when it is made.
- **Loading:** the text "Reading N threads…" with a per-letter weight wave and a shimmer (no motion under reduced motion), and a "Cancel" text button.
- **Error:** an alert with a red left edge, "The brief failed.", a "Retry" button, and the stderr tail in a mono box.
- **Empty:** "Nothing needs you right now."
