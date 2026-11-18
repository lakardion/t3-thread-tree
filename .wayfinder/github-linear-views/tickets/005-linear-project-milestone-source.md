---
id: "005"
title: Where does the app get each issue's Linear project and milestone?
type: research
status: closed
assignee: damian.lucero
blocked_by: []
---

## Question

The app knows only the issue key from a thread title. It does not fetch any Linear data today. Grouping by Linear project and milestone needs each issue's project and milestone. Find the cheapest reliable source.

Compare the Linear GraphQL API with a personal API key against the `linear` CLI on the user's PATH. For each source, state the auth setup, one request that resolves many issue keys at once, rate limits, and how fast project and milestone changes show. Decide where the token lives, next to the T3 token and `LINEAR_WORKSPACE` and `LINEAR_TEAMS`. Decide what the page shows when the source is not set up, fails, or does not know an issue key. [Current Linear settings](../../../SPEC.md#ui), [desktop working folder and env](../../../SPEC.md#shape), [server data flow](../../../src/server/build-tree.ts).

Close with the chosen source, the request shape, the cache and refresh rule, and the fallback for each failure case.

## Resolution

Call the Linear GraphQL API from the Bun server with a personal API key. Do not use the `linear` CLI. Findings: `docs/research/linear-project-milestone-source.md` on the local branch `research/linear-project-milestone` (commit `70e18dc`).

- **Why not the CLI:** `issue view --json` gives project and milestone names only, one key per call (about 0.7 s each). Only `linear api` gives the full fields, and it adds a process per call and hides `Retry-After`.
- **Token:** a `0600` file that the "Linear links" Settings fold writes, like the T3 token. Path `~/.config/t3-thread-tree/linear-key`, override `LINEAR_KEY_FILE`; the desktop app uses `dataFile("linear-key")`. `LINEAR_API_KEY` in the env is the fallback. Header `Authorization: <key>`, no `Bearer`.
- **Request:** one batch per refresh: `issues(filter: { id: { in: $keys } }, first: 250, includeArchived: true) { nodes { identifier previousIdentifiers project { id name url } projectMilestone { id name targetDate } } }`. The `id` filter takes keys like `ABC-12` (confirmed live). A missing key is left out, with no error. A key the batch misses gets one `issue(id:)` call, which finds an issue moved to another team.
- **Cache and refresh:** in memory on the server, like the label store. Runs only while a page uses Linear grouping. Fetch new keys when the tree's key set changes. Refetch all every 10 min and when the user saves the fold. Do not refetch on T3 `updatedAt` (it ticks about once a second; limit is 2,500 requests per hour). No webhooks: they need a public URL and an admin.
- **Fallbacks:**
  - Key not set: the Linear grouping choice is disabled; the fold shows a warning.
  - Key rejected (401): keep the last good data; the fold shows "Key rejected"; a banner shows only while Linear grouping is on; no retry until the key changes.
  - Rate limited (429): keep the data; wait for `Retry-After`.
  - Network or 5xx: keep the data; try again at the next refresh.
  - Unknown key (deleted, other workspace, no access): the thread goes to the "no project" group.
- **Not verified:** direct `fetch` latency, maximum page size, query cost (about 950 points, calculated), whether a milestone change moves the issue `updatedAt`.
