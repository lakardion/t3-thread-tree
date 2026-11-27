# The Lineage group replaces the Map group and Launch nesting

The Map group rule found a map from free text in the first message of a thread (four `/wayfinder` forms) and joined threads by that key. This worked only for users who follow the `t3-handoff` convention, and a failed parse lost the group. Launch nesting, off by default, nested only threads with no Issue key. We replace both with one first rule, the Lineage group: every spawn tree groups under its root thread, from the T3 spawner chain only (launch and delegate edges). A wayfinder map is an optional label on part of a group. The first-message parser stays, but it decides only the label, never the group. This supersedes the first consequence of ADR 0001: the chain is now Lineage group (always first), then Reviews, PR stack and Issue key (reorderable), and the "same home" nest condition goes.

## Considered options

- **Keep map detection and add a second source.** Rejected: no T3 record names a map for most threads. A `Skill` tool row exists for 7 of 207 keyed threads and for no charting thread.
- **Split a lineage at another Issue key, project or sub-map.** Rejected: the tickets of one map have different Issue keys, and no real root spawns unrelated work, so a split breaks the main case.
- **Join a hand-started keyed thread to its map by key.** Rejected: a key edge brings back grouping by message text. The same key can label parts of two groups, and the map PR graph scope spans them.
- **Keep the hand mark for maps with no key.** Rejected: a Lineage group covers that case with no setup.

## Consequences

- A launched thread with an Issue key or a `Review #` title now leaves its key group or Reviews and goes into its lineage, by default.
- With the rule off, no thread nests under its spawner.
- Every Lineage group gets a PR graph scope, `lineage:<root thread id>`.
