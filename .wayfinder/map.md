---
title: T3 thread tree viewer
labels: [wayfinder:map]
---

## Destination

A buildable spec for a local, read-only webapp. It shows active T3 Code threads as one live nested tree: Project › Issue key › spawn lineage, with the PR stack shown on each node. A click opens the thread in T3. The build is a hand-off after this map.

## Notes

- Domain: T3 Code threads. Glossary in `CONTEXT.md` at the repo root. Use those terms.
- Facts known at charting:
  - T3 exposes per thread: `title`, `status`, `projectId`, `pullRequests` (with `source: created|stack|agent`), `settled`, `snoozed`, timestamps, `parentThreadId`, `relationshipToParent` (`subagent`).
  - About 900 threads exist.
  - Launched threads (ids `mcp:launch:…`) have `parentThreadId: null`, so their spawn lineage is lost.
- Live T3 state is in `~/.t3/userdata` (`~/.t3/dev` is a stale dev copy). Data sources: `statev2.sqlite`, `server-runtime.json`, and the T3 Code source at `~/repos/t3code` (the user's fork).
- Settled choices at charting: one nested tree (not switchable lenses); live updates; read-only plus "open in T3"; active threads by default, with settled/archived threads behind a toggle.
- Skills for grilling tickets: `grilling` + `domain-modeling`. Write in ASD-STE100.

## Decisions so far

<!-- one line per closed ticket -->

- [How can a local process read T3 thread data live?](tickets/001-data-source-for-local-reader.md): the server WebSocket `orchestration.subscribeShell` via a small Node backend with a read-scoped token; SQLite only as a fallback.
- [Can the spawner of a launched thread be recovered?](tickets/002-recover-launched-lineage.md): yes, from the caller's tool-call row (fallback `senderThreadId`); all 153 launched threads resolve.
- [Tree model rules for the nested tree](tickets/004-tree-model-rules.md): active = unsettled top-level thread (subagents follow it); a keyed thread always sits under its own key, a keyless one nests under its nearest visible spawner; cross-key spawns become "launched by" hints; the stack is a badge plus sort order.
- [Standalone webapp or a view inside T3 Code?](tickets/003-standalone-or-in-t3.md): standalone local webapp with a Node backend; launched-thread lineage resolved on arrival by one SQLite query per new `mcp:` thread.
- [Rough tree UI on a real snapshot](tickets/005-rough-tree-ui.md): outline tree, all open; review threads go to `Project › Reviews › key`; a node shows status dot, title, stack badge and PR links only; subagents, age, last message and "launched by" hints are not shown.

## Not yet specified

- **Node content**: what one tree node shows apart from title and status: "waiting for you" highlight, last message, age, model, PR states. Probably comes out of the prototype.
- **Scale and noise**: how the tree stays readable with many review-lens subagents (collapse rules, counts).
- **Linked machines**: whether threads on other linked T3 environments show up too.

## Out of scope

- Write actions (settle, snooze, send, interrupt, launch). The user chose read-only plus "open in T3".
- Building the app. This map ends at the spec.
- An upstream `spawnedByThreadId` field in T3 Code: lineage rebuilds without it ([Standalone webapp or a view inside T3 Code?](tickets/003-standalone-or-in-t3.md)).
