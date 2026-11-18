---
id: "004"
title: Write the Label pill spec section and cut the build tickets
type: task
status: closed
assignee: damian.lucero
blocked_by: ["001", "002", "003"]
---

## Question

Write a "Label pills" section in `SPEC.md` from the answers of 001 to 003, with refresh and failure behavior. Then add the build tickets to this map, one per PR, with blocking edges, so `/wayfinder-implement` can run them. Each build ticket updates `README.md` for its visible feature (see `CLAUDE.md`).

## Resolution

`SPEC.md` has a new "Label pills" section, with the setting, the match, the label calls with their refresh and failure rules, and the pill. It also changes "UI" (the row, and five Setup folds), "Live updates" (item 7) and "Check at build" (four label facts).

The user decided two gaps:

- **Settled rows:** no pill. The server calls `detail` only for PRs of unsettled threads, and a settled thread's PRs get no labels.
- **Slices:** two stacked PRs.

Other gaps closed in the spec:

- One call rule covers start, a new PR, a label change and a reconnect: call when the snapshot `updatedAt` differs from the value at the last call.
- Calls run only for open PRs that are not stack PRs, the PRs that a row can count.
- A label with no color (GitLab) uses the `secondary` badge colors.

Build tickets, in stack order:

1. [Build the label data path on the server](005-label-data-build.md): decode, unary `detail` call, label store with `bun test`, `labels=` on `/events`, `PrNode.labels`, demo labels. No README change.
2. [Build the Watched labels setting and the Label pill](006-label-pill-build.md): Settings fold, pill in Tree and Flat rows, `README.md` and `DESIGN-SPEC.md`.
