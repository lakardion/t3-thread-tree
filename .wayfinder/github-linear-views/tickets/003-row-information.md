---
id: "003"
title: What does each item need to show at a glance?
type: grilling
status: closed
assignee: damian.lucero
blocked_by: ["001", "002"]
---

## Question

What information does an engineer need on each item to recognize the work and pick a thread to open? Decide which fields are required for the PR or issue and which fields belong on the associated threads.

Check whether the existing PR snapshots, issue keys, and thread titles and statuses are sufficient. Decide how a row reads when a title, state, or provider link is unavailable. If an essential field requires a provider lookup, name the field and the provider so the map can add a focused research ticket. [Shared tree data](../../../src/shared/tree.ts), [PR decoding](../../../src/server/t3.ts), [Linear link builder](../../../src/page/format.ts).

Close with one example row per provider and the required fields for each example, including a missing-data case.

## Resolution

Decided with the engineer in a grilling session on 2026-11-18. Every field comes from data the app already has. This ticket adds no research ticket.

**PR row.** `owner/name#N` as the link to the PR, the PR title, and the existing PR chip as it is: state or draft mark, checks, review, conflict and watched labels. No diff size.

**Linear row.** The key as the link to the issue, then the title of the oldest linked thread with the key removed (`ENG-10 add filter` → `add filter`). No Linear title and no Linear state mark in this spec. To add the real title or state later, add `title` and `state { name type }` to the ticket 005 batch.

**Thread entries under an item.** The Flat-view thread row: status icon, title, status text and elapsed time. Add the project name, because an item can span projects. Add a "review" tag for review threads (ticket 002). Do not repeat the thread's other PRs and keys.

**Missing data.**

- PR title null (no sync yet): `owner/name#N` alone, no placeholder.
- PR `repository` empty: the PR URL path is the identity (ticket 002).
- PR state unknown: T3 defaults it to `open`, so no mark shows.
- Linear row whose thread titles hold only the key: the key alone.
- Provider link unavailable: cannot occur. A PR always has a URL. A Linear row exists only with a workspace set, so its link always builds.

**Example rows** (teams = `ENG`, workspace set):

| Row | Item fields | Threads under it |
| --- | --- | --- |
| `acme/frontend#12` · Add job filter · Draft, checks passing, review required, label `needs-qa` | identity link, title, chip | ● `ENG-10 add filter` · frontend · Working 4m; ● `Review #12 ENG-10` · frontend · review · Waiting 1h |
| `acme/backend#7` (no title yet), no marks | identity link only | ● `ENG-11 api` · backend · Your turn 20m |
| `ENG-10` add filter | key link, oldest thread title without the key | ● `ENG-10 add filter` · frontend · Working 4m; ● `ENG-10 part 2` · frontend · Snoozed |
| `ENG-30` (thread titled only `ENG-30`) | key link only | ● `ENG-30` · backend · Done 2h |

The glossary entry **Linked item** in `CONTEXT.md` now holds one merged definition.
