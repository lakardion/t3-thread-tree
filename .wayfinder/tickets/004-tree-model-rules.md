---
id: 004
title: Tree model rules for the nested tree
type: grilling
status: closed
assignee: claude-004-session
blocked_by: [002]
---

## Question

What are the exact rules that place each thread in the tree Project › Issue key › spawn lineage?

Settle these cases:

- **Issue key extraction**: the pattern, and what to do with a title that has no key, or two keys.
- **Lineage crosses keys**: a subthread with a different key than its parent (for example, JED-4312 launches JED-4313). Does it stay under its parent, or move to its own key?
- **PR stack across keys**: JED-4312 and JED-4313 share one stack. Is the stack only a badge, or does it also join the two keys?
- **Launcher threads**: intermediate threads that only launch the next one (JED-4313 <- JED-4313 launcher <- JED-4312). Show them, or collapse them into the edge?
- **Orphans**: a subthread whose parent is not active, or not in the view.
- **Active thread**: the exact rule (unsettled? which statuses? a recency window?).

Use the lineage findings (002) to know which links are real.

## Resolution

Grilled with the user on 2026-11-12. The data is a T3 MCP snapshot of 263 unsettled threads (37 top-level, 226 subagents), and the lineage comes from the tool-call rows (002). A placement check on that snapshot put the 37 top-level threads into 22 project/key groups. No thread was lost or placed twice.

Terms: a **top-level thread** has no native `parentThreadId`. A **subagent** has `relationshipToParent: subagent`. The **spawner** of a top-level thread is its caller, found from the tool-call row first and from `senderThreadId` as a fallback (002).

### Rules

1. **Active (visible) thread.** A top-level thread is visible when `settledAt` is null, for all statuses. No recency window applies. A subagent is visible only when its top-level ancestor is visible. Subagents never get settled on their own, so their own `settled` flag does not count. The settled toggle makes all threads visible.
2. **Snoozed.** A snoozed thread is still visible. The UI shows it muted, with its wake time.
3. **Issue key.** Use the first match of `/\b[A-Z][A-Z0-9]+-\d+\b/` in the title. Read the key only on top-level threads. If a title has two keys, the first key wins (no such title exists today). `Review #15708 JED-4319` gives `JED-4319`, because `#15708` does not match.
4. **Visible spawner.** Start at the spawner and go up the spawner chain. Skip threads that are not visible, and stop at the first visible one. If none is visible, the thread has no visible spawner.
5. **Placement of a top-level thread:**
   - **Keyed:** the thread goes under `Project › its key`, always. A spawner with a different key or no key does not change this.
   - **Keyless, with a visible spawner in the same project:** the thread nests under that spawner. Example: Wayfinder ticket threads go under their map thread.
   - **Keyless, otherwise:** the thread goes under `Project › No issue key`.
   - The project is always the thread's own `projectId`. A spawner in another project is not followed.
6. **"Launched by" hint.** A top-level thread that does not nest under its spawner shows a muted "launched by X" link. X is the visible spawner if one exists, or else the direct spawner (which can be settled). Examples: JED-4313 shows "launched by JED-4312". Review #15745 TIB-4096 shows "launched by Build draft GitHub comments".
7. **Subagents** always nest under their native parent. They do not move to a key, even when their title contains one (for example `Implement ENG-6064 recipe change`). When the parent is hidden, the subagent is hidden too. Today 58 subagents of 22 settled parents are hidden this way.
8. **Launcher threads** get no special rule. Rule 4 skips settled launchers (16 of 18 today). An active launcher is a normal node, and its key places it.
9. **PR stack** adds no tree level. Each node shows a stack badge with its position (for example 3/9). Key groups in one project that share a stack sort next to each other, in stack order. Example: ENG-6081 to ENG-6086.

### Edge cases from the data

- The cross-key chain `combobox → ENG-6081 → … → ENG-6086` becomes six sibling key groups, each linked to the previous one by its hint. The keyless `combobox` root stays in "No issue key".
- `JED-4313 ← JED-4313 launcher (settled) ← JED-4312 (active)`: JED-4313 is a root under its key, with the hint "launched by JED-4312".
- A keyed thread with only settled spawners (JED-4310, JED-4312, review threads): a root under its key, and the hint names the settled direct spawner.
- Cross-project launches (13 exist, for example `t3exp` threads that `Adapt Issue Planning for T3 Code` started) stay in their own project, with the hint.
