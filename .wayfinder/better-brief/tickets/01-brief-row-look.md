---
title: How does a brief row look, on desktop and phone?
type: prototype
status: closed
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

## Resolution

The user chose variant **B, thread as heading**, after a look at three variants on desktop, at 390 px, light and dark. Prototype: branch `prototype/brief-row-look` (`src/page/brief-row.prototype.tsx`, run `PORT=4817 bun run demo`, open `?variant=A|B|C`).

- **Row.** Line 1: the rank, then the full thread title as the bold heading, with its status icon. It wraps and does not truncate. Line 2: the kind chip, the verb, then the Wait (`phraseWith`, for example "Approval · 12m"). Line 3: the reason in muted `text-xs`.
- **Verb.** `user_input` "Answer the question", `mcp-elicitation` "Fill in the form", `command` "Approve the command", `file-change` "Approve the file change", `file-read` "Approve the file read", `permission` "Grant the permission", `dynamic_tool_call` "Approve the tool call", a guest message "Reply to the guest", `plan-ready` "Review the plan". An unknown kind keeps "Answer the agent".
- **Reason.** The **last question** of the last message: the last sentence that ends in "?", else the last sentence. This reverses the charting choice of the first sentence: the first sentence of SHOP-413 is "The saved cards list works.", and the last question is the real open point. Cut at 140 characters with "…". With no message, the code reason stays.
- **Marks.** Marked rows move to the end and show at 55 % opacity, 100 % on hover. A **done** row shows a check in place of its rank, a struck-through heading and a "Done" badge after the Wait. A **changed** row keeps its rank and shows a "Changed" badge. A bar under the panel head says "1 done · 1 changed since HH:MM", with "Run again" on the right. The bar shows only when a row has a mark.
- **Phone (720 px and less).** The buttons leave the right side and go on a line below the reason, in line with the heading, with text labels: Send, New thread, Copy, Focus. Desktop keeps the icon buttons on the right.
