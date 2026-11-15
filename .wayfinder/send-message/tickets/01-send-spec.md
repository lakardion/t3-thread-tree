---
title: Write the "Send message" spec
type: wayfinder:task
status: open
assignee:
blocked-by: []
---

## Question

Write the "Send message" section of `SPEC.md` from the decisions in the map (charting and grilling). No code.

## Spec

- `SPEC.md`: change the scope line, so send and launch leave "Out of scope" (settle, snooze, interrupt stay out). Add a "Send message" section:
  - The send dialog: target (picker for a step, fixed for a row), editable message, Confirm send, Cancel, keys, busy-target note, inline failure with the draft kept.
  - The start dialog: project select, title default, editable prompt.
  - The "Sent to <thread>" mark on a brief step.
  - The HTTP contract that ticket 02 builds: paths, bodies, status codes (unknown id, missing CLI, CLI failure with stderr tail), the new thread id from a start.
  - How the server finds and runs the CLI (`T3_BIN`, `~/.t3/bin/t3`, message on stdin only) and the CLI-available flag that the page reads.
  - The demo stub and its failure knob.
- `CONTEXT.md`: add the terms **Send** and **Start thread**.
- `README.md`: change "The app never writes to T3" and the Status section to match.

## Done when

`bun run check` passes, and the section answers every question that tickets 02 to 05 need, with no open point.
