---
label: wayfinder:map
status: closed
created: 2026-11-16
---

# Map: find the next improvements to the thread tree

Resume with `/wayfinder .wayfinder/improvements/map.md`. The build of all items is tracked in the [improvements program map](../improvements-program/map.md).

## Destination

An ordered list of all improvements (UX, UI, new features and bugs) from both reviews, grouped into efforts the user chose. Each item is ready to become its own map or `/start-issue` key. The map ends when the user has ordered and grouped the list; it builds nothing.

## Notes

- **User profile.** The user is an engineer who runs many T3 Code threads at the same time and gets overwhelmed when too many are up. The app exists to help them focus and to see what to continue next. Judge every idea against this: less noise, a clear next step, low effort to re-enter a thread.
- **Models:** 01 runs on Claude Opus (native `Agent`). 02 runs on Codex `gpt-6.1-sol` through `delegate_task`. 01 and 02 must not read each other's output.
- **Look at the app:** `bun run demo` with `PORT=4775` (Opus) or `PORT=4776` (Sol), in a browser, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `grilling` + `domain-modeling` for 04. 03 runs on Claude Fable and keeps every finding (dedupe, not filter), by user choice. Write in ASD-STE100. Terms from `CONTEXT.md`.
- Source is local markdown (see `.wayfinder/README.md`). Commit after a ticket write.

## Decisions so far

<!-- one line per closed ticket -->

- [Improvement review A (Claude Opus)](tickets/01-review-opus.md): top pick is wait time on rows that need you, then an "Open next" key; also two "Group by status" bugs.
- [Improvement review B (OpenAI Sol)](tickets/02-review-sol.md): top pick is also wait time and status phrase on the row, then a Now and Next working set; also a status-group placement bug.
- [Merge the two reviews into one deduplicated list](tickets/03-pick-shortlist.md): 23 items, nothing dropped; 8 come from both reviews, and wait time on the row tops both.
- [Order the merged list and group it into efforts](tickets/04-order-and-group.md): 23 items in 9 efforts, ordered A, B, C, D, F, E, G, H, I; M08 accepted; one PR per item for rollback.
- Base: local `main` was fast-forwarded to 0.1.7 (`5bf8567`) so both reviews see the same build.

## Not yet specified

None.

## Out of scope

- Building any improvement. Each chosen item gets its own map or key.
