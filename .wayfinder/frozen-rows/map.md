---
label: wayfinder:map
status: open
created: 2026-11-13
---

# Map: Frozen rows, manual order and status motion, execution

Resume with `/wayfinder-implement .wayfinder/frozen-rows/map.md`. Run `/wayfinder-implement .wayfinder/frozen-rows/map.md <ticket>` after a PR opens or merges.

## Destination

Rows stay where they are: a live push never moves a project card, group or thread. New items append at the bottom. The user can drag projects, groups and threads into an order of their own. Status changes animate (icon, phrase, PR marks, a short change pulse), and rows enter and leave with motion. Every route key is merged to `main`. Autopilot threads build it.

## Route

Source: markdown tickets in `tickets/`. All keys touch `src/page/app.tsx` or the tree order, so they form one chain.

### Lane 1

1. [Order the tree by creation, new items at the bottom](tickets/02-stable-order.md)
2. [Animate status, phrase and PR mark changes](tickets/03-status-transitions.md) — after 02-stable-order (forced)
3. [Let the user drag projects, groups and threads into their own order](tickets/04-manual-reorder.md)
4. [Animate rows that enter and leave](tickets/05-row-enter-exit.md) — after 04-manual-reorder (forced)

The destination is reached when every route key is done and no map ticket is open.

## Stacks

## Notes

- Mode: autopilot
- **Run to completion.** Do not stop for the user, except for a real decision that the tickets and the spec do not answer. Then stop and ask (grilling). A choice the spec leaves open but that has a clear default is not a stop: take the default and name it in the PR body.
- **Auto-merge when green.** When `bun run check` passes, mark the PR ready and merge it to `main` (squash). The next key in the chain then rebases on `main`. A failing check is a stop only after you cannot fix it.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec; each key updates the spec for its own part. Each key that adds a visible feature updates `README.md` (see `CLAUDE.md`).
- **No activity sort.** The tree must never move a row because of activity. Only the user's drag, or an item that is added or removed, changes positions.
- **Reduced motion:** with `prefers-reduced-motion`, no animation. Every change still applies at once.
- **Prior research:** the dropped fluidity map's FLIP research (Web Animations API, spring via CSS `linear()`) is at commit `e6ff918`, file `.wayfinder/fluidity/research/01-animation-primitive.md` (`git show e6ff918:.wayfinder/fluidity/research/01-animation-primitive.md`). Use it as input, not as a decision.
- **Skills:** `vercel:shadcn` for UI work. Write in ASD-STE100.
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Base order:** creation time, oldest first, at all levels. A new project, group or thread appends at the end, so no existing row shifts.
- **Reorder:** drag at all three levels (project cards, groups in a project, threads in a group), with a keyboard path. Use a drag library, not plain HTML5 drag-and-drop; [the research ticket](tickets/01-drag-library.md) picks it.
- **Motion:** status icon and phrase, row enter and exit, a change pulse on a row whose status changed, and PR mark changes.

## Not yet specified

## Out of scope

- Reorder of subthreads under a parent thread. They keep the base order.
- Drag across sections, groups or projects (a thread into another group, a group into another project).
- Order sync across browsers or machines. The order lives in `localStorage`.
- Expand and collapse motion of groups and cards.
