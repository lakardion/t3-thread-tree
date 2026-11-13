---
title: Order the tree by creation, new items at the bottom
type: wayfinder:task
status: open
assignee:
blocked-by: []
---

## Question

Stop the sort by latest activity. Order projects, groups and threads by creation time, oldest first, so a live push never moves an existing row.

## Spec

- `src/server/build-tree.ts`: replace the `latest` (`updatedAt`) sort with a creation key.
  - A thread's key is its `createdAt`; tie-break by thread id.
  - A group's key is the oldest key of its threads. A project's key is the oldest key in it.
  - Subthreads under a parent sort the same way.
  - Keep the fixed sections in a project: issue-key groups, then Reviews, then No issue key.
  - Groups that share a PR stack stay together, in stack order, at the slot of their oldest member.
- A new thread, group or project appends at the end of its list. A thread that changes status, gets a PR or gets a new run does not move.
- Tests in `test/build-tree.test.ts`: an `updatedAt` or run change does not move a row; a new thread appends at the end of its group; a new group appends at the end of its section.
- `SPEC.md` › Order: describe the creation order. Update `README.md` if it describes the order.

## Done when

`bun run check` passes, and the demo shows the same order before and after a reload.
