---
label: wayfinder:map
status: open
created: 2026-11-13
---

# Map: Fluid tree updates and the floating row

Resume with `/wayfinder .wayfinder/fluidity/map.md`.

## Destination

Tree changes animate instead of jumping, and the element under the pointer (or keyboard focus) does not move while the user points at it. The change is merged to local `main`.

## Notes

- **Execution lives in this map** (override of plan, don't do): after the decision tickets close, build tickets deliver the code.
- **Source:** markdown tickets in `tickets/`. Commit only after a ticket write. Do not pull or push.
- **Root cause today:** every live push (on change, and every 30 s) re-sorts projects, groups, and rows by latest activity (`src/server/build-tree.ts`). Rows appear and go with no motion.
- **Skills:** `research` for research tickets, `prototype` for the prototype ticket, `grilling` + `domain-modeling` for grilling tickets, `vercel:shadcn` for UI build. Write in ASD-STE100.
- **Check every UI change** with `bun run demo` in light and dark mode, plus `bun test` and `bun run typecheck`.

## Decisions so far

<!-- one line per closed map ticket -->

- [Which animation primitive animates the tree and holds the floating row?](tickets/01-animation-primitive.md): hand-written FLIP on the Web Animations API, spring via CSS `linear()`; no dependency. View Transitions and `motion` cannot hold a hovered element.

Decided at charting (by the user):

- **Shifts in scope:** (a) re-sort on a live push, (b) rows added or removed on a live push, (c) a row that changes height in place, (d) the user's own expand and collapse.
- **Floating row (target):** the new layout applies at once. The hovered element keeps its screen position (it "floats" over the list). When the pointer leaves, it springs into its new slot with a small overshoot. Other rows can slide under it for a moment.
- **What can float:** thread rows, group rows, and project cards (the whole card when the pointer is on its header).
- **Hand-off:** about 150 ms grace before a left row releases, so a pointer sweep does not chain bounces. The prototype tunes the value.
- **Keyboard focus** floats the same as hover.
- **Signal:** a soft shadow "lift" on the floating element while it is out of its slot. No paused-updates chip, unless the whole-tree freeze wins the prototype.
- **Reduced motion:** no animation. The hold still applies.

## Not yet specified

- **Build slicing:** FLIP primitive, floating hold, add/remove motion, expand/collapse motion (`tw-animate-css` on Radix Collapsible). Graduates into build tickets when the research and prototype tickets close.
- **A removed row:** the app must keep a removed row's data for an exit animation. A hovered row that settles or leaves the "Needs you" filter probably stays until the pointer leaves, then fades out.
- **Card clipping:** `ProjectCard` has `overflow-hidden`, so it clips a held row that ends up outside its card. The prototype shows if this matters.
- **SPEC.md / DESIGN-SPEC.md section** for the behavior, written from the closed tickets.

## Out of scope

- Write actions in T3, as in `SPEC.md`.
