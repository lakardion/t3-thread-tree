---
title: Where does a brief run spend its time?
type: task
status: closed
assignee: claude
blocked-by: []
---

## Question

How many seconds of a brief run go to CLI start-up, to the input, and to the output, for each CLI? This is the baseline that the map must beat.

## Brief

AFK. Use `runBrief` and `cliArgs` in `src/server/brief.ts` on this machine. Do at least 3 runs per case, and record the median:

1. Fixed cost: a trivial prompt with a 1-action schema.
2. Today's input from the live tree (`briefInput`), with its token count.
3. The same threads with no `lastMessage` field, and with only the threads that are not working.
4. Output size: the answer token count, and the time with `prompt` forced to `null`.

Get the token counts from the CLI JSON output (`usage`) where it gives them. Write the results as a table in the resolution. Do not change the code.

## Resolution

Folded into [Rank the obvious actions in code and skip the model when it has nothing to judge](06-code-ranked-actions-build.md). That ticket measures the baseline on `main` before its change and again after, so the route runs with no separate session.
