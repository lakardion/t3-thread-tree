---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: Less noise

Resume the decision tickets with `/wayfinder .wayfinder/less-noise/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/less-noise/map.md`. Run `/wayfinder-implement .wayfinder/less-noise/map.md <ticket>` after a PR opens or merges.

## Destination

Rows that need no action take less space and less attention. The flat sections fold, and the tree can hide snoozed threads (M09). A working row loses its edge and its wash (M13). A closed project shows counts instead of one icon for each thread (M16). The three items are merged to `main`, one PR each, in that order, as one stack 03 ← 04 ← 05. The user tests the stack and merges it, bottom PR first.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Fold the flat sections and add "Show snoozed threads"](tickets/03-section-fold-build.md) — after [the fold rules](tickets/01-section-fold-rules.md) close, and after the [wait-time](../wait-time/map.md) and [status-groups](../status-groups/map.md) stacks merge to `main`
2. [Remove the edge and the wash from working rows](tickets/04-quiet-working-build.md) — stacks on 03-section-fold-build (forced)
3. [Show counts on a closed project](tickets/05-closed-counts-build.md) — stacks on 04-quiet-working-build (forced), and after [the closed-project count look](tickets/02-closed-counts-look.md) closes

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- main ← less-noise-03-fold-flat-sections (#82) ← less-noise-04-quiet-working-rows (#83) ← 05-closed-counts-build. GitHub stack #84. The stack starts from `main` after the wait-time and status-groups stacks merge. Each key branches from the branch of the key before it.

## Notes

- Mode: autopilot
- **Merge gate.** The build keys start only after the wait-time stack and the status-groups stack are merged to `main`. Both change the flat sections in `src/page/view.ts`, and so does M09. The decision tickets run now.
- **Stack gate.** A route key unblocks the next key in its chain when its draft PR opens. The next key stacks on its branch.
- **The stack stops for the user.** Each build session opens a draft PR and hands off to the next key. The user tests the stack with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. No feature toggles.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Each decision ticket writes the `## Spec` of its build ticket when it closes.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **Source:** the [improvements-program map](../improvements-program/map.md), effort D. The item details and file:line references (at `5bf8567`) are in [the merged review](../improvements/research/03-merged-review.md) › M09, M13, M16. `main` has moved since `5bf8567`; read the code again before a build.
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `grilling` and `domain-modeling` for 01. `prototype` for 02. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md`.
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys), because `/wayfinder-implement` reads that format. Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the three PRs are merged.
- **Mode:** autopilot, as one stack of draft PRs. The builds wait for the wait-time and status-groups stacks to merge.
- **M09 reversal accepted:** flat sections fold ("Idle and snoozed" and "Done" closed at first), which reverses `SPEC.md:103`. A "Show snoozed threads" switch, on by default, makes tree rule 3 (`SPEC.md:72`) a choice. The details go to [the fold rules](tickets/01-section-fold-rules.md).
- **M13 reversal accepted:** a working row loses its edge and its wash, and keeps the turning icon. This reverses the working gradient in `DESIGN-SPEC.md` › Gradients. A working thread needs nothing from the user, and `plan-ready` and `your-turn` rows have no wash, so the working wash is louder than two of the three waiting states. No decision ticket.
- **M16 look:** a prototype ticket decides between words and icon + number.

- [How do the flat sections fold, and how does "Show snoozed threads" work?](tickets/01-section-fold-rules.md): every status section folds, under its own key `thread-tree:sections`; "Idle and snoozed" and "Done" start closed; no icons, no auto-open, no flat fold-all. The snoozed switch is a page filter in the tree and the flat view, below "Show settled threads"; a hidden parent stays as a context row. New term **Status section**.
- [How does a closed project show its thread counts?](tickets/02-closed-counts-look.md): icon + number for each flat section, on closed projects with 5 or more threads; key groups and the waiting edge do not change.

## Not yet specified

<!-- none at charting -->

## Out of scope

- The "Needs you" count format and the context rows (M06, M07). They are effort B.
- Sort by Wait in the flat sections (M05). It is effort A.
- An edge or a wash for `plan-ready` and `your-turn` rows. It is not in the merged review.
- Writes to T3 (settle, snooze). The snoozed switch only hides rows on the page.
- Feature toggles.
