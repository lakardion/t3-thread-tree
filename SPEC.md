# T3 thread tree: build spec

A local, read-only webapp. It shows the active T3 Code threads as one live tree: Project › issue key › thread. Each node shows its status and its PR stack. A click on a node opens the thread in T3 Code.

Terms are defined in [CONTEXT.md](CONTEXT.md). Each section links the ticket that holds the full decision and its reasons. When this spec and a ticket do not agree, this spec wins: it includes the later changes.

## Scope

- In scope: the threads of the local T3 environment (`~/.t3/userdata`), live updates, and "open in T3".
- Out of scope: write actions (settle, snooze, send, interrupt, launch); threads from linked T3 environments on other machines; any change to T3 Code itself.

## Runtime and stack

Source: [How does the standalone app run, and on which stack?](.wayfinder/tickets/006-runtime-and-stack.md), research on branch `research/frontend-framework`.

- **Start:** one command, `bun start`, in the repo. It serves the page and the API on `http://127.0.0.1:4773`. The page uses relative URLs. The app stops when the terminal closes.
- **Backend:** Bun 1.3 and TypeScript, with no framework.
  - `Bun.serve` serves the page (HTML import) and `GET /events` (SSE).
  - The Bun WebSocket client holds the T3 shell stream.
  - `bun:sqlite` reads `statev2.sqlite` in read-only mode for the launched-thread lineage.
- **Frontend:** React 19, Tailwind v4 (`bun-plugin-tailwind` through `bunfig.toml`) and shadcn components (Radix), built by Bun HTML imports. No Vite. `tsc --strict` checks the types.
- **Shared type:** one `Tree` type in a shared module. The backend and the page both import it.

## Data source

Source: [How can a local process read T3 thread data live?](.wayfinder/tickets/001-data-source-for-local-reader.md), research on branch `research/data-source`.

1. Read `~/.t3/userdata/server-runtime.json` to get `origin` (the port can change at each T3 start). Read `~/.t3/userdata/environment-id` to get the environment id for the deep links.
2. Open `ws://127.0.0.1:<port>/ws?orchestrationProtocol=2` with the header `Authorization: Bearer <token>`.
3. Call `orchestration.subscribeShell` with `omitIdleSubagents` and `omitOlderSettled` off. The protocol is Effect RPC with JSON frames. Write the small frame handler by hand; the T3 packages are private.
4. Stream items:
   - `snapshot` holds `projects`, `threads` and `archivedThreads`. Only the first `snapshot` of a connection is the full state. Later `snapshot` items (with `resolvedRepositoryIdentityRoots`) carry project metadata and empty thread lists; merge their projects and do not clear the thread map.
   - `thread.updated` holds the full thread, not a patch.
   - `thread.removed`, `project.updated` and `project.removed` also arrive.
5. Ignore archived threads (`archivedThreads`, and items with `location: "archive"`). The app never shows them.
6. Decode leniently: the protocol is internal to T3, and many fields are optional. Keep the stream code in one module, so a protocol change breaks only that module.

### Token

- The user issues the token once with `~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only`.
- The token goes in the gitignored `.env` as `T3_TOKEN`, which Bun loads.
- If T3 rejects the token (HTTP 401), the page banner shows this command.

### T3 not running, or restarted

- The backend starts even when T3 is not running.
- Every 3 s, it reads `server-runtime.json` again and tries to connect.
- While T3 is down, the page keeps the last tree, greyed, with the banner "T3 not running: last update HH:MM".
- Each new connection takes a fresh snapshot, and its first `snapshot` item replaces the whole thread map. Do not use `afterSequence`.

## Launched-thread lineage

Source: [Can the spawner of a launched thread be recovered?](.wayfinder/tickets/002-recover-launched-lineage.md), [Standalone webapp or a view inside T3 Code?](.wayfinder/tickets/003-standalone-or-in-t3.md), research on branch `research/launched-lineage`.

A thread that an agent starts with `t3_thread_launch`, `create_threads` or `delegate_task` has no native parent. Its **spawner** is found in `statev2.sqlite`:

1. **Primary:** the caller's `dynamic_tool` row in `orchestration_v2_projection_turn_items` with `status = 'completed'`, where `toolName` ends in `t3_thread_launch`, `create_threads` or `delegate_task`. Parse `payload_json.output.content` as JSON. The new id is in `threadId`, `threads[].threadId` or `childThreadId`. The row's `thread_id` is the spawner. Do not match the child id as a substring.
2. **Fallback:** `senderThreadId` on the thread's first user message in `orchestration_v2_projection_messages` (`message_id = thread_id` for a launch).

Run the lookup when the backend first sees a top-level thread whose id contains `mcp:` or `mcp%3A` (`t3_thread_launch` gives `mcp:…`, `create_threads` gives `thread:mcp:…`, `delegate_task` gives `thread:delegated-task:command%3Amcp%3A…`), in the snapshot or in `thread.updated`. Cache the result in memory. A thread that arrives before its tool-call row is written gets a short retry. Keep the SQLite code in one module.

## Tree rules

Source: [Tree model rules for the nested tree](.wayfinder/tickets/004-tree-model-rules.md), changed by [Rough tree UI on a real snapshot](.wayfinder/tickets/005-rough-tree-ui.md).

A **top-level thread** has no native `parentThreadId`. A **subagent** has `relationshipToParent: subagent`. The backend applies these rules and builds the whole tree.

1. **Visible.** A top-level, non-archived thread is visible when `settledAt` is null, whatever its status. No recency window applies. With the settled toggle on, settled top-level threads are visible too.
2. **Subagents are not shown.** The tree holds top-level threads only. It shows no subagent rows, counts or signals.
3. **Snoozed** threads stay visible. They are shown muted, with their wake time.
4. **Issue key:** the first match of `/\b[A-Z][A-Z0-9]+-\d+\b/` in the title of a top-level thread. `Review #15708 JED-4319` gives `JED-4319`.
5. **Visible spawner:** start at the thread's spawner and go up the spawner chain. Skip threads that are not visible, and stop at the first visible one. If no thread in the chain is visible, the thread has no visible spawner.
6. **Placement.** A thread is always placed in its own `projectId`. Apply the first rule that matches:
   1. A title that starts with `Review #` goes under `Project › Reviews › <key>`, or `Project › Reviews › No issue key` if it has no key.
   2. A keyed thread goes under `Project › <key>`.
   3. A keyless thread with a visible spawner in the same project nests under that spawner.
   4. Any other keyless thread goes under `Project › No issue key`.
7. **Launcher threads** get no special rule.
8. **PR stack:** it adds no level to the tree. Each thread in a stack shows a badge with its position, for example `⧉ 3/6`. Key groups in one project that share a stack sit next to each other, in stack order.
   - Stack membership: the thread's open PRs with `source` `created`, `stack` or `agent`.
   - Stack order: as computed by `build.py` on branch `prototype/005-tree-ui`.
9. **Order:**
   - Projects are sorted by their latest update, newest first.
   - In a project: issue-key groups (newest first, with stack mates kept together), then Reviews, then No issue key.
   - Threads in a group are sorted by their latest update, newest first. The latest update includes nested threads.

## UI

The page shows an outline tree: Project, group, thread. Each thread row has a status dot, a title link to `t3code://threads/<environmentId>/<threadId>`, a stack badge and PR links. Closed rows are saved in `localStorage`. A toggle shows settled threads. A banner shows when T3 is down or rejects the token.

A pending request wins over snooze. A snoozed thread with a pending request shows as needs input.

The header has a System / Light / Dark choice. The full design is in [DESIGN-SPEC.md](DESIGN-SPEC.md).

## Live updates

1. The backend keeps the thread map from the stream.
2. On each change, it builds the whole tree again, after a short debounce.
3. It pushes the tree as JSON on `GET /events`. The settled toggle is a query parameter on this request (`?settled=1`), so the backend builds the tree for that connection's setting.
4. The page renders each tree it gets. It does not apply diffs.
5. `Bun.serve` closes a connection after 10 s with no bytes. Call `server.timeout(req, 0)` on the SSE request.
6. Stop the push timer when the client disconnects.

## Check at build

These facts are not confirmed against a real stream. The research used the MCP thread list and SQLite.

- Nobody has opened the shell stream with a real token yet.
- The PR fields: the MCP list has `pullRequests[].state`; the shell has `pullRequests[].snapshot.state`. Confirm the path for the open-PR filter and for the stack.
- `pendingRuntimeRequest` as the "needs input" signal (the prototype used `orchestration_v2_projection_runtime_requests` with `status = 'pending'`). Also check how the `waiting` run status fits the table.
- `toolName` for callers that are not Claude (for example Codex) in the lineage lookup.
