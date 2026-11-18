---
title: How does a brief row look, on desktop and phone?
type: prototype
status: open
assignee: claude (better-brief-01)
blocked-by: []
---

## Question

How does one **Action** row of the **Next-step brief** show its text, its Wait, its threads and its mark, on desktop and at 390 px?

## Brief

Source: [the merged review](../../improvements/research/03-merged-review.md) › M11, M14, M15, and the M10 mark look. Charting decided the content (see the map's Decisions so far). This ticket decides the look. Make a prototype with two or three variants in the demo data (four `needs-input` threads, one `plan-ready`) and decide:

- **M11 title.** The verb for each request kind and for `plan-ready` (today: "Answer the agent", "Review the plan", `codeAction` in `src/server/brief.ts`). Where the request kind and the **Wait** go. Use the Wait format of the rows (`phraseWith` in `src/page/format.ts`).
- **M11 reason.** The first sentence of the last message, cut how? What shows when there is no message?
- **M14.** Full thread titles: let the link wrap, or put the title in the heading? Today the link truncates at 260 px (`src/page/brief.tsx`).
- **M15.** At 390 px: rank and kind on a short first line, Action and thread title at full width, send, start and copy below with visible labels.
- **Marks.** How a **done** and a **changed** row look (check icon, muted row), and the head line "N changed since HH:MM · Run again".

When it closes, write the `## Spec` of 03, 06 and 07, and the look part of 04.
