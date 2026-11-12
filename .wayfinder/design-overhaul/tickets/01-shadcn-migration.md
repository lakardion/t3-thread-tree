---
title: Move the page to React + Tailwind and adopt shadcn components
type: task
status: open
assignee: claude (design-overhaul-01)
blocked-by: []
---

## Goal

The page uses shadcn components on React 19 and Tailwind v4. The page looks and behaves as it does now. This key changes the component base, not the design.

## Scope

- Replace Preact and `@preact/signals` with React 19. Keep the `Tree` type in `src/shared/tree.ts` unchanged.
- Add Tailwind v4 through `bun-plugin-tailwind` in the Bun HTML build. Run `shadcn init` (CSS variables, neutral base). Light and dark themes come from the shadcn tokens.
- Use shadcn components for the existing parts:
  - project and group rows → `Collapsible`
  - stack badge and snoozed badge → `Badge`
  - status dot tooltip → `Tooltip`
  - settled toggle → `Switch` with a label
  - T3-down and token banner → `Alert`
- Keep the existing behavior: closed-row Set in `localStorage`, SSE render, reduced motion, deep links.
- Update `SPEC.md` › Runtime and stack and `README.md` for the new stack.

## Done when

- `bun test` and `bun run typecheck` pass.
- `bun run demo` shows the same tree as `docs/tree-light.png` and `docs/tree-dark.png`, with shadcn styles. Replace the two screenshots.
- No Preact import is left in the repo.
