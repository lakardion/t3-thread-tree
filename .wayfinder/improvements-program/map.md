---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: improvements program, execution

The one map that tracks all 23 items of the improvements review. Resume with `/t3-handoff .wayfinder/improvements-program/map.md`, or `/wayfinder-implement .wayfinder/improvements-program/map.md` for the route keys.

## Destination

All 23 items of [the merged review](../improvements/research/03-merged-review.md) are merged to `main`, in the 9 efforts of [Order the merged list](../improvements/tickets/04-order-and-group.md). Efforts with open choices run in their own map; this map holds one ticket per such effort. Efforts with no open choices are route keys here. The map ends when every effort ticket is closed and every route key is merged.

## Route

Efforts in the chosen order. A, B, D, E, G and I are map tickets (each runs its own map). C, F and H are route keys.

| # | Effort | Items | Where |
| --- | --- | --- | --- |
| 1 | A. Wait time on the row | M04, M05, M19 | [ticket](tickets/01-effort-a-wait-time.md) → [wait-time map](../wait-time/map.md) |
| 2 | B. Status groups that agree | M01, M07, M06 | [ticket](tickets/02-effort-b-status-groups.md) → [status-groups map](../status-groups/map.md) |
| 3 | C. Small bugs | M02, M03 | Lane 1 |
| 4 | D. Less noise | M09, M13, M16 | [ticket](tickets/04-effort-d-less-noise.md) → [less-noise map](../less-noise/map.md) |
| 5 | F. Last message on demand | M08 | Lane 2 |
| 6 | E. A brief that helps you choose | M11, M10, M12, M14, M15 | [ticket](tickets/06-effort-e-brief.md), after F |
| 7 | G. Get to a thread fast | M20, M22, M21 | [ticket](tickets/07-effort-g-reach-a-thread.md) |
| 8 | H. Phone and tab polish | M18, M17 | Lane 3 |
| 9 | I. Needs-you window | M23 | [ticket](tickets/09-effort-i-needs-you-window.md), after A |

### Lane 1

1. [Fix the stop numbers of a filtered PR stack](tickets/03-key-m02-stack-numbers.md) (M02)
2. [Close the "Group by: Status" tooltip](tickets/10-key-m03-group-tooltip.md) (M03) — after 03-key-m02-stack-numbers (forced)

### Lane 2

1. [Show the last message on demand, in details and the send dialog](tickets/05-key-m08-last-message.md) (M08)

### Lane 3

1. [Show the Needs-you count in the tab title and favicon](tickets/08-key-m18-tab-count.md) (M18)
2. [One menu for Sort, Layout and Group by on a phone](tickets/11-key-m17-phone-view-menu.md) (M17) — after 08-key-m18-tab-count (forced)

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- Lane 1 (stack #71): `main ← improvements-program-03-fix-filtered-stack-numbers (#62) ← improvements-program-10-close-group-tooltip (#69)`
- Lane 3 (stack #70): `main ← improvements-program-08-tab-title-count (#63) ← improvements-program-11-phone-view-menu (#68)`

## Notes

- Mode: autopilot
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Effort tickets deliver a child map, and close when that map closes.
- **Effort tickets.** A session on an effort ticket charts its child map at the path the ticket names, links it in the ticket, and sets `assignee`. The child map sets its own mode. Record the child map's progress there, not here.
- **The PR stops for the user.** Every PR is a draft. The user tests it with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. No feature toggles.
- **Spec:** each ticket, then [the merged review](../improvements/research/03-merged-review.md), then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **User profile.** The user runs many T3 Code threads at once and gets overwhelmed. Judge every choice against: less noise, a clear next step, low effort to re-enter a thread.
- **Skills:** `grilling` and `domain-modeling` for effort tickets; `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md`.
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the `brief-speed` frontmatter (`blocked-by` with file stems, `wayfinder:task` for route keys). Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **One map for the whole program**, separate from the [improvements map](../improvements/map.md), which stays closed as the record of the reviews.
- **Effort A** was charted before this map; its ticket is claimed and links the [wait-time map](../wait-time/map.md).

- [Effort B: status groups that agree](tickets/02-effort-b-status-groups.md): a unit goes to its most urgent section, sections count matching threads and fold context rows, and the header shows the your-turn count. #78, #79, #80 merged.

- [Effort D: less noise](tickets/04-effort-d-less-noise.md): the [less-noise map](../less-noise/map.md) is closed; all three build keys are merged to `main`.

## Not yet specified

None.

## Out of scope

- Writes to T3 (settle, snooze, approve).
- New findings that are not in the merged review. They need a new review.
