---
title: What does a thread digest hold, and when does it update?
type: grilling
status: closed
assignee: claude
blocked-by: []
---

## Question

What fields does the in-memory **digest** of a thread hold, in which text format, and which event updates it?

## Brief

Today `briefInput` builds `InputThread` on each click, as JSON. Decide:

- The fields to keep, drop or shorten (ids, PR marks, stack, request, last message). Which fields does the model need to judge a thread?
- A terse format instead of JSON (for example, one line per thread plus an indented message), and how thread ids stay exact.
- The last message: the cap, and if code can shorten it more (for example, only the tail of the message).
- When the digest updates: on each tree push, or only when the thread's status or last message changes. How it reads new messages from `statev2.sqlite` with no extra cost on each push.
- Where it lives in the server, next to the tree and the brief state.

## Resolution

Decided with the user at the start of autopilot. Built in [Build the compact digest input](05-compact-digest.md).

- **No store.** Code builds the digest on each click from the live tree and one `lastMessages` query (about 2 ms for 330 threads). A cache saves no time that can be measured.
- **Filter:** code removes threads with status `working`, `starting`, `waiting` or `snoozed`.
- **Format:** text, not JSON. One line per thread: `id · status phrase · key title · PRs (#12 approved passing)`, then the last 600 characters of the last assistant message, indented.
