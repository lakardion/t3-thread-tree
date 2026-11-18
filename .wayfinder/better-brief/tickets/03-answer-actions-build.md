---
title: Make the answer Actions specific
type: wayfinder:task
status: open
assignee: claude (better-brief-03)
blocked-by: [01-brief-row-look]
---

## Question

Build M11: make the answer Actions specific.

## Brief

Build M11 with the look of [the brief row look](01-brief-row-look.md). Bottom of the stack; start on `main`. Read the last message for the code-made answer Actions too (today `briefInput` reads it only for the threads that go to the model). One draft PR. `bun run check` passes. Update `SPEC.md`, `DESIGN-SPEC.md` and `README.md` where the change is visible.

## Spec

Look from [the brief row look](01-brief-row-look.md) › Resolution. Prototype: branch `prototype/brief-row-look`.

- In `codeAction` (`src/server/brief.ts`), set the title of an answer Action to the verb of its request kind. The table is in the 01 resolution. The kind is the raw `pending.kind`, so carry it to the node or read it from `detail.request`.
- Set the reason to the last question of the last message: the last sentence that ends in "?", else the last sentence. Drop the leading "…" of `tailOf`, split at sentence ends and at new lines, and cut at 140 characters with "…". With no message, keep today's reason. `briefInput` reads the last message for the code-made answer Actions too.
- Put the oldest Wait first inside the answer kind.
- On the row, show the verb and then the live Wait of the thread (`phraseWith`, for example "Approval · 12m") in mono `text-[11px]` muted, on the line of the kind chip. The Wait is live, so it is not part of the stored title.
- Keep the thread links where they are; 06 moves them to the heading.
