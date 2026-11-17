# Improvement review B

Show the required action and its wait time first. Then help the engineer select a small set of threads to continue.

## Evidence and limits

I reviewed release 0.1.7 at commit `5bf8567b8b8de38632e9a15d98dd9212f4f38222` on 2026-11-16. I read the ticket, user notes, required source directories, specifications, and closed maps. I did not read the other improvement review.

I started the demo with `PORT=4776 bun run demo`. I used the T3 browser tools at desktop and phone widths. The desktop widths were 1400 and 1402 CSS pixels. The phone width was 390 CSS pixels. I checked both light and dark themes.

I operated these controls:

- All and Needs you, Tree and Flat, both sort choices, and both Group by choices.
- Project folds, group folds, the PR stack fold, Collapse all, Expand all, and controls inside a project.
- Details and the extra PR button.
- Pointer drag for a project and a thread. Keyboard drag for an issue-key group used Enter and Arrow Down. The browser tool's Space command did not lift the row.
- View, all theme choices, show settled, Reset, the status legend, and Linear settings.
- The token form with a dummy value. The demo returned 404 because it has no token route.
- Both brief models, run, cancel, hide, retry, copy, send, and start.
- The send target picker and the start project picker. I edited messages and a title. I confirmed sends and a start against the demo stubs only.
- A row send to a working thread, including its next-turn notice and Cmd+Enter.

I also ran the demo with `PUSH=1`, with `SEND=failed BRIEF=failed`, and with `CLIS=0 T3CLI=0`. A failed send kept the draft. Missing CLIs disabled the controls. The demo start returned success but added no row, as its stub specifies. See [the demo stubs](/Users/lakardion/repos/t3-thread-tree/scripts/demo.ts:270).

I did not open port 4773. I stopped every demo process and closed the browser tab. Port 4776 had no listener at the end. I changed no app code and made no commit.

These checks used CSS viewport sizes. They do not prove touch behavior or macOS integration. The demo supplied the model answers. I did not assess real model output quality.

The observations below come from the browser or cited code. The expected benefits, impact, and effort are estimates. S means a small local change. M means changes across several components. L means a wider change to the app or its data.

## UX

### UX1. Make filter counts and status groups clear

The static demo showed "Needs you 5". Its filter kept eight matching threads and one spawner for context. The count excludes Your turn, but the filter includes it. See [the filter and count rules](/Users/lakardion/repos/t3-thread-tree/src/page/attention.ts:6).

In Flat with Group by Status, "Migrate Dialog" stayed under its idle spawner in "Idle and snoozed". Its status was Your turn. The Your turn count showed two and missed this thread. The grouping function examines the parent only. See [the group rules](/Users/lakardion/repos/t3-thread-tree/src/page/view.ts:81) and [the screen](/Users/lakardion/repos/t3-thread-tree/.wayfinder/improvements/research/02-sol/groups-desktop-dark.png).

A PR stack correctly stays together. Its section can therefore contain threads with other statuses. The section count counts blocks, not all displayed threads. See [the section count](/Users/lakardion/repos/t3-thread-tree/src/page/view.ts:112).

These differences make the engineer check the list again to understand the remaining work.

Show "5 waiting, 3 results" beside the filter. Keep the chosen desktop badge definition for waiting threads. Place a spawner block by its most urgent nested thread. Label context rows and count matching threads separately from context. Keep a PR stack together.

Impact: high. Effort: M. The cost is one shared set of count rules for filters, groups, and labels.

### UX2. Reduce the brief to a small set of clear actions

The demo brief showed ten actions above the tree. Four actions had the title "Answer the agent". Each repeated the same reason. The linked thread title supplied the useful context, but the page cut that title. See [the brief](/Users/lakardion/repos/t3-thread-tree/.wayfinder/improvements/research/02-sol/brief-desktop-light.png).

Code makes one action for each matching thread. It has no limit on these code actions. It orders them by kind, then tree order. See [the action builder](/Users/lakardion/repos/t3-thread-tree/src/server/brief.ts:64).

The engineer must choose from another long list before returning to the tree.

Initially show three actions and a "Show all actions" control. Put the full thread title in each action heading. Use specific verbs such as "Answer the question" or "Review the plan". Show the request kind and wait time. Within the same action kind, prefer the oldest known wait. Keep code actions available while the model runs.

Impact: high. Effort: M. Keep the full list one click away so the shorter view does not hide work permanently.

### UX3. Mark brief actions when their facts change

With `PUSH=1`, "Resume the flaky cart badge test" stayed in the brief after the thread started working. Its live icon changed to Working. Its text still said the thread had failed. The send control remained available.

The page updates the link status but keeps the action text. The send dialog checks that the thread exists. It does not check the facts that caused the action. See [the brief link](/Users/lakardion/repos/t3-thread-tree/src/page/brief.tsx:115) and [the send form](/Users/lakardion/repos/t3-thread-tree/src/page/send-dialog.tsx:140).

The engineer can act on a problem that another thread already fixed.

Keep the source status and relevant PR facts with each action. Show "Changed since brief" when those facts change. Offer an explicit refresh. Before a send, show the changed facts and let the user inspect the message again. Keep the refresh under user control.

Impact: high. Effort: M. This needs stored comparison facts and clear rules for each action kind.

## UI

### UI1. Show the status phrase and wait time on the row

The row shows a 12 px status icon. The status phrase and elapsed time appear in a hover tooltip. The right-side age comes from `updatedAt`, not the request time. See [the icon](/Users/lakardion/repos/t3-thread-tree/src/page/status-icon.tsx:85), [the row age](/Users/lakardion/repos/t3-thread-tree/src/page/app.tsx:1069), and [the dark screen](/Users/lakardion/repos/t3-thread-tree/.wayfinder/improvements/research/02-sol/desktop-dark.png).

The engineer must remember icon meanings and hover each candidate to compare waits. The visible age can suggest the wrong wait.

Show "Approval 12m", "Question 12m", or "Plan ready 30m" beside the icon on threads that need the user. On a phone, put this phrase above the title. Give the update age an explicit label in details.

Use the pending request time for input waits. Use the completion time for plans and Your turn. The status builder currently leaves `since` empty for plans and Your turn. See [the status builder](/Users/lakardion/repos/t3-thread-tree/src/server/build-tree.ts:28). Show an unknown age when the source has no suitable time.

Impact: high. Effort: M. A visible phrase alone is S. Reliable wait times need changes to the shared data.

### UI2. Give the phone brief its own layout

At 390 px, the rank, kind chip, and three action icons leave a narrow text column. The "Sent to" title wraps across several short lines. The linked title still cuts off. See [the phone brief](/Users/lakardion/repos/t3-thread-tree/.wayfinder/improvements/research/02-sol/brief-phone-light.png) and [the row layout](/Users/lakardion/repos/t3-thread-tree/src/page/brief.tsx:254).

The engineer cannot read the target and action together without extra effort.

Put the rank and kind on a short first line. Use the full width for the action and thread title. Put send, start, and copy below the text with visible labels. Let thread titles wrap. Keep the existing full titles in tree rows.

Impact: medium. Effort: M. The cost is a separate narrow-screen layout for brief rows.

## New features

### F1. Add a local Now and Next list

Manual order can move rows inside a list. It cannot collect selected threads across projects in one small working set. The page stores separate orders for each list. See [the order model](/Users/lakardion/repos/t3-thread-tree/src/page/order.ts:14).

The engineer must repeatedly find the few threads they chose to continue.

Add one Now slot and up to two Next slots above the tree. Let the engineer add a thread from its row or a brief action. Show its live status, full title, and Open control. Keep the choices after a reload. Offer Remove and a link back to the full tree.

Keep this list local to the tree app. It must not change T3 pins, snooze, or settled state. Keep a separate waiting count so focus does not hide new requests. Leave the chosen tree order intact.

Impact: high. Effort: M. The cost is another small stored list and rules for threads that leave the active view.

### F2. Add quick find with a keyboard path

The header has no search control. Folded projects hide titles. The current keyboard handler closes View with Escape. See [the header](/Users/lakardion/repos/t3-thread-tree/src/page/app.tsx:1750), [the keyboard handler](/Users/lakardion/repos/t3-thread-tree/src/page/app.tsx:632), and [the folded screen](/Users/lakardion/repos/t3-thread-tree/.wayfinder/improvements/research/02-sol/folds-light.png).

The engineer must expand and scan the tree to return to a known thread.

Add a Find control and Cmd/Ctrl+K. Match the title, issue key, project, and branch from the existing tree data. Show full titles and statuses in the results. Let Enter open the selected thread in T3. Offer "Show in tree" to reveal its folded location.

Impact: medium. Effort: M. The cost is a result list with keyboard selection and clear handling of hidden threads.

## Earlier decisions

These proposals keep manual order, PR stacks, and spawn lineage. The focus list adds a separate selection surface. It does not reorder the tree. See [the frozen-row decisions](/Users/lakardion/repos/t3-thread-tree/.wayfinder/frozen-rows/map.md).

The brief refresh stays explicit. No proposal needs background model calls, a stored digest, or model tools. See [the brief decisions](/Users/lakardion/repos/t3-thread-tree/.wayfinder/whats-next/map.md) and [the speed decisions](/Users/lakardion/repos/t3-thread-tree/.wayfinder/brief-speed/map.md).

I do not propose last-message text or subagent signals. The design spec rejected both. The proposed context uses existing titles, request kinds, and times. See [the design choices](/Users/lakardion/repos/t3-thread-tree/DESIGN-SPEC.md:23).

The send confirmation remains. No proposal adds settle, snooze, approve, interrupt, or remote-environment controls. See [the send decisions](/Users/lakardion/repos/t3-thread-tree/.wayfinder/send-message/map.md).

## Top 5

1. UI1: Show status phrases and wait times. The engineer can compare candidates without hover or icon recall.
2. F1: Add Now and Next. The engineer can keep a small working set across projects.
3. UX2: Show three clear brief actions first. The brief should reduce the choice load before it adds detail.
4. UX1: Correct counts and status grouping. The list must show nested results where the engineer expects them.
5. UX3: Mark changed brief actions. The engineer should see that the facts changed before sending another instruction.
