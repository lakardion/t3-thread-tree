---
id: "007"
title: Build the Linear project and milestone source on the server
type: wayfinder:task
status: in-review
assignee: claude (github-linear-views-007)
blocked-by: []
---

## Question

Build the data half of "Group by Linear project": a Linear API key that the user saves in Settings, and a server cache that knows the Linear project and milestone of each issue key in the tree.

## Brief

Bottom of the chain; start on `main`. One draft PR. `bun run check` passes. Write the test-first parts with `tdd`.

- Add a `SPEC.md` section "Linear grouping" with a "Linear source" part that states the rules below as built. Add the new fold to the Settings "Setup" fold list in `SPEC.md` › UI.
- Update `README.md`: the new API key field in the "Linear links" fold (Setup, and "What you get" if it lists the fold).
- The page shows no grouping yet. [Build Group by Linear project in Tree](008-linear-tree-build.md) and [Build Group by Linear project in Flat](009-linear-flat-build.md) use this data.

## Spec

Decision: [Where does the app get each issue's Linear project and milestone?](005-linear-project-milestone-source.md). Research: `git show research/linear-project-milestone:docs/research/linear-project-milestone-source.md` (local branch only).

- **Key file.** The "Linear links" fold in Settings › Setup gets an API key field. Save posts the key to a new server endpoint, which writes a `0600` file, like `/token` and `src/server/token.ts`. Path `~/.config/t3-thread-tree/linear-key`, override `LINEAR_KEY_FILE`. The desktop app passes `LINEAR_KEY_FILE: dataFile("linear-key")` next to `T3_TOKEN_FILE` in `src/desktop/main.ts`. `LINEAR_API_KEY` in the env is the fallback. The page never reads the key back; the server reports only its state.
- **Fold state.** The fold shows the key state: set, not set (yellow warning) or "Key rejected" (warning). Saving a key starts a full refetch.
- **Request.** `POST https://api.linear.app/graphql`, header `Authorization: <key>` (no `Bearer`). One batch per refresh: `issues(filter: { id: { in: $keys } }, first: 250, includeArchived: true) { nodes { identifier previousIdentifiers project { id name url } projectMilestone { id name targetDate } } }`. Match an answer to a key by `identifier` or `previousIdentifiers`. A key the batch misses gets one `issue(id:)` call (an issue moved to another team). Over 250 keys, page the batch.
- **Cache.** In memory on the server, like the label store in `src/server/labels.ts`. Keep the refresh rule in a pure module with no network, and cover it with `bun test`.
- **Refresh.** Fetch only while a connection asks for Linear data: `/events` reads `linear=1`, adds it to the `Client` and to the tree cache key. Fetch new keys when the tree's key set changes. Refetch all every 10 min and when the key is saved. Do not refetch on T3 `updatedAt`. An answer that changes data calls `changed()`.
- **Fallbacks.**
  - Key not set: no fetch. The server reports `linear: "no-key"`.
  - 401: keep the last good data, report `"rejected"`, no retry until the key changes.
  - 429: keep the data, wait for `Retry-After`.
  - Network error or 5xx: keep the data, try again at the next refresh.
  - Unknown key (deleted, other workspace, no access): the issue has no project.
- **Tree data.** With `linear=1`, each `ThreadNode` (`src/shared/tree.ts`, and `DESIGN-SPEC.md` › Data › Tree type) carries the Linear data of its first title key: `linear: { project: { id, name, url } | null; milestone: { id, name, targetDate } | null } | null`. `null` means no key, no answer yet, or no `linear=1`. Do the lookup in `buildTree` with a new `linearOf(key)` input, so the server and the demo share it. Put the key state (`"ok" | "no-key" | "rejected"`) in the event payload next to the T3 connection state.
- **Demo.** `scripts/demo.ts` has its own `/events` and calls `buildTree`. Give it fixed Linear data that covers the worked examples in ticket 006: two projects, a milestone with a target date, a milestone with no date, an issue with no milestone, an issue with no project, and a keyless thread.
- **Check.** With a real key, `/events?linear=1` returns `linear` on a thread whose key is in a Linear project.
