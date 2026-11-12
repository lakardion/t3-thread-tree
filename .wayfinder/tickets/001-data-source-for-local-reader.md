---
id: 001
title: How can a local process read T3 thread data live?
type: research
status: open
assignee:
blocked_by: []
---

## Question

Which data source can a local webapp use to read all T3 Code threads and get live status changes?

Check each candidate and report what it gives:

- `~/.t3/dev/statev2.sqlite` (and `~/.t3/userdata`): the tables that hold threads, their fields, the parent link, PR links, settled/snoozed/archived flags. Is it safe to read while T3 runs (WAL mode)? Is the schema stable or internal?
- `~/.t3/dev/server-runtime.json` and the T3 server in `~/repos/t3code`: is there a local HTTP or WebSocket API? Which endpoints or subscriptions list threads and push changes? What auth does it need?
- The T3 MCP tools (`t3_thread_list`, `t3_thread_read`): can a non-agent process call them?
- The deep-link format to open a thread in T3 (`t3-thread://v2/<env>/<threadId>`): does it work from a browser?

Report the fields available per thread, the live-update mechanism, and the risks (schema churn, auth) of each source.
