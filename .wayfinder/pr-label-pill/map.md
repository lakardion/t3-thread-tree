---
label: wayfinder:map
status: open
created: 2026-11-18
---

# Map: Label pills for watched PR labels

Resume the decision tickets with `/wayfinder .wayfinder/pr-label-pill/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/pr-label-pill/map.md`.

## Destination

A buildable spec section in `SPEC.md` and a set of build tickets. With them, an engineer can show a **Label pill** in Tree and Flat rows when a PR of the row has a **Watched label** (first use: `ready-for-review`). The Settings panel gets a new section that lists the watched labels. The map ends when the spec section is written and the build tickets exist.

## Route

Source: markdown tickets in `tickets/`. One stack, server first. Spec: `SPEC.md` › Label pills.

### Lane 1

1. [Build the label data path on the server](tickets/005-label-data-build.md)
2. [Build the Watched labels setting and the Label pill](tickets/006-label-pill-build.md) — stacks on 005-label-data-build

The route is done when both keys are done.

## Stacks

## Notes

- Mode: autopilot

- Terms: **Watched label** and **Label pill** in [the glossary](../../CONTEXT.md). Also **Active thread**, **PR stack**.
- Facts known at charting:
  - T3's streamed thread PR snapshot has no labels: `ThreadPullRequestSnapshot` in `~/repos/t3code/packages/contracts/src/threadPullRequest.ts`.
  - Labels exist in `PullRequestListEntry` and the PR detail struct (`~/repos/t3code/packages/contracts/src/pullRequest.ts`), served by the `pullRequests.list` and `pullRequests.detail` RPCs.
  - The app token has scope `orchestration:read` (`SPEC.md` › Token). The README promises "No polling".
  - PR decode: `decodeThread` in `src/server/t3.ts`. PR shape: `PrNode` in `src/shared/tree.ts`. The Linear setting is stored in page storage (`LINEAR_KEY` in `src/page/app.tsx`); the server also reads `LINEAR_WORKSPACE` from env.
- Related fog: the [GitHub and Linear views map](../github-linear-views/map.md) has an open line on "Provider setup, refresh, and fallback behavior for GitHub metadata". One answer can serve both maps.
- Skills: `research` for 001, `prototype` for 002, `grilling` and `domain-modeling` for 003. `vercel:shadcn` for UI. Write in ASD-STE100.
- Look at the app with `bun run demo`, light and dark, desktop and phone width.

## Decisions so far

<!-- one line per closed ticket -->

Decided at charting (by the user):

- **Destination:** spec first, then build tickets run with `/wayfinder-implement`.
- **Placement:** Tree and Flat rows only.
- **Default:** the Watched label list is empty. No pill shows until the user adds a name.
- **Data source:** a research ticket decides.
- **Terms:** **Watched label** and **Label pill**, now in `CONTEXT.md`.

Closed tickets:

- [Where do PR labels come from, and how fresh are they?](tickets/001-label-data-source.md): T3 RPC `pullRequests.detail` on the open socket; fetch once per PR at start, then again only when its `snapshot.updatedAt` changes; no polling; on failure keep the last labels.
- [How does the Watched labels section in Settings work?](tickets/003-watched-labels-setting.md): one global comma field in a "Watched labels" fold; case-insensitive exact match; page storage sent on `/events`; server fetches only for a non-empty list and keeps all labels server-wide.
- [How does a Label pill read in the row?](tickets/002-label-pill-look.md): one summary pill per row before the PR chips: Tag icon and label initials ("RFR"), filled with the GitHub color; first watched match plus "+N"; own open PRs only, not stack, merged or closed; no pill before the first answer.
- [Write the Label pill spec section and cut the build tickets](tickets/004-spec-and-build-tickets.md): `SPEC.md` › Label pills written; settled rows get no pill; two stacked build tickets, server data path then page setting and pill.

## Not yet specified

- A "Refresh labels" button to skip the T3 sync delay for a label changed on GitHub. Decide after use shows if the 2 to 6 min delay is a problem.

## Out of scope

- Label pills in the details block, the PR stack stops and the Focus cards.
- Adding or removing labels from the app.
- A filter or a sort by label.
- Notifications or a Dock badge for a label change.
