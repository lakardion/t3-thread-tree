---
id: "002"
title: How does a Label pill read in the row?
type: prototype
status: closed
assignee: claude
blocked_by: []
---

## Question

How does a **Label pill** look and behave in Tree and Flat rows?

Decide with a rough prototype in the row (`bun run demo`, light and dark, desktop and phone width):

- **Which PRs count.** The row shows only its first two PRs. Does a watched label on a third PR, or on a merged or closed PR, show a pill?
- **Where.** Next to the PR chip that has the label, or once per row.
- **Several matches.** Two watched labels, or one label on two PRs: one pill per label, or a count.
- **Color.** The GitHub label color, or one app color. Color is never the only sign, so the pill shows the label text.
- **Phone width.** Shorten, hide, or wrap the pill.
- **Tooltip.** What hovering the pill says.

Link the prototype as an asset. Close with one example row per case above.

## Resolution

The user chose variant **C, one summary pill at the row end**, with the **fill** color and the **short** name form, after a look at three placements, three color treatments and two name forms. Prototype: branch `prototype/label-pill-look` (commit `77f07a8`, `src/page/label-pill.prototype.tsx`). Run `PORT=4821 bun run demo` in that branch and open `?variant=C&color=fill&name=short`.

- **Which PRs count.** The open PRs of the row: the PRs that the row lists, also past the first two. Stack PRs do not count. With stack PRs, every row of a stack showed the same pill, so the pill did not tell the rows apart. A merged or closed PR does not count.
- **Where.** One pill per row, in the right group, before the PR chips.
- **Several matches.** The pill shows the first matching name in Watched-label list order, then "+N" for the other matching names. One label on two PRs counts as one name.
- **Name.** The lucide `Tag` icon, then the initials of the first three words of the label, in upper case, mono font. Words split on any character that is not a letter or digit: `ready-for-review` → "RFR", `needs-qa-on-staging-before-merge` → "NQO", `do-not-merge` → "DNM". The full name is in the tooltip. Two watched labels can give the same initials; the tooltip tells them apart.
- **Color.** The GitHub label color fills the pill, as on GitHub. The text and icon are black or white, picked by the luminance of the color (`0.299 r + 0.587 g + 0.114 b > 150` gives black). The initials always show, so color is never the only sign.
- **Phone (720 px and less).** No change. The pill is at most three letters and "+N".
- **Tooltip.** Each match as "name: #PR", joined with " · ". Example: "ready-for-review: #3004".
- **Before the first `detail` answer.** No pill and no placeholder. The pill appears when the labels arrive.

Example rows (demo data, Watched labels `ready-for-review`, `needs-qa-on-staging-before-merge`, `do-not-merge`):

- One match: SHOP-413, #2102 has `ready-for-review` and `size:L` → pill "RFR".
- Two labels on one PR: SHOP-418, #2107 → pill "RFR +1", tooltip "ready-for-review: #2107 · needs-qa-on-staging-before-merge: #2107".
- Third PR, merged and closed: DOC-15, #3002 merged and #3003 closed do not count, #3004 (fourth, hidden behind "+2") counts → pill "RFR".
- Only a stack PR has the label: SHOP-412 → no pill.
- Merged Review row: Review #2095 → no pill. Open Review row: Review #2088 → pill "RFR".
- Very dark label: SHOP-415, #2104 `do-not-merge` (`1d1d1f`) → pill "DNM", white text.
