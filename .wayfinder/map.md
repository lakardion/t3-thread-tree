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
- Candidate data sources: `~/.t3/dev/statev2.sqlite`, `~/.t3/dev/server-runtime.json`, and the T3 Code source at `~/repos/t3code` (the user's fork).
- Settled choices at charting: one nested tree (not switchable lenses); live updates; read-only plus "open in T3"; active threads by default, with settled/archived threads behind a toggle.
- Skills for grilling tickets: `grilling` + `domain-modeling`. Write in ASD-STE100.

## Decisions so far

<!-- one line per closed ticket -->

## Not yet specified

- **Runtime and stack**: how the app runs (a dev server, a launch at login, a T3 plugin surface), port, and framework. Depends on the data-source and standalone-vs-in-T3 answers.
- **Live transport**: push subscription vs polling vs file watch. Depends on what the data source offers.
- **Node content**: what one tree node shows apart from title and status: "waiting for you" highlight, last message, age, model, PR states. Probably comes out of the prototype.
- **Scale and noise**: how the tree stays readable with many review-lens subagents (collapse rules, counts).
- **Linked machines**: whether threads on other linked T3 environments show up too.

## Out of scope

- Write actions (settle, snooze, send, interrupt, launch). The user chose read-only plus "open in T3".
- Building the app. This map ends at the spec.
