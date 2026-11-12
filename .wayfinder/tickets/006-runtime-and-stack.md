---
id: 006
title: How does the standalone app run, and on which stack?
type: grilling
status: open
assignee:
blocked_by: [003]
---

## Question

How does the standalone tree app run on the user's machine, and what is it built with?

Decide:

- Start mode: a dev server started by hand, a launch at login (launchd), or another way.
- Port, and how the page finds the backend.
- Backend runtime and framework for the Node process that holds the shell WebSocket and the SQLite side-read.
- Frontend framework, and how live updates reach the page (WebSocket or SSE from the backend).
- How the backend gets its `orchestration:read` token and the T3 port (`server-runtime.json`) at each start, and what it does when T3 is not running.

Known: [Standalone webapp or a view inside T3 Code?](003-standalone-or-in-t3.md) chose a standalone app with a Node backend. [How can a local process read T3 thread data live?](001-data-source-for-local-reader.md) holds the protocol and auth facts.
