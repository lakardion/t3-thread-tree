---
id: 003
title: Standalone webapp or a view inside T3 Code?
type: grilling
status: closed
assignee: claude-session-003
blocked_by: [001, 002]
---

## Question

Should the tree be a separate local webapp, or a feature in T3 Code itself (the user's fork at `~/repos/t3code`, possibly offered upstream)?

Weigh the data-source findings (001) and the lineage findings (002): if the data is only reachable from inside T3, or lineage needs an upstream change anyway, an in-T3 view can be cheaper. A standalone app keeps the fork clean and survives T3 upgrades.

Known since charting: the shell WebSocket needs a Node backend and a token for a standalone app, and it carries only the native parent link. Launched-thread lineage needs tool-call rows or an upstream `spawnedByThreadId`. Inside T3, both come for free.

## Resolution

A standalone local webapp. Not a view in T3 Code.

- The user runs the released T3 Code (Beta) app, not a build of the fork. A view in the fork would mean running and rebasing a self-built T3 every day. An upstream PR depends on maintainer review.
- The app has a small Node backend. It subscribes to `orchestration.subscribeShell` with a token of scope `orchestration:read` and serves the page. "Open in T3" uses `t3code://threads/<envId>/<threadId>`.
- Launched-thread lineage is resolved on arrival. When the backend first sees an `mcp:` thread id (in the snapshot or in `thread.updated`), it queries `statev2.sqlite` once: the caller's `dynamic_tool` turn item first, then `senderThreadId`. It caches the spawner in memory. A thread that arrives before its tool-call row gets a short retry.
- The shell protocol and the SQLite schema are internal and can change. Each one is read in one small module, so a change breaks only that module.
- An upstream `spawnedByThreadId` is out of scope: the rebuild works without it.
