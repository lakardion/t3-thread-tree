---
id: "002"
title: Which threads belong under each PR or Linear issue?
type: grilling
status: closed
assignee: damian.lucero
blocked_by: []
---

## Question

What counts as evidence that an active thread belongs under a PR or Linear issue, and what identifies the same item across projects?

T3 supplies PR links and stack information. The app recognizes an issue key in a thread title and builds its Linear link from workspace and team settings. Decide how to handle a stack member versus a PR opened by the thread, a review thread, a subthread without its own issue key, a title with multiple keys, and an issue key that cannot be linked with the current settings. [T3 thread decoder](../../../src/server/t3.ts), [issue key extraction](../../../src/server/build-tree.ts), [Linear link builder](../../../src/page/format.ts).

Close with worked examples that show when duplicate PR or issue references produce one row, which threads appear beneath it, and how equal PR numbers in different repositories stay distinct.

## Resolution

The user agreed to all nine recommendations in one round. The term is **Linked item**, now in `CONTEXT.md`.

Evidence:

- **PR links.** Only the T3 link sources `created` and `agent` put a thread under a PR. A `stack` link does not, so a thread does not show under every PR in its stack. `stack-dismissed` never counts. Ticket 004 can show stack order between PR rows.
- **Issue keys.** Only thread titles supply keys. Every distinct key in a title counts, not only the first. PR titles and branch names do not supply keys.
- **Lineage.** A Linked item lists top-level threads only. The keys and PR links of a subthread count for its top-level ancestor. A subthread never shows as its own entry.
- **Review threads.** The same rules apply. The row marks the thread as a review, not as the work thread. The `#N` in a `Review #N` title is not evidence, because it does not name the repo.
- **Linear settings.** With no workspace set, the overview shows no Linear rows and one line that tells the user to set the workspace. With teams set, a key of an unlisted team is not an issue and gets no row. This also drops false keys such as `ISO-8601`. With no teams set, every key counts.

Identity:

- **PR:** `host` + `repository` + `number`, shown as `owner/name#123`. Use `url` when `repository` is empty.
- **Issue:** the key alone, across all T3 projects, because the app has one Linear workspace.

Worked examples (teams = `ENG`, workspace set):

| Threads | Rows and the threads under them |
| --- | --- |
| A `ENG-10 add filter` created `acme/frontend#12`. B `Review #12 ENG-10` linked `acme/frontend#12` by `agent`. | One row `acme/frontend#12`: A, B (review). One row `ENG-10`: A, B (review). |
| C `ENG-11 api` created `acme/backend#12`. | A separate row `acme/backend#12`: C. Equal numbers in different repos stay distinct. |
| D `ENG-10 part 2` created `acme/frontend#13`, stacked on `#12` (`stack` link). | Row `acme/frontend#13`: D. D is not under `#12`. Row `ENG-10`: A, B (review), D. |
| E `ENG-20 migrate` has a subagent F with no key. F created `acme/api#5`. | Row `acme/api#5`: E. Row `ENG-20`: E. F shows under neither. |
| G `ENG-1 / ENG-2 split`. | Rows `ENG-1`: G and `ENG-2`: G. |
| H in project frontend and I in project backend, both titled with `ENG-30`. | One row `ENG-30`: H, I. |
| J `Bump ISO-8601 parser`, no PR. | No row. `ISO` is not a listed team. |
| Same threads, no workspace set. | PR rows only, and one line that tells the user to set the workspace. |
