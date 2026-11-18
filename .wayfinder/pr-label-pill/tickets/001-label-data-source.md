---
id: "001"
title: Where do PR labels come from, and how fresh are they?
type: research
status: closed
assignee: claude
blocked_by: []
---

## Question

Which source gives the app the labels of each PR linked to an **Active thread**, and how fast does a label change on GitHub reach the row?

Compare three options:

1. **T3 RPC** on the open socket: `pullRequests.detail` or `pullRequests.list`. Can a token with scope `orchestration:read` call them? What input does each call need (repo, number, environment)? What is the cost per call?
2. **`gh` CLI** from the server: one call per PR or one batched call. Auth, rate limits, and behavior when `gh` is missing.
3. **Labels in the streamed snapshot**: a patch to the user's T3 fork that adds `labels` to `ThreadPullRequestSnapshot`. Note: this does not help a user of the released Mac app on standard T3 Code.

Also answer:

- Does a label change on GitHub change any field on the shell stream (snapshot `updatedAt`, `syncedAt`, or a `thread.updated` item)? If yes, the app can refetch labels on that event. If no, name the refresh the option needs.
- What happens for a GitLab PR?

Findings: branch `research/pr-label-source` (commit `3c4c65a`), file `.wayfinder/pr-label-pill/research/001-label-data-source.md`.

Method: read `~/repos/t3code` and do a read-only live probe against the running T3. Keep the token out of all output. Close with a recommended option, its refresh rule and its failure mode.

## Resolution

Use the T3 RPC `pullRequests.detail` with `allowStale: false` on the socket that the app already has open.

- The `orchestration:read` token can call it, and it works on standard T3 Code. In a live probe, each call took about 2 s and returned the labels.
- `pullRequests.list` is not usable. It took 31 s, failed on 2 of 3 repos, and found 1 of 47 linked PRs.
- `gh` adds a dependency that T3 does not need. A patch to the T3 fork does not help users of standard T3 Code.

**Refresh rule:** a label change on GitHub moves the PR `updatedAt` (confirmed on 3 PRs). T3 sync then sends `thread.updated` with a new `snapshot.updatedAt`. The app calls `detail` once per PR at start, then only for a PR whose `updatedAt` changes. If T3's 60 s cache returns an older `updatedAt`, the app tries once more after 60 s. No polling.

**Latency and failure mode** (from T3 sync code, not timed live):
- Up to about 2 min for a PR that changed in the last 30 min, up to about 6 min for a quieter PR.
- If T3 or GitHub fails, the app keeps the last labels.
- T3 stops syncing settled threads, so their pills can go stale.
- GitLab: `detail` returns labels. Not verified whether a GitLab label change moves `updated_at`.

**Build facts:** the app decode drops each PR link's `host` and `repository`, and `detail` needs them, so the decode must keep them. The Mac app token is at `~/Library/Application Support/T3 Thread Tree/token`, not `~/.config/t3-thread-tree/token`.
