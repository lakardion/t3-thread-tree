---
id: 003
title: Standalone webapp or a view inside T3 Code?
type: grilling
status: open
assignee:
blocked_by: [001, 002]
---

## Question

Should the tree be a separate local webapp, or a feature in T3 Code itself (the user's fork at `~/repos/t3code`, possibly offered upstream)?

Weigh the data-source findings (001) and the lineage findings (002): if the data is only reachable from inside T3, or lineage needs an upstream change anyway, an in-T3 view can be cheaper. A standalone app keeps the fork clean and survives T3 upgrades.

Known since charting: the shell WebSocket needs a Node backend and a token for a standalone app, and it carries only the native parent link. Launched-thread lineage needs tool-call rows or an upstream `spawnedByThreadId`. Inside T3, both come for free.
