---
title: Add "Open next"
type: wayfinder:task
status: open
assignee:
blocked-by: [03-open-next-rules, 04-row-wait-build, 05-sort-by-wait-build]
---

## Question

Build M19: one "Open next" control that opens in T3 the thread with the longest **Wait**, with the rules of [the Open next rules](03-open-next-rules.md).

## Spec

<!-- written by 03-open-next-rules on resolution -->

Known now:

- It writes nothing to T3. It opens `t3code://threads/<environmentId>/<threadId>` (`threadUrl`, `src/desktop/runtime.ts`).
- The blocker on 05-sort-by-wait-build is forced: it keeps the order M04 → M05 → M19.
- Update `SPEC.md` and `README.md`.
- One PR. The user tests and merges it.

## Done when

<!-- written by 03-open-next-rules on resolution -->
