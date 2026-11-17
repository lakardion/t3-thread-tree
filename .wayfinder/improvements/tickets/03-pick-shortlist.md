---
id: 03
title: Merge the two reviews into one deduplicated list
type: research
status: closed
assignee: fable-agent
blocked_by: [01, 02]
---

Run this ticket on **Claude Fable**.

## Question

What is the full, deduplicated list of findings from both reviews?

## Brief

Read `research/01-opus-review.md` and `research/02-sol-review.md`, and look at the screenshots in `research/01-opus/` and `research/02-sol/` as needed. Keep every finding. Do not drop a finding because it is weak, small or from one review only: dedupe, do not filter.

- Merge findings that propose the same change into one item. Keep the evidence and the file:line references of both.
- Where the two reviews propose different changes for the same problem, keep one item and list both options.
- Mark each item with its source: Opus, Sol, or both. "Both" is a strong signal.
- Keep impact and effort. If the two reviews differ, give both values.
- Keep the groups UX, UI, New features. Put bugs in their own group.
- Keep the "earlier decisions" notes: each item that reverses a closed-map decision says so, with the reason.
- End with a short table of all items: id, title, group, source, impact, effort.

Check the claims against the code at `5bf8567` where the two reviews disagree on a fact. Do not change app code.

## Output

`.wayfinder/improvements/research/03-merged-review.md`, in ASD-STE100.

## Resolution

- Merged list: [research/03-merged-review.md](../research/03-merged-review.md). 23 items (M01 to M23): 3 bugs, 9 UX, 6 UI, 5 new features. 8 items come from both reviews, 11 from Opus only, 4 from Sol only. Nothing was dropped.
- Facts checked at `5bf8567`: the "Needs you" filter keeps 9 rows (a spawner that holds a match stays); a PR stack in the status section of its most urgent thread is by design (`SPEC.md:103`), so it is UX item M07, not a bug; wait times are effort S (`ThreadNode.since` exists), except guest-message needs-input, which has no `since`.
- Open conflict: M08 (last message on demand) is proposed by Opus and declined by Sol (`DESIGN-SPEC.md:24`). Ticket 04 decides it.
