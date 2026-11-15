---
title: Add the send and start endpoints (t3 CLI subprocess)
type: wayfinder:task
status: closed
assignee: claude (send-message-02)
blocked-by: [01-send-spec]
---

## Question

Give the page two endpoints that send a message to a thread and start a thread, through the `t3` CLI.

## Spec

- Follow the "Send message" section of `SPEC.md` for paths, bodies and status codes.
- Spawn `t3 thread send <threadId> -` and `t3 thread start <projectId> -` (plus the flags the spec picks) with `Bun.spawn`. Write the message to stdin. Never put the message in argv.
- Check the thread or project id against the live thread map. Reject an unknown id; do not pass it to the CLI.
- Return the CLI's stderr tail on a non-zero exit. Return the new thread id from `t3 thread start --json`.
- `scripts/demo.ts`: a stub that answers after a short delay, with a knob for a failure (as `BRIEF=failed`).
- Tests: id check, argv shape (no message in argv), failure mapping.

## Done when

`bun run check` passes. A smoke run against the real T3 sends one message to a test thread and starts one thread.

## Handed over from send-message-01

- `SPEC.md` › "Send message" fixes the routes (`GET /t3/cli`, `POST /t3/send`, `POST /t3/start`), the error body, the demo knobs (`SEND=failed`, `T3CLI=0`) and the smoke run steps.
- Update `README.md`: add the optional `T3_BIN` line to Setup, and the `SEND=failed` and `T3CLI=0` demo knobs to Run.
- The smoke run confirms the `send --json` and `start --json` stdout shapes. Then remove that item from "Check at build" in `SPEC.md`.
