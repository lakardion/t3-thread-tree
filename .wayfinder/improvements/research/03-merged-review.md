# Merged improvement review

Question: what is the full, deduplicated list of findings from both reviews?

## How to read this list

- The sources are `01-opus-review.md` (Opus) and `02-sol-review.md` (Sol). This list keeps every finding of both. It drops nothing and it ranks nothing.
- Each item has a new id, `M01` to `M23`. The two reviews use the same ids for different findings (Opus F1 is "Open next", Sol F1 is "Now and Next"). Thus each back-reference names its review.
- One item is one problem. Where the reviews propose different changes for one problem, the item lists the options.
- Some source findings hold two or three changes. This list splits them. A split item keeps the rating of its source finding, and says "combined" when the rating was for the full finding.
- **Source** is Opus, Sol or both. "Both" means that the two reviews found the same problem independently.
- Effort: S is a small local change. M is a change across several components. L is a wider change to the app or its data.
- All file:line references are at `5bf8567`. The section "Facts checked against the code" gives the result where the reviews disagree.
- The terms come from `CONTEXT.md`: thread, subthread, PR stack, Needs you, Next-step brief, Action, Send.

## Bugs

### M01. "Group by status" puts a thread with subthreads in the wrong section

- **Source** both (Opus U3, first part; Sol UX1, second part).
- **Saw.** In the Flat view with "Group by: Status", a unit goes to a section by its top-level threads only. `sections` (`src/page/view.ts:105`) reads `unitThreads` (`view.ts:81`), which skips subthreads. In the demo, "Migrate Dialog to the new tokens" is `your-turn` and "Migrate Button…" is `working`. Both show under "Idle and snoozed", because their parent is idle. The "Your turn 2" count leaves "Migrate Dialog" out. Screens: `01-opus/flat-group-status-bottom.png`, `02-sol/groups-desktop-dark.png`.
- **Scope.** Only the Flat view with "Group by: Status". The tree and the "Needs you" filter place these threads correctly (Opus).
- **Why.** This view is the nearest thing to a queue. A thread that needs the user and shows under "Idle" is a thread the user does not see.
- **Change.** Put a unit in the section of its most urgent thread, subthreads included. The two reviews propose the same change.
- **Code note.** The code does what its comment says ("A thread goes by its own status", `view.ts:101`). `SPEC.md:103` gives the most-urgent rule only for a stack. The change extends that rule to subthreads. Subthreads stay under their parent, as `SPEC.md:103` requires.
- **Impact** high (both). **Effort** Opus S (combined U3). Sol M (combined UX1).
- **Top 5.** Opus rank 4 (U3). Sol rank 4 (UX1).

### M02. A filtered PR stack shows wrong stop numbers

- **Source** Opus (I3).
- **Saw.** With "Needs you", the storefront stack shows one stop, "1 · #2102". #2102 is position 2 of 4 (`01-opus/tree-needs-you-last-updated-light.png`). The rail uses the index of the rendered group (`src/page/app.tsx:1302`, `app.tsx:1352`), not `stack.pos`.
- **Why.** "1" tells the user that this PR is the base and can merge first. It cannot.
- **Change.** Use `stack.pos` for the stop and the node number. When groups are hidden, show "2 of 4".
- **Impact** medium. **Effort** S.

### M03. The "Group by: Status" tooltip stays open after its menu closes

- **Source** Opus (Minor, "Phone header", last sentence).
- **Saw.** The tooltip of "Group by: Status" stays open after its menu closes. Opus saw this in the phone-width check.
- **Change.** Close the tooltip when the menu closes. Opus gave no explicit change.
- **Impact** low. **Effort** S.

## UX

### M04. The row does not show what a waiting thread wants, or for how long

- **Source** both (Opus U1 and I1; Sol UI1).
- **Saw.**
  - The row starts with one 12 px status icon and no text (`src/page/status-icon.tsx:85` and `:99`, used at `app.tsx:1001`). The phrase and the time in status show only in the icon tooltip and in details.
  - The time at the row end is the age of `updatedAt` (`app.tsx:1075`). In the demo, API-94 shows "2h", but its approval waits for 12 min.
  - `since` is empty for `plan-ready` and `your-turn` (`src/server/build-tree.ts:28`).
  - There are 17 icon variants. The legend is in a closed fold of the View panel (`01-opus/view-panel-dark.png`). Shield, question bubble and chat bubble look alike at 12 px (Opus). Screen: `02-sol/desktop-dark.png`.
- **Why.** The user picks the next thread. The best signal is "who waits for me, and since when". Now the user must learn the icons and hover each one. The visible age can suggest the wrong wait.
- **Change (both).** On rows that need the user, show the phrase and the wait as text: "Approval 12m", "Question 12m", "Plan ready 30m". Use the request time for input waits. Use `latestRunCompletedAt` for `plan-ready` and `your-turn`.
- **Options and additions.**
  - Rows that get the text: Opus names `needs-input`, `plan-ready`, `your-turn` and `failed`. Sol names "threads that need the user". Calm rows keep the icon only (Opus).
  - Position: Opus puts the phrase after the title, in the right group, so the title start does not move. Sol puts it beside the icon, and above the title on a phone.
  - Row-end time: Opus replaces the age with the wait on these rows, with the tooltip "Waiting since 22:58". Sol keeps the update age and gives it an explicit label in details.
  - No time: Sol shows an unknown age when the source has no suitable time. The code has one such case: a guest message gives `needs-input` with no `since` (`build-tree.ts:32`).
- **Earlier decision.** Commit `d602e6e` (#18) removed the 120 px phrase column for all rows, so the key and title start close to the icon. This item reverses that for the few rows that need the user. Reason (Opus): the old reason holds for calm rows, which are most rows; a short phrase on the few rows that need the user puts the most useful words on the row. Sol did not flag this decision.
- **Impact** high (both). **Effort** Opus S. Sol M: the visible phrase alone is S, reliable wait times need changes to the shared data. See the fact check: the code supports S for the data part.
- **Top 5.** Opus rank 1 (U1 with I1). Sol rank 1 (UI1).

### M05. The waiting sections of the flat view do not sort by wait

- **Source** Opus (U1, last part).
- **Saw.** "Last updated" sort uses `lastRun`, not the wait. In the flat "Needs input" section, rows keep the manual order. Only the menu-bar menu lists the longest wait first (`src/desktop/runtime.ts:49`).
- **Change.** In the Flat view with "Group by: Status", sort the Needs input, Plan ready and Your turn sections by wait, oldest first.
- **Depends on** M04 for the `since` of `plan-ready` and `your-turn`.
- **Related.** Sol UX2 asks for the same order in the brief (M11).
- **Earlier decision.** `SPEC.md:103` says that "Manual" keeps the tree order in the flat list, and that a row drags inside its section. A sort by wait overrides the manual order in these three sections. Opus did not flag this decision and gave no reason for the reversal.
- **Impact** high, **Effort** S (Opus, combined U1).
- **Top 5.** Opus rank 1 (U1 with I1).

### M06. The "Needs you" count and the filter do not agree

- **Source** both (Opus U6; Sol UX1, first part).
- **Saw.** The chip shows 5. The filter keeps 8 matching threads, because it also keeps `your-turn` (`src/page/attention.ts:6`; `CONTEXT.md` › Needs you defines this). The filtered list also shows one spawner as context (Sol).
- **Why.** The user reads "5" and finds more rows. The difference costs trust in the count, and the user checks the list again.
- **Change (both).** Keep the definition and the desktop badge. Show the your-turn count next to the waiting count.
- **Options.**
  - Opus: a second, muted number in the chip ("5 · 3"), with the tooltip "5 wait for you, 3 finished and not opened".
  - Sol: the words "5 waiting, 3 results" beside the filter. Sol also asks for one shared set of count rules for filters, groups and labels.
- **Impact** Opus medium. Sol high (combined UX1). **Effort** Opus S. Sol M (combined UX1).
- **Top 5.** Sol rank 4 (UX1).

### M07. A status section holds rows of other statuses, and its count does not say so

- **Source** both (Opus U3, second part; Sol UX1, third part).
- **Saw.** A PR stack with one waiting thread goes to "Needs input" with its three calm threads (working, done, interrupted). The section count counts units, not threads (`view.ts:115`; Sol cites `view.ts:112`). "Needs input 4" holds 7 thread rows, and 4 of them need input (`01-opus/flat-group-status-light.png`).
- **Why.** Calm rows in "Needs input" add noise at the top. The count does not match what the user sees.
- **Change (both).** Count the threads that match the section. Keep a PR stack together.
- **Options for the rows that do not match.**
  - Opus: show them in muted color, or fold them to the rail header.
  - Sol: label them as context rows, and count them separately from the matching threads.
- **Earlier decision.** `SPEC.md:103` says "A stack run is one block" and "A stack goes to the section of its most urgent thread". Both reviews keep this. The item changes only the look of the rows and the count.
- **Impact** high (both, combined). **Effort** Opus S (combined U3). Sol M (combined UX1).
- **Top 5.** Opus rank 4 (U3). Sol rank 4 (UX1).

### M08. To know what an agent asks, the user must open T3

- **Source** Opus (U2, first and second bullet). Sol declined this change.
- **Saw.** A `needs-input` row shows an icon. Details show only "Request: command · 12m" (`app.tsx:904`). The send dialog shows the target title and an empty box, with no context (`01-opus/row-send-dialog-light.png`).
- **Why.** Each answer starts with a full context switch into T3, also when the answer is "yes" or one line. With many threads, this switch is the main cost.
- **Change.** Show the tail of the last assistant message on demand:
  - in the details block, as a "Last message" line, loaded when the block opens;
  - in the send dialog, above the message box. When the target waits on an approval, also say that a message does not approve the request.
- **Data.** The server already reads this text for the brief (`lastMessages`, `src/server/lineage.ts:78`). The request row in SQLite holds no question or command text. The command text needs a read of `turn_items`, so start with the last message (Opus).
- **Earlier decision.** `DESIGN-SPEC.md:24` rejects "the last message of a thread, in any place". This item reverses it. Reason (Opus): the old reason was a dense row; this change adds nothing to the row, and the text shows only after a click on details or send. Sol took the opposite position: it does not propose last-message text, because the design spec rejected it, and its context uses only titles, request kinds and times.
- **Impact** high. **Effort** M.
- **Top 5.** Opus rank 3.

### M09. Calm threads take the same space as urgent ones

- **Source** Opus (U4).
- **Saw.** In one snapshot of the real app, 9 of 14 rendered rows were snoozed. In the tree, snoozed rows show among the others. In the flat view, the "Working", "Idle and snoozed" and "Done" sections always show and do not fold.
- **Why.** The user opens the app to reduce noise. Rows that need no action push the urgent rows down, mostly on a phone.
- **Change.** Two parts:
  - Make the flat section headers fold, with the state saved like the tree folds. Close "Idle and snoozed" and "Done" at first.
  - In the tree, add a "Show snoozed threads" switch next to "Show settled threads", on by default. A snoozed thread with a request is `needs-input`, so it still shows.
- **Earlier decision.** Tree rule 3 (`SPEC.md:72`) says snoozed threads stay visible. The flat view shipped with no folds in #57 (`SPEC.md:103`, `DESIGN-SPEC.md:443`). This item reverses the second and makes the first a choice. Reason (Opus): the default keeps every thread in view and the user can choose less; a folded section still shows its count, so no thread is lost.
- **Impact** high. **Effort** S.
- **Top 5.** Opus rank 5.

### M10. A brief Action does not change after its facts change

- **Source** both (Opus U5; Sol UX3).
- **Saw.** The brief keeps its Actions until the next run. The thread link icon updates live, but the Action text stays (`src/page/brief.tsx:115`). With `PUSH=1`, "Resume the flaky cart badge test" stayed after the thread started to work; the text still said that the thread had failed, and send stayed available (Sol). The send dialog checks that the thread exists, not the facts that caused the Action (`src/page/send-dialog.tsx:140`). "Clean up: Settle the finished docs threads" asks for a write that the app cannot do (Opus).
- **Why.** The user works through the brief as a list. If done Actions stay, the user must check each one again. The user can act on a problem that is already fixed.
- **Change (both).** Mark an Action when its linked threads no longer meet its rule. Offer an explicit run again. Run no model for this.
- **Options.**
  - Opus: compute the mark from the live tree. `answer` is done when no thread is `needs-input` or `plan-ready`, `fix` when the PR has no failing checks, conflict or requested changes, `merge` when the PR is merged. Show a check icon and a muted row, and move the row to the end. Show "N threads changed since HH:MM" in the head, with "Run again".
  - Coverage: the rules of Opus cover the code-made kinds `answer`, `fix` and `merge`. The example of Sol is an `unblock` Action that the model made (`scripts/demo.ts:216`), and Opus gives no rule for the model kinds (`review`, `clean-up`, `unblock`). This explains a part of the S against M difference.
  - Sol: store the source status and the relevant PR facts with each Action. Show "Changed since brief" when they change. Before a send, show the changed facts and let the user inspect the message again.
- **Earlier decision.** Both keep the refresh explicit. No option needs background model calls, a stored digest or model tools (see the closed maps `whats-next` and `brief-speed`).
- **Impact** Opus medium. Sol high. **Effort** Opus S. Sol M (stored comparison facts and rules for each Action kind).
- **Top 5.** Sol rank 5.

### M11. The code-made answer Actions all read the same

- **Source** both (Opus U2, "Saw" and third bullet; Sol UX2, in part).
- **Saw.** Code makes one Action for each matching thread (`src/server/brief.ts:64`). Each `needs-input` thread gets the same title and reason: "Answer the agent. The agent waits for your input." (`brief.ts:72`). The demo has four such rows. Only the linked thread title gives context, and the page cuts it (M14).
- **Why.** The user cannot tell the Actions apart, so the brief does not help to choose.
- **Options.**
  - Sol: use specific verbs such as "Answer the question" or "Review the plan". Show the request kind and the wait time. Inside one Action kind, put the oldest known wait first; now the order is kind, then tree order.
  - Opus: put the first sentence of the last assistant message in the reason of a code-made `answer` Action. This option depends on the decision of M08.
- **Impact** high (both, combined). **Effort** M (both, combined).
- **Top 5.** Opus rank 3 (U2). Sol rank 3 (UX2).

### M12. The brief is a second long list above the tree

- **Source** both (Opus I4, second part; Sol UX2, in part).
- **Saw.** The demo brief shows ten Actions. They take about 540 px, so the tree starts below the fold (Opus). Code Actions have no limit (`brief.ts:64`). The panel can hide, but it cannot fold. Screen: `02-sol/brief-desktop-light.png`.
- **Why.** The user must choose from another long list before the tree.
- **Options.**
  - Sol: show three Actions at first, with a "Show all actions" control. Keep the full list one click away. Keep the code Actions available while the model runs.
  - Opus: let the panel fold to its head with "10 Actions · 3 done", and save that state. The "done" count needs M10.
- **Impact** Opus medium (combined I4). Sol high (combined UX2). **Effort** Opus S. Sol M.
- **Top 5.** Sol rank 3 (UX2).

## UI

### M13. Working rows are as loud as rows that need you

- **Source** Opus (I2).
- **Saw.** A `working` row has a blue left edge and a blue wash (`src/page/index.css:220–258`), and its icon turns. A `needs-input` row has the amber edge and wash. In the demo, 5 working rows and 4 needs-input rows carry a wash. Code note: `index.css` has edge and wash rules only for `needs-input`, `working` and a closed row that hides a waiting thread. `plan-ready` and `your-turn` rows carry none.
- **Why.** A colored edge and wash mean "look here". A working thread needs nothing from the user.
- **Change.** Remove the edge and the wash from `working`. Keep the turning icon.
- **Earlier decision.** `DESIGN-SPEC.md` › Gradients specifies the working wash, and Choices says that motion means "alive" or "waiting for you". This item reverses the wash. Reason (Opus): for an overwhelmed user, "alive" is not a call to act, and the turning icon already says "alive".
- **Impact** medium. **Effort** S.

### M14. The brief cuts thread titles

- **Source** both (Opus I4, first part; Sol UX2 and UI2, in part).
- **Saw.** Thread links in the brief truncate at 260 px (`brief.tsx:126`): "API-94 · Approve the schema change, th…". At 390 px they read "DOC-12 · Gettin…" (`01-opus/phone-dark-brief.png`, `02-sol/brief-phone-light.png`).
- **Why.** The link is the thing the user clicks, and the title is the only useful context of a code Action. A cut title forces a hover or a guess.
- **Options.**
  - Opus and Sol UI2: let thread links wrap, as tree titles do.
  - Sol UX2: put the full thread title in the Action heading.
- **Impact** medium (Opus I4, Sol UI2). Sol UX2 is high, combined. **Effort** Opus S. Sol M (combined).
- **Top 5.** Sol rank 3 (UX2).

### M15. The brief row does not fit a phone

- **Source** Sol (UI2).
- **Saw.** At 390 px, the rank, the kind chip and three action icons leave a narrow text column (`brief.tsx:254`). The "Sent to" title wraps across several short lines (`02-sol/brief-phone-light.png`).
- **Why.** The user cannot read the target and the Action together.
- **Change.** Put the rank and kind on a short first line. Use the full width for the Action and the thread title. Put send, start and copy below the text with visible labels. Keep the full titles in tree rows.
- **Impact** medium. **Effort** M.

### M16. A closed project shows one icon for each thread

- **Source** Opus (Minor).
- **Saw.** A closed project shows one status icon for each thread (`app.tsx:1138`). A closed storefront shows 12.
- **Change.** Show counts ("2 need you · 4 working"). Keep the icon line only for 4 threads or fewer.
- **Impact** low. **Effort** S.

### M17. The header takes a sixth of a phone screen

- **Source** Opus (Minor).
- **Saw.** At 390 px, the header has three lines, about 140 px of 844 px (`01-opus/phone-dark-flat.png`).
- **Change.** Put Sort, Layout and Group by in one menu at phone width.
- **Impact** low. **Effort** S.

### M18. The browser tab does not show the count

- **Source** Opus (Minor).
- **Saw.** The browser version has no badge. The tab title is always "Thread tree".
- **Change.** Set the title to "(5) Thread tree". Add a dot to the favicon when the count is not 0.
- **Impact** low. **Effort** S.

## New features

### M19. "Open next"

- **Source** Opus (F1).
- **Saw.** To go to the next thread, the user scans, picks and clicks. The menu bar orders the Needs-you threads by wait, but the page does not.
- **Change.** Add one "Open next" control. It opens, in T3, the thread that waited longest, from the set that the "Needs you" filter keeps (`needs-input`, `plan-ready`, `your-turn`). Put it in the header (a button and the key `n`), and as the first item of the menu-bar menu. In T3, the visit clears `your-turn`, so the set gets shorter each time. It writes nothing to T3.
- **Depends on** M04: today only `needs-input` has a `since`.
- **Why.** It turns "what do I do now?" into one key press.
- **Impact** high. **Effort** S.
- **Top 5.** Opus rank 2.

### M20. A local Now and Next list

- **Source** Sol (F1).
- **Saw.** Manual order moves rows inside one list. It cannot collect selected threads across projects in one small working set. The page stores separate orders for each list (`src/page/order.ts:14`).
- **Why.** The user must find again and again the few threads that they chose to continue.
- **Change.** Add one Now slot and up to two Next slots above the tree. The user adds a thread from its row or from a brief Action. Each slot shows the live status, the full title and an Open control. Keep the choices after a reload. Offer Remove and a link back to the full tree. Keep a separate waiting count, so focus does not hide new requests.
- **Earlier decision.** No reversal. The list is local to this app. It does not change T3 pins, snooze or settled state, and it does not reorder the tree (closed map `frozen-rows`).
- **Related.** Opus rejected a page-only "park" mark, because T3 snooze does that job.
- **Impact** high. **Effort** M.
- **Top 5.** Sol rank 2.

### M21. Keyboard path through the rows

- **Source** Opus (F2).
- **Saw.** The only keyboard path is Tab. Each row has up to 7 stops (handle, key, title, PR chips, send, details). A page-level key handler closes the View panel with Escape (`app.tsx:632`, from Sol F2).
- **Change.** Add a roving focus on rows: `j` and `k` move, Enter opens in T3, `o` opens details, `s` opens send. Show the keys in the View panel legend.
- **Related.** M22 also adds a keyboard path, by search. The two are different changes and can share the key handler.
- **Impact** medium. **Effort** M.

### M22. Quick find

- **Source** Sol (F2).
- **Saw.** The header has no search control (`app.tsx:1750`). Folded projects hide titles (`02-sol/folds-light.png`).
- **Why.** The user must expand and scan the tree to go back to a known thread.
- **Change.** Add a Find control and Cmd/Ctrl+K. Match the title, issue key, project and branch from the tree data. Show full titles and statuses in the results. Enter opens the selected thread in T3. "Show in tree" opens its folded location.
- **Impact** medium. **Effort** M.

### M23. A small Needs-you window

- **Source** Opus (F3).
- **Saw.** The desktop map lists "a small always-on-top window with a summary" as not yet specified.
- **Change.** A small desktop window that lists only the Needs-you threads with their wait time and an "Open next" key. It stays beside the editor, so the user does not switch to the full tree.
- **Depends on** M04 and M19.
- **Impact** medium. **Effort** M.

## Checked and left out by the reviews

These are not items. The reviews looked at them and proposed nothing.

- **Writes to T3: settle, snooze, approve, deny, interrupt, remote-environment controls.** Both reviews leave them out. `t3 thread --help` lists only `list`, `start`, `send` and `show`, so these need the RPC with an `orchestration:operate` token (Opus). The send confirmation stays (Sol, closed map `send-message`).
- **A page-only "park" mark.** Opus leaves it out: T3 snooze does this job, and M09 covers the noise.
- **Automatic briefs, a stored digest, tools for the model.** Both leave them out. M10 runs no model.
- **Subagent signals.** Sol leaves them out: `DESIGN-SPEC.md:24` rejects them.
- **Last-message text.** Sol leaves it out for the same reason. Opus proposes it (M08).
- **Manual order, PR stacks, spawn lineage.** Sol states that its proposals keep all three (closed map `frozen-rows`).
- **Existing 0.1.7 features.** Opus did not propose sort, flat view, group by status or the panel redesign as new work.

## Facts checked against the code

The reviews disagree on these facts. The code at `5bf8567` decides.

| Fact | Opus | Sol | Code |
| --- | --- | --- | --- |
| Identical "Answer the agent" rows in the demo brief | five | four | Four. `brief.ts:72–74` gives `plan-ready` a different title and reason ("Review the plan"). The demo has four `needs-input` threads and one `plan-ready` thread (`scripts/demo.ts`). The five `answer` Actions are four identical rows and one other. |
| Rows that the "Needs you" filter keeps | 8 rows | 8 matching threads and 1 spawner | Sol is exact. `keepThreads` (`attention.ts:21`) keeps a spawner that holds a match. The demo gives 8 matching threads and the idle spawner "Design-system migration map": 9 thread rows. |
| A PR stack in a status section | wrong placement | correct, the stack stays together | By design. `SPEC.md:103` and the comment at `view.ts:101` say that a stack goes to the section of its most urgent thread. The defect is the spawner case (M01). The stack rows and the count are M07, in UX. |
| Effort of reliable wait times | S, `since` needs one field | M, needs changes to the shared data | The code supports S. `ThreadNode.since` exists (`src/shared/tree.ts:57`), `statusOf` sets it (`build-tree.ts:25`), and `latestRunCompletedAt` is decoded (`src/server/t3.ts:127`). No schema change is necessary. Two side effects: a guest-message `needs-input` has no `since` (`build-tree.ts:32`), and the brief digest reads `since` (`brief.ts:44`). |
| Line of the row age | `app.tsx:1075` | `app.tsx:1069` | `app.tsx:1075`. Line 1069 is the "+N" PR button. |
| Keyboard drag start key | Space worked | Space did not lift, Enter worked | Both keys start a drag. `src` sets no sensor, and the `@dnd-kit/dom` 0.5.3 default is `start: ["Space", "Enter"]`. The difference is a limit of each browser tool. |
| Pointer drag | the synthetic mouse drag did not move a project | pointer drag worked | Not a code fact. Opus also read it as a tool limit. No finding. |
| Base build | local `main` at 0.1.5, reviewed an export of `origin/main` | `5bf8567` | Same build. `map.md` records that local `main` was fast-forwarded to `5bf8567`, and `HEAD` is `5bf8567`. |

The reviews also differ on impact and effort for M01, M04, M06, M07, M10, M12 and M14. These are estimates, not facts. Each item gives both values.

## All items

| Id | Title | Group | Source | Impact | Effort |
| --- | --- | --- | --- | --- | --- |
| M01 | "Group by status" puts a thread with subthreads in the wrong section | Bugs | both | high | Opus S, Sol M |
| M02 | A filtered PR stack shows wrong stop numbers | Bugs | Opus | medium | S |
| M03 | The "Group by: Status" tooltip stays open | Bugs | Opus | low | S |
| M04 | Status phrase and wait time on rows that need you | UX | both | high | Opus S, Sol M |
| M05 | Sort the waiting sections of the flat view by wait | UX | Opus | high | S |
| M06 | The "Needs you" count and the filter do not agree | UX | both | Opus medium, Sol high | Opus S, Sol M |
| M07 | A status section holds rows of other statuses, and its count does not say so | UX | both | high | Opus S, Sol M |
| M08 | Last message on demand, in details and the send dialog | UX | Opus | high | M |
| M09 | Fold calm sections and hide snoozed threads | UX | Opus | high | S |
| M10 | Mark a brief Action when its facts change | UX | both | Opus medium, Sol high | Opus S, Sol M |
| M11 | Make the code-made answer Actions specific | UX | both | high | M |
| M12 | Make the brief shorter: three Actions first, or a fold | UX | both | Opus medium, Sol high | Opus S, Sol M |
| M13 | Remove the edge and wash from working rows | UI | Opus | medium | S |
| M14 | Show full thread titles in the brief | UI | both | medium (Sol UX2: high) | Opus S, Sol M |
| M15 | A phone layout for brief rows | UI | Sol | medium | M |
| M16 | Counts in place of icons on a closed project | UI | Opus | low | S |
| M17 | One menu for Sort, Layout and Group by on a phone | UI | Opus | low | S |
| M18 | The count in the browser tab title and favicon | UI | Opus | low | S |
| M19 | "Open next" | New features | Opus | high | S |
| M20 | A local Now and Next list | New features | Sol | high | M |
| M21 | Keyboard path through the rows | New features | Opus | medium | M |
| M22 | Quick find | New features | Sol | medium | M |
| M23 | A small Needs-you window | New features | Opus | medium | M |

## Source coverage

Each source finding is in one or more items.

- **Opus.** U1 → M04, M05. U2 → M08, M11. U3 → M01, M07. U4 → M09. U5 → M10. U6 → M06. I1 → M04. I2 → M13. I3 → M02. I4 → M12, M14. F1 → M19. F2 → M21. F3 → M23. Minor: closed project icons → M16; phone header → M17, M03; browser tab → M18.
- **Sol.** UX1 → M06, M01, M07. UX2 → M11, M12, M14. UX3 → M10. UI1 → M04. UI2 → M14, M15. F1 → M20. F2 → M22.
