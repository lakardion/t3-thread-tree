---
id: 04
title: Order the merged list and group it into efforts
type: grilling
status: closed
assignee: claude-opus
blocked_by: [03]
---

## Question

In which order does the user want the merged items, and as which efforts (own map, or direct `/start-issue` key)?

## Brief

Read `research/03-merged-review.md`. Grill the user on order and grouping. Keep every item: an item can go last, but it is not dropped unless the user says so. Record the ordered, grouped list in the resolution.

## Resolution

All 23 items of [research/03-merged-review.md](../research/03-merged-review.md) are kept, ordered and grouped into 9 efforts. Nothing is dropped.

**Rules**

- Order rule: value first, then dependencies. High-impact items that both reviews found go first. Small bugs go early because they are cheap.
- M08 (last message on demand) is **accepted**. It reverses `DESIGN-SPEC.md:24` for the details block and the send dialog only. The row does not change. Update `DESIGN-SPEC.md:24` when M08 is built.
- An effort with open design choices gets its own wayfinder map. An effort with no open choices gets one `/start-issue` key per item.
- Rollback: each item merges as its own PR, so `git revert` removes it cleanly. The user tests each item personally (`bun run demo` and the real app) before the next release tag. No feature toggles.

**Ordered efforts**

| # | Effort | Kind | Items, in order |
| --- | --- | --- | --- |
| 1 | A. Wait time on the row | map | M04 → M05 → M19 |
| 2 | B. Status groups that agree | map | M01 → M07 → M06 |
| 3 | C. Small bugs | keys | M02, M03 |
| 4 | D. Less noise | map | M09 → M13 → M16 |
| 5 | F. Last message on demand | key | M08 |
| 6 | E. A brief that helps you choose | map | M11 → M10 → M12 → M14 → M15 |
| 7 | G. Get to a thread fast | map | M20 → M22 → M21 |
| 8 | H. Phone and tab polish | keys | M18, M17 |
| 9 | I. Needs-you window | map | M23 |

**Why each grouping and order**

- A: M05 and M19 need the `since` that M04 sets for `plan-ready` and `your-turn`. Open choices: which rows get the text, its position, the row-end time.
- B: all three are about status-group placement and counts. M01 is the high-impact bug. Open choices: the look of context rows (M07) and the count format (M06).
- D: each item reverses a design-spec rule (`SPEC.md:72`, `SPEC.md:103`, `DESIGN-SPEC.md` › Gradients). The map confirms each reversal.
- F before E: the Opus option of M11 uses the last message from M08. F starts with the last message only, with no read of `turn_items`.
- E: M12's "done" count needs M10.
- G: M21 and M22 can share one key handler. The map decides how M20, M21 and M22 fit together.
- I: M23 needs A (M04 and M19).
