---
title: Show the phrase and the Wait on rows that wait on the user
type: wayfinder:task
status: in-review
assignee: damian.lucero
blocked-by: [01-row-wait-look]
---

## Question

Build M04: set the `since` of `plan-ready` and `your-turn`, and show the phrase and the **Wait** on the rows that [the row look](01-row-wait-look.md) chose.

## Spec

From [the row look](01-row-wait-look.md).

Data:

- `statusOf` (`src/server/build-tree.ts`) sets `since` from `latestRunCompletedAt` for `plan-ready` and `your-turn`. No schema change: `ThreadNode.since` exists. The Wait of `needs-input` stays the request time.
- Side effects to check and test: the brief digest reads `since` (`src/server/brief.ts:44`), and the menu-bar list sorts by `since` (`src/desktop/runtime.ts:49`).

Row (`ThreadRow` in `src/page/app.tsx`):

- **Rows with text.** `needs-input`, `plan-ready` and `your-turn` show the phrase and the Wait, for example "Approval 12m", "Plan ready 30m", "Your turn 30m". `failed` shows "Failed" with no time. All other rows keep the icon only.
- **Position.** The text sits right after the status icon, before the key and the title, in the status color. On a phone (`max-[720px]`), it stays on the first line with the icon, so it shows above the title.
- **No Wait.** A row with no `since` (a guest message) shows the phrase only, with no time and no mark.
- **Row end.** Keep the `updatedAt` age and its tooltip. Details get an "Updated" line with the age, so the row-end time has a label.
- The icon tooltip stays as it is.

Docs:

- `SPEC.md` and `DESIGN-SPEC.md`: describe the row text, and note that it reverses `d602e6e` (#18) for these rows only. Add **Wait** to `CONTEXT.md` if it is not there. Update `README.md` ("What you get").
- One draft PR in the stack 04 ← 05 ← 06. The user tests the stack with `bun run demo` and the real app, and merges it.

## Done when

- `statusOf` gives `since` = `latestRunCompletedAt` for `plan-ready` and `your-turn`, with tests in the `build-tree` tests. The brief digest and the menu-bar order are checked against the new `since`.
- In `bun run demo`, light and dark, desktop and phone width: needs-input, plan-ready and your-turn rows show "<phrase> <Wait>" beside the icon; the failed row shows "Failed"; the guest-message row shows "Guest message"; calm rows show no text.
- The row-end age is unchanged, and details show an "Updated" line.
- `SPEC.md`, `DESIGN-SPEC.md`, `CONTEXT.md` and `README.md` are updated.
- `bun run check` passes. The draft PR is open, and the session hands off to the next key.
