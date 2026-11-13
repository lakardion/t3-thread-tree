---
title: Write the "What's next" section of SPEC.md
type: task
status: closed
assignee: claude
blocked-by: [04-brief-layout-prototype]
---

## Question

What does `SPEC.md` say about the "What's next" button and the Next-step brief, so that the build tickets have one source?

## Brief

Write the section from the map's decisions and tickets 01–04: CLI routes and detection, the input, the schema and the id filter, the prompt file, the endpoints and the in-memory last brief (with saved titles), and the page (inline panel). Link the tickets. Do not restate the prompt guide. AFK.

## Resolution

`SPEC.md` › "What's next" and the Next-step brief holds the build source. Decisions the section adds beyond tickets 01–04:

- **Push, not poll:** `GET /events` also sends the brief state as a named SSE event `brief`, on open and at each change.
- **Endpoints:** `GET /brief/clis`, `POST /brief/run?settled=0|1` with `{ cli }` (409 while a run is active), `POST /brief/cancel`.
- **State:** one shared `BriefState` type (`idle` | `running` | `done` | `failed`). A cancel returns to the state before the run; a new brief replaces the last one only when it ends.
- **Detection** runs once at server start. With no CLI offered, the button is disabled with a tooltip.
- **Error text:** the CLI's own message, "timed out", or the parse error; `stderrTail` is the last 2 KB.
- The open Codex `AGENTS.md` question from ticket 01 went to "Check at build".
