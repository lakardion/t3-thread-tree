---
title: Build the brief runner (input, CLI run, parse)
type: task
status: open
assignee:
blocked-by: [05-spec-section]
---

## Question

Build the server module that makes one Next-step brief: detect the installed CLIs, build the input from the tree and `statev2.sqlite`, run `claude -p` or `codex exec` with the schema, parse the answer, drop unknown thread ids, and save each thread's title.

## Brief

Follow `SPEC.md` and tickets 01–03. Unit-test the input builder, the parse and the id filter with fixed data. No endpoint and no page in this ticket. AFK.
