---
id: 001
title: How can a local process read T3 thread data live?
type: research
status: closed
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

## Resolution

Findings: `research/data-source.md` on branch `research/data-source` (commit `4a42c2f`).

- Recommended: the T3 server WebSocket `orchestration.subscribeShell` at `ws://127.0.0.1:<port>/ws?orchestrationProtocol=2`. It sends a snapshot, then `thread.updated` / `thread.removed` with a resumable `sequence`. Per thread: `status`, `lineage.parentThreadId`, `relationshipToParent`, `pullRequests[]` with `source`, archived, settled, snoozed.
- Auth: a token from `t3 auth session issue --scope orchestration:read`. A browser cannot set the bearer header on a WebSocket, so a small Node backend connects (or the page uses a `wsTicket`).
- Port: read `~/.t3/userdata/server-runtime.json` each start (now 3773).
- SQLite fallback (`orchestration_v2_projection_threads`): no thread `status` column, no push (poll `orchestration_events.sequence`), and the schema changes fast (81 migrations). Safe to read in WAL mode.
- MCP is not reachable from outside an agent. The `t3 thread list` CLI has no subagents and no push.
- Deep link: `t3code://threads/<envId>/<threadId>` (the `t3-thread://` scheme does not open from a browser).
- Open tension: the shell stream carries only the native parent link. The launched-thread lineage (ticket 002) comes from tool-call rows, which the shell stream may not carry.
