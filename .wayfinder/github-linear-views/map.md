---
label: wayfinder:map
status: open
created: 2026-11-17
---

# Map for GitHub and Linear views of active work

Resume the route keys with `/wayfinder-implement .wayfinder/github-linear-views/map.md`. Run `/wayfinder-implement .wayfinder/github-linear-views/map.md <KEY>` after a PR opens or merges.

## Destination

"Group by Linear project" merged to main in the main view (Tree and Flat), with a subgroup per milestone, built from tickets 005 and 006. `SPEC.md` › Linear grouping and `README.md` describe it. No flag.

## Route

Source: markdown tickets in `tickets/`. One chain, server first: Tree and Flat both live in `src/page/app.tsx`.

### Lane 1

1. [Build the Linear project and milestone source on the server](tickets/007-linear-source-build.md)
2. [Build Group by Linear project in Tree](tickets/008-linear-tree-build.md) — stacks on 007
3. [Build Group by Linear project in Flat](tickets/009-linear-flat-build.md) — stacks on 008

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- `main ← github-linear-views-007-build-linear-source (#111) ← github-linear-views-007-build-linear-source-wiring (#112) ← github-linear-views-008-build-linear-tree (#114) ← github-linear-views-008-build-linear-tree-page (#115) ← github-linear-views-009-build-linear-flat (#116)` (GitHub stack #113)

## Notes

- Use [the thread glossary](../../CONTEXT.md) for **Active thread**, **Issue key**, and **PR stack**. Active subthreads follow their top-level ancestor.
- Use `grilling` and `domain-modeling` for decision tickets.
- Mode: autopilot
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs.
- **Spec:** each build ticket's Spec section, then tickets 005 and 006. Each PR writes its part of `SPEC.md` › Linear grouping and updates `README.md`.
- **Skills:** `tdd`, `gh-stack`, `committer`; `vercel:shadcn` for UI. Write in ASD-STE100.

## Decisions so far

<!-- One line per closed decision ticket. -->

- [Which threads belong under each PR or Linear issue?](tickets/002-item-associations.md): only `created` and `agent` PR links and every key in a thread title count; subthreads roll up to their top-level thread; PR identity is `owner/name#N`, issue identity is the key; unlisted-team keys get no row; no workspace means no Linear rows.
- [Where does the app get each issue's Linear project and milestone?](tickets/005-linear-project-milestone-source.md): Linear GraphQL with a personal API key in a 0600 file, one batched `issues(filter: { id: { in } })` request, server cache refreshed every 10 min and on new keys; missing or failed source disables or freezes Linear grouping.

- [Which items stay visible while their threads are active?](tickets/001-item-membership.md) (overview only, now out of scope): an item shows while an active thread links it, whatever its PR or Linear state; view controls hide threads, never items.
- [How does the main view group by Linear project and milestone?](tickets/006-group-by-linear-project.md): a "Linear project" Group by choice in Tree and Flat; Tree is Linear project › milestone › thread with no key level, Flat has one section per milestone; first title key places a thread; a PR stack stays whole, placed by its lowest keyed member; Reviews and No project go last, then keyless threads as loose rows with no header; projects drag, milestones sort by target date.
- [What does each item need to show at a glance?](tickets/003-row-information.md) (overview only, now out of scope): PR row is `owner/name#N`, title and the existing PR chip; Linear row is the key plus the oldest linked thread title without the key; threads use the Flat row plus project and a review tag; no new provider lookup.

## Not yet specified


## Out of scope

- [Do separate or combined views make active work easier to scan?](tickets/004-overview-layout.md): the engineer tried three overview layouts and dropped the GitHub and Linear overview. Linear grouping in the main view is what matters.

- PRs and Linear issues unrelated to active T3 threads.
- Editing, merging, or changing state in GitHub or Linear from the overview.
- Implementing the GitHub and Linear overview (tickets 001, 003, 004).
- Removing issue-key nesting from the T3-project tree. The user may want it, but it changes the existing tree, not the Linear grouping (raised in [How does the main view group by Linear project and milestone?](tickets/006-group-by-linear-project.md)).
