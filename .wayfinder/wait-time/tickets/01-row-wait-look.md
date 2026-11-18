---
title: How does a row that waits on the user show its phrase and Wait?
type: prototype
status: closed
assignee: damian.lucero
blocked-by: []
---

## Question

Which rows show the status phrase and the **Wait** as text, where on the row does the text sit, and what does the row-end time show?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M04. Build a throwaway variant switch in the demo. Show the Opus and the Sol variant side by side, light and dark, desktop and phone width. The user picks.

Decide:

- **Rows.** Which statuses get the text. Opus: `needs-input`, `plan-ready`, `your-turn` and `failed`. Sol: the threads that need the user. **Wait** covers only the "Needs you" filter set, so decide if `failed` shows a phrase with no Wait, a time since failure, or nothing. Calm rows keep the icon only.
- **Position.** Opus: after the title, in the right group, so the title start does not move. Sol: beside the icon, and above the title on a phone.
- **Row-end time.** Opus: replace the `updatedAt` age with the Wait on these rows, tooltip "Waiting since 22:58". Sol: keep the age and label it in details.
- **No Wait.** A guest message gives `needs-input` with no `since` (`src/server/build-tree.ts:32`). Decide what that row shows.
- **Reversal.** Commit `d602e6e` (#18) removed the phrase column for all rows. Confirm with the user that this item brings the phrase back for the rows that wait on the user only.

Fixed by the review: the Wait of `needs-input` starts at the request time. The Wait of `plan-ready` and `your-turn` starts at `latestRunCompletedAt`.

## On resolution

Write the `## Spec` and `## Done when` of [the build ticket](04-row-wait-build.md) from the answer. Delete the prototype code; link a screenshot or the throwaway branch from the resolution.

## Resolution

The user picked these answers from the demo prototype (Opus and Sol variants, light and dark, desktop and phone):

- **Position: Sol.** The phrase and the Wait sit beside the status icon, before the key and the title. On a phone, they sit on the first line, above the title.
- **Row-end time: Sol.** The row end keeps the `updatedAt` age. Details get an "Updated" line, so the age has a label.
- **Rows: Opus.** `needs-input`, `plan-ready` and `your-turn` show the phrase and the Wait. `failed` shows the phrase "Failed" with no time. All other rows keep the icon only.
- **No Wait: phrase only.** A row with no `since` (a guest message) shows "Guest message" with no time and no mark.
- **Reversal confirmed.** This item reverses `d602e6e` (#18) for the rows above only. Calm rows keep the icon only.

Prototype: branch `prototype/row-wait-look` (commit `5dcf08b`), run `bun run demo` and open `?variant=opus` or `?variant=sol`. Screenshots: `.wayfinder/wait-time/assets/01-row-wait-look/` on that branch.
