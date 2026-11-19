---
id: "006"
title: How does the main view group by Linear project and milestone?
type: grilling
status: closed
assignee: damian.lucero
blocked_by: ["002", "005"]
---

## Question

The engineer wants the main view (Tree and Flat) to group threads by Linear project, with a subgroup per milestone. Today the tree groups by T3 project, then issue key. The flat view has "Group by" with "None" and "Status". [Current tree and flat rules](../../../SPEC.md#ui), [tree order rules](../../../SPEC.md#tree-rules), [tree construction](../../../src/server/build-tree.ts).

Decide:

- Where the control sits: a new "Group by" option in Flat, a choice in Tree, or both.
- In Tree, whether the Linear project replaces the T3 project level or nests inside or outside it.
- Where threads go with no issue key, with an issue that has no project, and with a project but no milestone. Decide where review threads go.
- How a thread with several issue keys, or a PR stack whose members sit in different projects, groups. Use the association rules from ticket 002.
- The order of projects and milestones, how drag order and folds are stored, and how "Needs you", "Show settled" and "Show snoozed" apply.
- What the group headers show, such as a link to the Linear project and the milestone target date.

Close with worked examples of one Tree and one Flat layout. Each example has two projects, a milestone with two issues, an issue with no milestone, and a thread with no issue key.

## Resolution

The user chose these rules in two rounds.

- **Control.** Tree gets a "Group by" menu: "T3 project" (default) and "Linear project", saved under its own `localStorage` key. Flat "Group by" gets a third choice, "Linear project". Both choices are disabled when no Linear key is set (ticket 005).
- **Tree.** Linear project › milestone › thread. The Linear project replaces the T3 project level. There is no issue-key level: one key usually has one thread. Each row shows its T3 project as a muted chip.
- **Flat.** One fold section per milestone, headed "Project · Milestone" or "Project · No milestone". Folds and drag follow the "Group by Status" rules: a row drags only inside its section, and all sections share the one flat order.
- **Placement.** The first key in the title places the thread, as tree rule 4 does. The overview still lists a thread under every key (ticket 002). A PR stack adds no level: stack threads keep their ⧉ badge and sit next to each other in stack order inside a group. A stack stays whole: the lowest stack member that has an issue key places the full stack in one project and milestone (user decision after the demo review).
- **Fallback groups,** after the Linear projects, in this order:
  - "Reviews": all `Review #` threads, with key subgroups as today.
  - "No project": a keyed thread whose issue has no project, or that Linear does not know.
  - Keyless threads: loose rows after the groups, with no "No issue key" header (user decision after the demo review). Keyless stack threads sit next to each other in stack order.
  - "No milestone" is the last group inside a project.
- **Order.** Projects sort by their oldest thread and drag; the order is its own stored list. Milestones sort by target date, soonest first, then milestones with no date, then "No milestone"; they do not drag. Threads in a milestone sort by `createdAt` and drag inside it. Linear-mode lists are separate from T3-mode lists, so a drag in one mode never changes the other. "Reset order" clears both. "Last updated" sorts as today.
- **Headers.** Project: the name, an external-link icon to the Linear project URL, and the thread count. Milestone: the name, the target date in muted text ("Dec 4"), and the count. No overdue color. Fallback groups show the name and the count.
- **Filters and folds.** "Needs you", "Show snoozed" and "Show settled" work as today: they hide threads, never change placement, and an empty group hides. The Settled list stays ungrouped below. Folds save in the closed-rows store with ids per Linear project and milestone.
- **Launch nesting.** A keyless thread nests under its visible spawner only when the spawner sits in the same group.

Tree example:

```
▾ Hiring Flow ↗                    4
  ▾ M1 Beta · Dec 4                3
      A  ENG-10 filter      [frontend]
      H  ENG-10 api         [backend]
      C  ENG-11 form        [frontend]
  ▾ No milestone                   1
      D  ENG-12 copy        [frontend]
▾ Billing ↗                        3
  ▾ Q1 GA · Jan 15                 2
      E  ENG-20 invoices    [backend]
      F  ENG-21 tax         [backend]
  ▾ No milestone                   1
      G  ENG-22 cleanup     [backend]
▾ Reviews                          1
  ▾ ENG-90
      R  Review #44 ENG-90
    K  Bump deps            [frontend]
```

Flat example (same threads):

```
▾ Hiring Flow · M1 Beta · Dec 4    3   A, H, C
▾ Hiring Flow · No milestone       1   D
▾ Billing · Q1 GA · Jan 15         2   E, F
▾ Billing · No milestone           1   G
▾ Reviews                          1   R
  K  (loose row, no section)
```
