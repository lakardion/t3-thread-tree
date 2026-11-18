---
id: "001"
title: Which items stay visible while their threads are active?
type: grilling
status: closed
assignee: damian.lucero
blocked_by: []
---

## Question

Which associated PRs and Linear issues appear in the overview, and when do they leave? The thread population is all active threads across all T3 projects, including waiting and snoozed threads.

Decide what happens when a PR merges but its thread is still active, when a Linear issue is already complete, and when the last active thread linked to an item settles. Decide whether controls such as Needs you and Show snoozed narrow the overview or apply only to the thread layouts. Use the existing definitions and lifecycle rules as input. [Thread glossary](../../../CONTEXT.md), [tree construction](../../../src/server/build-tree.ts), [current view controls](../../../SPEC.md#ui).

Close with a table of which items show in each case and what happens when the overview becomes empty.

## Resolution

Decided with the engineer in a grilling session on 2026-11-18.

**Rule.** The overview derives its items live from the active threads. A PR or Linear issue shows while one or more active threads link it. Ticket 002 decides what "link" means. The page stores no item list. An item leaves on the next live push after its last linked active thread settles or is deleted. No grace period applies.

**Provider state does not change membership.**

- A merged or closed PR stays while a linked thread is active. It shows a Merged or Closed mark (T3 gives `open`, `merged` or `closed`). The mark is a cue to settle the thread.
- A Linear issue shows whatever its Linear state is. The app has no Linear state today. If ticket 005 adds a source, a Done mark is display only (ticket 003).

**View controls narrow threads, not items.**

- "Needs you" and "Show snoozed threads" off hide the matching threads under an item, as in the thread layouts.
- An item stays visible when the controls hide all its threads. It shows muted, with a "+N hidden threads" note and no thread rows.
- "Show settled" does not change the overview. Settled threads stay in the Settled list.

| Case | Item shows? | How |
| --- | --- | --- |
| One or more active threads link the item | Yes | Normal |
| PR merged or closed, linked thread active | Yes | Merged or Closed mark |
| Linear issue complete, linked thread active | Yes | Normal; Done mark only if ticket 005 adds Linear state |
| Linked thread snoozed or waiting | Yes | Normal; thread rows follow the controls |
| "Needs you" or snoozed-off hides all linked threads | Yes | Muted, "+N hidden threads", no thread rows |
| Last linked active thread settles or is deleted | No | Leaves on the next live push |
| Only settled threads link the item, "Show settled" on | No | Settled threads stay in the Settled list |
| No active thread links any item | — | One muted line, "No active thread links a PR or Linear issue", below the usual T3-down and token banners |
