---
id: 002
title: Can the spawner of a launched thread be recovered?
type: research
status: open
assignee:
blocked_by: []
---

## Question

Threads that an agent starts with `t3_thread_launch` or `create_threads` (ids like `mcp:launch:<hash>`) have `parentThreadId: null`. Does T3 Code record anywhere which thread launched them?

Check in `~/repos/t3code` and the local state in `~/.t3/dev/statev2.sqlite`:

- The launch command and its id: does the `<hash>` or the command record hold the caller's thread id?
- Activity items or tool-call results in the caller thread that name the new thread's id.
- Delegate ids (`thread:delegated-task:command:mcp:<uuid>:delegate-task:<uuid>`): which part maps to the caller?
- Any `createdBy`, `creationSource`, or event-log field that links back.

Report: a reliable way to rebuild the full spawn lineage, a partial way (with how it fails), or none. If none, state the smallest upstream change in T3 Code that would record it.
