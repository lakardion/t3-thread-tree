---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map: Get to a thread fast

Resume the decision tickets with `/wayfinder .wayfinder/reach-a-thread/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/reach-a-thread/map.md`. Parent: [Effort G: get to a thread fast](../improvements-program/tickets/07-effort-g-reach-a-thread.md).

## Destination

The user gets to a known thread in a few keys or clicks. A **Focus list** above the tree holds up to 3 threads that the user chose. A Find control (Cmd/Ctrl+K) finds any thread by title, issue key, project or branch. The keys `j`/`k` move through the rows. The three items M20, M22 and M21 are merged to `main`, one draft PR each, in that order, as one stack 04 ← 05 ← 06. The user tests the stack and merges it, bottom PR first.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Add the Focus list](tickets/04-focus-list-build.md) (M20) — merged in #88 (`0b15066`)
2. [Add Find](tickets/05-find-build.md) (M22) — starts on `main` (04-focus-list-build is merged), and after [the Find rules](tickets/02-find-rules.md) and [the page keys](tickets/03-page-keys.md) close
3. [Add the keyboard path through the rows](tickets/06-row-keys-build.md) (M21) — stacks on 05-find-build, and after [the page keys](tickets/03-page-keys.md) close

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- 05-find-build ← 06-row-keys-build, on `main`. 04-focus-list-build merged alone in #88, so 05 branches from `main`; 06 branches from 05.
- The stack starts on `main` after the wait-time stack (M04 ← M05 ← M19) merges, because M19 adds the first page key (`n`) and the "Open next" header button. The decision tickets do not wait for it.

## Notes

- Mode: autopilot
- **Stack gate.** A route key unblocks the next key in its chain when its draft PR opens. The next key stacks on its branch.
- **The stack stops for the user.** Each build session opens a draft PR and hands off to the next key. The user tests the stack with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. No feature toggles.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Decision tickets come first; each decision ticket writes the `## Spec` of its build ticket when it closes.
- **One key handler.** The page keys ticket decides all page keys and their guards. The Find build adds the shared handler (or extends the one that M19 added); the row keys build extends it.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **Source:** [the merged review](../improvements/research/03-merged-review.md) › M20, M21, M22 (file:line references at `5bf8567`). The order and the rules are in [Order the merged list](../improvements/tickets/04-order-and-group.md).
- **User profile.** The user runs many T3 Code threads at once and gets overwhelmed. Judge every choice against: less noise, a clear next step, low effort to re-enter a thread.
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01. `grilling` and `domain-modeling` for 02 and 03. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md` (**Focus list**, **Needs you**, **Wait**).
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys). Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the three PRs are merged.
- **Mode:** autopilot. The three build keys run unattended as one stack of draft PRs, 20 ← 22 ← 21.
- **Base:** the stack starts on `main` after the wait-time stack merges.
- **M20 kept, smaller:** one list of up to 3 chosen threads, with no Now/Next split. The prototype ticket settles its look. It is local to this app: it changes no T3 state and does not reorder the tree.
- **Term:** **Focus list** in `CONTEXT.md`. The Focus list ticket confirms the final name.
- **Keys:** one decision ticket for all page keys and their guards. M21's rules are part of it.

- [How does the Focus list look and work?](tickets/01-focus-list-look.md): prototype D, a strip of 3 slot cards above the tree, hidden by default behind a Focus header button; add from the row (⌖) and from brief Actions; drag a row onto the strip (a drop on a card replaces it after a confirmation); buttons refuse at 3 of 3; settled or deleted threads leave; `localStorage`; UI label "Focus"; keys 1 to 3 go to the page keys.
- [What does Find match, and how does the user pick a result?](tickets/02-find-rules.md): a Cmd/Ctrl+K dialog on shadcn `Command`; substring match on title, key, project, branch and PR over loaded threads, best match first; Enter opens, Show in tree unfolds and stores folds; a "Search settled threads" row asks the server; Find never turns off a view setting.

## Not yet specified

- How `j`/`k` (row keys) act on folded projects, a closed stack and the flat view. It hangs on the page keys. (Show in tree: decided in the Find rules.)

## Out of scope

- Writes to T3 (pin, snooze, settle). The Focus list is local.
