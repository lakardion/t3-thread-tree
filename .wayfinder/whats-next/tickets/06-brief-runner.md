---
title: Build the brief runner (input, CLI run, parse)
type: task
status: closed
assignee: claude
blocked-by: [05-spec-section]
---

## Question

Build the server module that makes one Next-step brief: detect the installed CLIs, build the input from the tree and `statev2.sqlite`, run `claude -p` or `codex exec` with the schema, parse the answer, drop unknown thread ids, and save each thread's title.

## Brief

Follow `SPEC.md` and tickets 01–03. Unit-test the input builder, the parse and the id filter with fixed data. No endpoint and no page in this ticket. AFK.

## Resolution

Built in [src/server/brief.ts](../../../src/server/brief.ts), with the shared state type in [src/shared/brief.ts](../../../src/shared/brief.ts) and the SQLite query as `lastMessages(ids)` in [src/server/lineage.ts](../../../src/server/lineage.ts). Tests: [test/brief.test.ts](../../../test/brief.test.ts).

- **API for ticket 07:** `detectClis()` gives the offered `{ id, label }[]`. `briefInput(tree.projects, lineage.lastMessages, now)` gives the input threads. `runBrief(cli, threads)` gives `{ done, cancel }`; `done` resolves to a `done` or `failed` `BriefState`, or `null` after `cancel()`.
- **Input:** every node of the visible tree (`allThreads`), so launched threads nested under their spawner are included. `subthreads` is the node's child count. `phrase` includes the elapsed time; `age` is from `updatedAt`.
- **Codex** has no system prompt flag. The guide goes before the thread JSON on stdin.
- **Work folder:** `$TMPDIR/t3-thread-tree-brief/` holds `schema.json` and an empty `cwd/` for both CLIs.
- **Smoke run** on this machine: both CLIs detected; a 2-thread input gave a correct brief (Claude 4.4 s, Codex 9.4 s); cancel after 1.5 s gave `null` with no process left.
- **Still open (Check at build):** `~/.codex/AGENTS.md` is still empty here, so the `--ignore-user-config` question stays unproven.
