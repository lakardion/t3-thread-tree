---
title: Add the brief endpoints (detect, run, cancel, last brief)
type: task
status: claimed
assignee: claude
blocked-by: [06-brief-runner]
---

## Question

Expose the runner over HTTP: list the installed CLIs, start a run (one at a time), cancel it with SIGTERM, and return the last brief from memory with its "generated" time, or the error with the stderr tail.

## Brief

Follow `SPEC.md`. Add a stub runner to `bun run demo` that returns the sample brief from the prototype branch after a short delay, so the page can be built without a CLI. AFK.
