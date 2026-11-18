---
id: "005"
title: Build the label data path on the server
type: wayfinder:task
status: open
assignee: claude (pr-label-pill-05)
blocked-by: [004-spec-and-build-tickets]
---

## Question

Build the server half of Label pills: read PR labels from T3 and put the matching ones on each `PrNode`.

## Brief

Bottom of the stack; start on `main`. One draft PR. `bun run check` passes. The page shows nothing new yet, so no `README.md` change. Update `SPEC.md` › Label pills when the build changes a fact, and clear the "Check at build" lines that the build confirms.

## Spec

`SPEC.md` › Label pills › Labels from T3, and "Live updates" item 7.

- **Decode** (`decodeThread`, `src/server/t3.ts`): keep `host`, `repository` and `snapshot.updatedAt` on each PR link.
- **Unary call** (`connectShell`): add a `detail(ref)` call that sends a `Request` with a new id and resolves on the `Exit` with that id. Only the `Exit` of the shell request (`id: "1"`) closes the socket. A socket close rejects the calls in flight.
- **Label store:** keep the refresh rule in a pure module with no socket (labels and last-call `updatedAt` per `host + repository + number`, which PRs need a call, the 60 s retry for a stale answer, at most 4 in flight). Cover it with `bun test`: first snapshot, a link with no snapshot, a call dropped by a socket close (gets a call after the reconnect), unchanged `updatedAt` after reconnect, changed `updatedAt`, stale answer, failure keeps the last labels, no call with no list, settled and stack PRs skipped.
- **`/events`:** read `labels=`, split on commas, trim, drop empty names. Add the list to the `Client` and to the tree cache key in `changed()`. A first client with a list starts the calls for PRs with no value.
- **Push:** an answer that changes labels calls `changed()`.
- **Tree** (`PrNode` in `src/shared/tree.ts` and in `DESIGN-SPEC.md` › Data › Tree type, `prNode` in `src/server/build-tree.ts`): `labels: { name: string; color: string | null }[]`, only the case-insensitive matches of the connection's list; `[]` for a settled thread or with no list. Do the match in `buildTree` (new inputs: the list and a label lookup per PR), so the server and the demo share it.
- **Demo** (`scripts/demo.ts`, which has its own `/events` and calls `buildTree`): read `labels=` there too, and give the demo PRs the labels of the prototype rows (branch `prototype/label-pill-look`), so `labels=ready-for-review,needs-qa-on-staging-before-merge,do-not-merge` returns them.
- **Check:** with a running T3 and a real token, `/events?labels=ready-for-review` returns labels on a PR that has the label.
