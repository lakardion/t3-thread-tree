---
title: Where does the backend read the last assistant message of a thread?
type: research
status: open
assignee:
blocked-by: []
---

## Question

Where, and with which query, can the backend read the last assistant message of each active thread, read-only?

## Brief

Look at `~/.t3/userdata/statev2.sqlite` (read-only; see `src/server/lineage.ts`, and `SPEC.md` › Launched-thread lineage) and at the shell stream in `src/server/t3.ts`. The T3 Code source is at `~/repos/t3code`.

1. Does the shell stream already carry a last message or a preview? If yes, use it.
2. Otherwise, the table and query for the last assistant text message per thread (`orchestration_v2_projection_messages` or another). How to skip tool-call items and get only text.
3. Typical length. Propose a cap (characters) so 30 threads fit in a cheap model's prompt.
4. Time for the query over all active threads.

## Output

`.wayfinder/whats-next/research/02-thread-messages.md` on branch `research/thread-messages`, with a tested SQL query.
