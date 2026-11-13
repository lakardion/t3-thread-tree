---
title: Add the brief endpoints (detect, run, cancel, last brief)
type: task
status: closed
assignee: claude
blocked-by: [06-brief-runner]
---

## Question

Expose the runner over HTTP: list the installed CLIs, start a run (one at a time), cancel it with SIGTERM, and return the last brief from memory with its "generated" time, or the error with the stderr tail.

## Brief

Follow `SPEC.md`. Add a stub runner to `bun run demo` that returns the sample brief from the prototype branch after a short delay, so the page can be built without a CLI. AFK.

## Resolution

Built as `briefService` in [src/server/brief.ts](../../../src/server/brief.ts), wired in [src/server.ts](../../../src/server.ts) and [scripts/demo.ts](../../../scripts/demo.ts). Tests: [test/brief.test.ts](../../../test/brief.test.ts).

- **API for ticket 08:** `GET /brief/clis` gives `{ id, label }[]`. `POST /brief/run?settled=0|1` with `{ cli }` gives 202, 400 for a CLI that is not offered, 409 while a run is active. `POST /brief/cancel` gives 204. `/events` sends the tree as the unnamed event (as before) and the `BriefState` as the named event `brief`, at connect and at each change. Read it with `es.addEventListener("brief", …)`; `onmessage` does not get it.
- **State:** `briefService` keeps one `BriefState` and one active run. A cancel returns to the state before the run. A run that throws becomes `failed` with an empty `stderrTail`.
- **Detection** runs once at server start (`detectClis()`), not per request.
- **Demo:** `/events` is now a stream that stays open. The stub runner answers after 2.5 s with the prototype's sample brief (`demo-27` is settled, so its link shows struck through). Knobs: `BRIEF=failed` or `BRIEF=empty` for the other outcomes, `CLIS=0` to offer no CLI.
- **Smoke run** on this machine (real server on a spare port): both CLIs detected; a Claude run on an empty tree gave `done` with 0 actions; a Codex run cancelled after 1.5 s returned to that `done` state with no process left. No T3 token was at hand, so no run used real threads; ticket 06 covered that.
