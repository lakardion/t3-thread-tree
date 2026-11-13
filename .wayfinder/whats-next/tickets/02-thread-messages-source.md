---
title: Where does the backend read the last assistant message of a thread?
type: research
status: closed
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

## Resolution

Read it from SQLite. The shell stream has `latestVisibleMessage`, but T3 always sends `null`. Findings: [02-thread-messages.md](../research/02-thread-messages.md) on branch `research/thread-messages`.

- Table `orchestration_v2_projection_messages`, text in `payload_json.$.text`. The table holds only text messages, so `role = 'assistant'` is enough.
- One batched query takes the active thread ids as a JSON array. It takes the newest row with `streaming = 0` per thread, on the existing `(thread_id, created_at, message_id)` index. Result is `NULL` when the thread has no assistant message yet.
- Lengths: p50 2028, p90 5046, max 15157 characters.
- Cap: 1500 characters. Keep the first 1000 and the last 500, with `…` between them. 30 threads use about 11k tokens.
- Time: about 2 ms for 330 threads. Run it on each click.
- Limit: for a running thread, the last message can be a short note between tool calls. The thread status in the prompt shows this.
