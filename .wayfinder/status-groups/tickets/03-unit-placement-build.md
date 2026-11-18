---
title: Put a unit in the section of its most urgent thread, subthreads included
type: wayfinder:task
status: closed
assignee: claude (status-groups-03)
blocked-by: []
---

## Question

Build M01: in the flat view with "Group by: Status", put a unit in the section of its most urgent thread, subthreads included.

## Spec

From [the merged review](../../improvements/research/03-merged-review.md) › M01 and the charting decisions of [the map](../map.md).

Placement (`sections` in `src/page/view.ts`):

- A unit goes to the section of its most urgent thread. Count every thread of the unit, subthreads at any depth included (use `allThreads` or the same walk). Today `unitThreads` reads only top-level threads.
- A PR stack keeps its rule: one block, in the section of its most urgent thread, now with subthreads included.
- **Settled threads do not pull.** A unit goes by its unsettled threads. A unit with only settled threads goes by all its threads.
- Subthreads stay under their parent (`SPEC.md:103`). The row look does not change; a parent row that does not match its section stays as it is until M07.
- Update the doc comment of `sections`.

Docs:

- `SPEC.md` (the "Group by Status" paragraph): a unit goes to the section of its most urgent thread, subthreads included, and settled threads do not pull. Same line in `DESIGN-SPEC.md` if it states the rule.
- Bug fix: no `README.md` change.
- One draft PR, the base of the stack 03 ← 04 ← 05, from `main`.

Interaction with the wait-time stack: its M05 key sorts the waiting sections by **Wait**, and a stack sorts by its oldest Wait in the section's status set. On the rebase of the second stack to merge, a thread unit sorts the same way: by the oldest Wait of its threads, subthreads included, in the section's status set.

## Done when

- Tests in `test/view.test.ts`: a unit with an idle parent and a your-turn subthread goes to Your turn; a working grandchild pulls its unit to Working above Idle; a settled needs-input subthread does not pull its unit up; a unit with only settled threads goes by all its threads; a PR stack with a waiting subthread goes to Needs input.
- In `bun run demo`, flat view, "Group by: Status": "Migrate Dialog to the new tokens" (your-turn) and "Migrate Button…" (working) no longer show under "Idle and snoozed"; their unit shows under "Your turn".
- `SPEC.md` is updated.
- `bun run check` passes. The draft PR is open, and the session hands off to the next key.
