---
id: 004
title: Tree model rules for the nested tree
type: grilling
status: open
assignee:
blocked_by: [002]
---

## Question

What are the exact rules that place each thread in the tree Project › Issue key › spawn lineage?

Settle these cases:

- **Issue key extraction**: the pattern, and what to do with a title that has no key, or two keys.
- **Lineage crosses keys**: a subthread with a different key than its parent (for example, JED-4312 launches JED-4313). Does it stay under its parent, or move to its own key?
- **PR stack across keys**: JED-4312 and JED-4313 share one stack. Is the stack only a badge, or does it also join the two keys?
- **Orphans**: a subthread whose parent is not active, or not in the view.
- **Active thread**: the exact rule (unsettled? which statuses? a recency window?).

Use the lineage findings (002) to know which links are real.
