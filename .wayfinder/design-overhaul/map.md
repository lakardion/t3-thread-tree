---
label: wayfinder:map
status: open
created: 2026-11-12
---

# Map: thread tree design overhaul, execution

Resume with `/wayfinder-implement .wayfinder/design-overhaul/map.md`. Run `/wayfinder-implement .wayfinder/design-overhaul/map.md <KEY>` after a key's branch is ready or merged.

## Destination

The thread tree page uses shadcn components on React + Tailwind. It has a chosen color palette, gradients and clear in-progress indicators, and it shows as much of the T3 thread data as is useful. Every route key is merged to local `main`. The user builds each key in its own `/start-issue` session. No flag: the app is local and personal.

## Route

1. design-overhaul-01 — shadcn migration
2. Build keys from `DESIGN-SPEC.md` — cut by [04](tickets/04-synthesize-design-spec.md), each blocked by 01 and 04.

The destination is reached when every route key is done and no map ticket is open.

## Stacks

None. The repo has no remote: a key is "in review" when its branch is ready, and "done" when it is merged into local `main`.

## Notes

- Mode: manual
- **Execution lives in this map** (override of plan, don't do): route keys deliver code.
- **Source:** markdown tickets in `tickets/`. The repo has no remote, so skip `pull` and `push` after a ticket write; commit only.
- **Spec:** `SPEC.md` holds the data, tree and runtime rules. `DESIGN-SPEC.md` (from 04) holds the visual design and wins over the UI section of `SPEC.md` where they differ.
- **Models:** 02 runs on Claude Opus. 03 runs on Codex `gpt-6.1-sol` through `delegate_task`. 04 runs on Claude Fable (`claude-fable-5-2`). 02 and 03 must not read each other's output.
- **Skills:** `vercel:shadcn` for 01 and the build keys; `technical-writing` for 04. Write in ASD-STE100. Terms from `CONTEXT.md`.
- **Check every UI key** with `bun run demo` in light and dark mode, plus `bun test` and `bun run typecheck`.

## Decisions so far

<!-- one line per closed map ticket -->

- shadcn adoption: switch the page from Preact to React 19, with Tailwind v4 through `bun-plugin-tailwind`. This replaces the "Preact, no plugin" rule in `SPEC.md` › Runtime and stack (chosen by the user at charting).
- Base: `build/thread-tree` was fast-forwarded into `main` at charting.

## Not yet specified

- The build keys after 04, and their order. 04 cuts them.

## Out of scope

- Write actions in T3 (settle, snooze, send, interrupt, launch), as in `SPEC.md`.
- Changes to the tree rules or the data source, unless `DESIGN-SPEC.md` needs a new field from the stream. Then the build key that needs it adds it.
