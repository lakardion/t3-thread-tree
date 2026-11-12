---
id: 005
title: Rough tree UI on a real snapshot
type: prototype
status: closed
assignee: claude-005-session
blocked_by: [001, 004]
---

## Question

How should the tree look and behave so that the user sees "what is what" at a glance?

Build a throwaway page from a real snapshot of the user's threads. Use the tree rules from 004. React to it: status colors, what one node shows, collapse defaults, how many review-lens subagents to show before a count.

## Resolution

Reviewed with the user on 2026-11-12, on a page built from the 263-thread snapshot with the 004 rules (37 top-level threads, 18 groups; the "22 groups" in 004 is a miscount, `place.py` also gives 18). The user compared three layouts: outline tree, project board, table tree.

Prototype: branch `prototype/005-tree-ui`, folder `prototype/005-tree-ui/`. Open `thread-tree-prototype.html`; variant D is the chosen design.

### Decisions

1. **Layout: outline tree.** One indented line per node: Project › group › thread, with keyless children nested under their spawner (004 rule 5). Disclosure arrows on project and group rows. A closed group shows one status dot per thread.
2. **Reviews group.** A thread whose title starts with `Review #` goes under `Project › Reviews › key`, not under `Project › key`. This overrides 004 rule 5 for review threads. In each project the order is: issue keys, then Reviews, then No issue key.
3. **Status colors** (kept as shown): needs input (pending user-input request) = orange; running = blue, pulsing; done, your turn (`completed`) = green; cancelled = red; snoozed = grey, title muted, with a "until <time>" badge.
4. **Node content:** status dot, title (click opens the thread in T3), stack badge with position (for example `⧉ 3/6`), and PR numbers as links to the PR. No age, no last message, no "launched by" hint. This drops 004 rule 6 from the UI.
5. **Subagents: not shown.** No rows, no counts, no signal. 004 rule 7 still decides which threads are visible, but the tree has top-level threads only. The "how many review-lens subagents before a count" question is void.
6. **Collapse default:** all project and group rows load open.
