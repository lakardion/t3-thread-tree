---
title: Apply the Harbor tokens, the theme choice and the page column
type: task
status: closed
assignee: claude (design-overhaul-05)
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec]
---

Route key `design-overhaul-05`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

The page uses the tokens of `DESIGN-SPEC.md` › Tokens in light and dark mode, with a System / Light / Dark choice. The tree keeps its current rows.

## Scope

- Replace the tokens in `src/page/index.css` with the tokens of the spec. Register the `--status-*` and `--pr-merged` tokens in `@theme inline`.
- Change the `dark` variant to the `.dark` class. Add the inline theme script to `index.html` and the theme `Select` to the header (`thread-tree:theme`).
- Map the six current statuses to the new tokens: `running` to `working`, `completed` to `done`, `cancelled` to `failed`, `snoozed` to `idle`.
- Apply the page column (1200 px maximum), the fonts and the focus ring of the spec. Remove lowered text opacity: use `--muted-foreground`, and `grayscale` for the disconnected tree.
- Replace `SPEC.md` › UI with a short summary and a link to `DESIGN-SPEC.md`. Correct the snooze precedence.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- The demo shows the Harbor colors in light and dark mode, and the theme choice survives a reload with no flash.
- No text on the page has lowered opacity.
