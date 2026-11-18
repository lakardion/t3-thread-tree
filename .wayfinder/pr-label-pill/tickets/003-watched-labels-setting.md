---
id: "003"
title: How does the Watched labels section in Settings work?
type: grilling
status: closed
assignee: claude
blocked_by: ["001"]
---

## Question

How does the user set the **Watched label** list, and how does a label name match?

- **Input shape.** A comma list in one field (like Linear team keys), or one row per label with add and remove.
- **Match.** Exact or case-insensitive.
- **Scope.** One global list, or per repository.
- **Storage.** Page storage (like `LINEAR_KEY` in `src/page/app.tsx`) or the server. The data source from 001 decides if the server needs the list, for example to fetch labels only when the list is not empty.
- **Fold state.** Where the section sits in Settings › Setup, and what its state text says when the list is empty.

Close with the field text, the match rule and the storage.

## Resolution

One global list, set in one comma field. The page keeps it. The server gets labels only when the list is not empty.

- **Input:** one text field with a comma list and a Save button, like "Team keys" in the Linear form.
- **Match:** exact name, case-insensitive. Trim spaces at the two ends of each name. No substring match.
- **Scope:** one list for all repos.
- **Storage:** page storage, key `thread-tree:labels`. No server env value. The page sends the list on `/events` as `labels=ready-for-review,…`. A change to the list reopens the stream, like a `settled` change.
- **Server:** it calls `pullRequests.detail` only when the list is not empty. It keeps all labels of each PR on the server, not per stream, and filters them by the list of each stream. Thus a new name or a new tab costs no new calls. It sends only the labels that match.
- **Fold:** in Settings › Setup, after "Linear links", before "Status icons".
  - Fold label: "Watched labels".
  - State text: the names joined by ", ". When empty: "None", neutral tone (not warn).
  - Field label: "Label names". Placeholder: `ready-for-review`.
  - Hint: "Separate names with commas. A row shows a pill when one of its PRs has one of these labels. Empty: no pills."
  - Save button and "Saved." text, like the Linear form.

**Not now:** a "Refresh labels" button that calls `detail` with `allowStale: false` for every PR. It skips the T3 sync delay (2 to 6 min), but each click makes one GitHub call per PR. Moved to the map's Not yet specified.
