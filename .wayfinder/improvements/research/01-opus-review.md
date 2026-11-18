# Improvement review A (Claude Opus)

Question: which UX, UI and new-feature changes help most an engineer who runs many T3 Code threads at once, gets overwhelmed, and uses this app to focus and pick the next thread?

## Baseline

- The local `main` is at 0.1.5. `origin/main` (`5bf8567`, release 0.1.7) is 8 commits ahead. It adds "Last updated" sort, the Flat view with "Group by status", and the new View panel. The real app on 4773 runs 0.1.7.
- This review covers `origin/main`. I exported it to a scratch folder and ran `PORT=4775 bun run demo` from there, because the demo from the repo root shows the old build. All file:line references are at `5bf8567`.
- I did not propose sort, flat view, group by status or the panel redesign as new work. They exist.
- Real app, one snapshot in the evening (look only, no click on a control that writes): the page rendered 14 thread rows, and 9 of them were snoozed. This report names no real thread.
- Screenshots are in `01-opus/`. All are from the 0.1.7 demo.

Covered on 0.1.7: tree and flat view, light and dark, 1280 px and 390 px, "Needs you" filter, sort menu, group by, "Collapse all" and "Expand all", project fold, details, keyboard drag (Space, arrow, Space), "What's next" with the stub, the model menu, the send dialog from an Action and from a row, the start dialog (confirm against the stub), and the View panel. A mouse drag from the Playwright tool did not move a project. Keyboard drag worked, so I take this as a limit of the synthetic drag, not as a defect.

## UX

### U1. The row shows the wrong time for a thread that waits for you

- **Saw.** The time at the row end is the age of `updatedAt` (`src/page/app.tsx:1075`). In the demo, API-94 shows "2h", but its approval waits for 12 min. The time in status shows only in the icon tooltip and in details ("command · 12m"). "Last updated" sort uses `lastRun`, not the wait. In the flat "Needs input" section, rows keep the manual order. Only the menu-bar menu lists the longest wait first.
- **Why.** The user picks the next thread. The best signal is "who waits for me, and since when". Now the user must hover each icon to get it.
- **Change.** On `needs-input`, `plan-ready` and `your-turn` rows, show the time in status in place of the age ("12m"), with the tooltip "Waiting since 22:58". For `plan-ready` and `your-turn`, set `since` to `latestRunCompletedAt` in `build-tree.ts` (the field is already decoded). In the flat view with "Group by status", sort the Needs input, Plan ready and Your turn sections by wait, oldest first, as the menu bar does.
- **Impact** high. **Effort** S.

### U2. To know what an agent asks, the user must open T3

- **Saw.** A `needs-input` row shows an icon. Details show only "Request: command · 12m" (`app.tsx:904`). The brief has five identical rows: "Answer the agent. The agent waits for your input." (`src/server/brief.ts:72`). The send dialog shows the target title and an empty box, with no context.
- **Why.** Each answer starts with a full context switch into T3, also when the answer is "yes" or one line. With many threads, this switch is the main cost.
- **Change.** Show the tail of the last assistant message on demand:
  - in the details block, as a "Last message" line, loaded when the block opens;
  - in the send dialog, above the message box. When the target waits on an approval, also say that a message does not approve the request. Now the dialog for API-94 shows only the title and an empty box (`01-opus/row-send-dialog-light.png`);
  - in the reason of a code-made `answer` Action (first sentence of the tail).
  The server already reads this text for the brief (`lastMessages` in `src/server/lineage.ts`). The request row in SQLite holds no question or command text: its `payload_json` has only `id`, `kind`, `status`, `nativeRequestRef`, `responseCapability`, `decision` or `answers`. The command text needs a read of `turn_items`, so start with the last message.
- **Ruled out before.** `DESIGN-SPEC.md` › Choices rejects "the last message of a thread, in any place". The reason was a dense row. This change adds nothing to the row. The text shows only after a click on details or send, so the scan cost stays the same.
- **Impact** high. **Effort** M.

### U3. "Group by status" puts threads in the wrong section

- **Saw.** `sections` in `src/page/view.ts:105` reads `unitThreads` (`view.ts:81`), which skips subthreads. In the demo, "Migrate Dialog to the new tokens" is `your-turn`, and "Migrate Button…" is `working`. Both sit under "Idle and snoozed", because their parent is idle (`01-opus/flat-group-status-bottom.png`). The "Your turn 2" count leaves the first one out. The other way, a PR stack with one waiting thread pulls its three calm threads (working, done, interrupted) into "Needs input" (`01-opus/flat-group-status-light.png`). The section count counts units, so "Needs input 4" holds 7 thread rows, and 4 of them need input.
- **Scope.** This applies only in the Flat view with "Group by: Status", which the user must turn on. The tree and the "Needs you" filter place these threads correctly.
- **Why.** This view is the closest thing to a queue, so the user trusts its sections. A thread that needs you and sits under "Idle" is a thread the user does not see. Calm rows in "Needs input" add noise at the top.
- **Change.** Put a unit in the section of its most urgent thread, subthreads included. In a section, show the rows of a stack that do not match in muted color, or fold them to the rail header. Count threads that match, not units.
- **Impact** high. **Effort** S.

### U4. Calm threads take the same space as urgent ones

- **Saw.** In one snapshot of the real app, 9 of 14 rendered rows were snoozed. In the tree, snoozed rows sit among the others. In the flat view, the "Working", "Idle and snoozed" and "Done" sections always show and do not fold (`DESIGN-SPEC.md` › Flat view: "a non-collapsible row"; `SPEC.md` › UI: "The flat list has no folds").
- **Why.** The user opens the app to reduce noise. Rows that need no action push the urgent rows down, mostly on a phone.
- **Change.** Make the flat section headers fold, with the state saved like the tree folds. Close "Idle and snoozed" and "Done" at first. In the tree, add a "Show snoozed threads" switch next to "Show settled threads", on by default. A snoozed thread with a request is `needs-input`, so it still shows.
- **Decided before.** Tree rule 3 says snoozed threads stay visible, and the flat view shipped with no folds in #57. Both choices keep every thread in view. This change keeps that as the default and lets the user choose less. A folded section still shows its count, so no thread is lost.
- **Impact** high. **Effort** S.

### U5. A brief Action does not change after you act on it

- **Saw.** The brief keeps its Actions until the next run. The thread link icon updates live, but the Action row stays the same. "Clean up: Settle the finished docs threads" asks for a write that the app cannot do.
- **Why.** The brief is a to-do list. If done items stay, the user must check each one again.
- **Change.** Mark an Action done (check icon, muted row, moved to the end) when its linked threads no longer meet its rule: `answer` when no thread is `needs-input` or `plan-ready`, `fix` when the PR has no failing checks, conflict or requested changes, `merge` when the PR is merged. Show "N threads changed since HH:MM" in the head, with "Run again". This runs no model, so it is not an automatic brief.
- **Impact** medium. **Effort** S.

### U6. The "Needs you" count and the filter do not agree

- **Saw.** The chip shows 5. The filter keeps 8 rows, because it also keeps `your-turn` (`CONTEXT.md` › Needs you defines this).
- **Why.** The user reads "5" and finds 8 rows. The difference costs trust in the count.
- **Change.** Keep the definition. Show the your-turn count as a second, muted number in the chip ("5 · 3"), with the tooltip "5 wait for you, 3 finished and not opened".
- **Impact** medium. **Effort** S.

## UI

### I1. Status is a 12 px icon with no text

- **Saw.** The row starts with one 12 px icon (`app.tsx:1001`). There are 17 icon variants. The phrase column of `DESIGN-SPEC.md` › Thread row is gone. The legend is now in a closed fold of the View panel (`01-opus/view-panel-dark.png`).
- **Why.** Shield, question bubble and chat bubble look alike at 12 px. The user must learn 17 shapes to read the list.
- **Change.** Show the phrase as text only on attention rows: `needs-input`, `plan-ready`, `your-turn`, `failed` ("Approval 12m", "Plan ready 40m"). Calm rows keep the icon only, so the list stays quiet. Do this with U1.
- **Decided before.** Commit `d602e6e` (#18) removed the 120 px phrase column for all rows, so the key and title start close to the icon. That reason holds for calm rows, which are most rows. On the few attention rows, a short phrase after the title (in the right group) keeps the title start in place and puts the most useful words on the row.
- **Impact** high. **Effort** S.

### I2. Working rows are as loud as rows that need you

- **Saw.** A `working` row has a blue left edge and a blue wash (`src/page/index.css:220–258`), and its icon turns. A `needs-input` row has the amber edge and wash. In the demo, 5 working rows and 4 needs-input rows carry a wash.
- **Why.** A colored edge and wash mean "look here". A working thread needs nothing from the user.
- **Change.** Remove the edge and the wash from `working`. Keep the turning icon. Then only rows that need the user carry a wash.
- **Decided before.** `DESIGN-SPEC.md` › Gradients specifies the working wash ("weaker wash and a 2 px left edge"), and Choices says motion means "alive" or "waiting for you". For a user who is overwhelmed, "alive" is not a call to act. The turning icon already says "alive", so the wash repeats it.
- **Impact** medium. **Effort** S.

### I3. A filtered PR stack shows wrong stop numbers

- **Saw.** With "Needs you", the storefront stack shows one stop, "1 · #2102". #2102 is position 2 of 4 (`01-opus/tree-needs-you-last-updated-light.png`). The rail uses the index of the rendered group (`app.tsx:1302`, `app.tsx:1352`), not `stack.pos`.
- **Why.** "1" tells the user that this PR is the base and can merge first. It cannot.
- **Change.** Use `stack.pos` for the stop and the node number. When groups are hidden, show "2 of 4".
- **Impact** medium. **Effort** S.

### I4. The brief panel is long and cuts thread names

- **Saw.** Thread links in the brief truncate (`src/page/brief.tsx:126`): "API-94 · Approve the schema change, th…". At 390 px they read "DOC-12 · Gettin…" (`01-opus/phone-dark-brief.png`). Ten Actions take about 540 px, so the tree starts below the fold. The panel closes but does not fold.
- **Why.** The link is the thing the user clicks. A cut name forces a hover or a guess.
- **Change.** Let thread links wrap, as tree titles do. Let the panel fold to its head with "10 Actions · 3 done", and save that state.
- **Impact** medium. **Effort** S.

## New features

### F1. "Open next"

- **Saw.** To go to the next thread, the user scans, picks and clicks. The menu bar already orders the Needs-you threads by wait, but the page does not.
- **Change.** Add one "Open next" control. It opens, in T3, the thread that waited longest, from the set that the "Needs you" filter keeps (`needs-input`, `plan-ready` and `your-turn`). Put it in the header (button and the key `n`), and as the first item of the menu-bar menu. In T3, the visit clears `your-turn`, so the set gets shorter each time.
- **Depends on** U1: today only `needs-input` has a `since`, so `plan-ready` and `your-turn` threads cannot be ordered by wait until U1 sets it.
- **Why.** It turns "what do I do now?" into one key press. It writes nothing to T3.
- **Impact** high. **Effort** S.

### F2. Keyboard path through the list

- **Saw.** The only keyboard path is Tab. Each row has up to 7 stops (handle, key, title, PR chips, send, details). Keyboard drag works well (Space, arrow, Space; the live region says "API-94 dropped at position 1 of 7").
- **Change.** Add a roving focus on rows: `j` and `k` move, Enter opens in T3, `o` opens details, `s` opens send. Show the keys in the View panel legend.
- **Impact** medium. **Effort** M.

### F3. A small Needs-you window

- **Saw.** The desktop map lists "a small always-on-top window with a summary" as not yet specified.
- **Change.** A small desktop window that lists only the Needs-you threads with their wait time and an "Open next" key. It stays beside the editor, so the user does not switch to the full tree.
- **Impact** medium. **Effort** M.

## Minor (low impact, effort S)

- **Closed project icons.** A closed project shows one icon for each thread (`app.tsx:1138`); a closed storefront shows 12. Show counts ("2 need you · 4 working"), and keep the icon line only for 4 threads or fewer.
- **Phone header.** At 390 px, the header has three lines, about 140 px of 844 px, a sixth of the screen (`01-opus/phone-dark-flat.png`). Put Sort, Layout and Group by in one menu at phone width. The "Group by: Status" tooltip also stays open after its menu closes.
- **Browser tab.** The browser version has no badge, and the tab title is always "Thread tree". Set it to "(5) Thread tree" and add a dot to the favicon when the count is not 0.

## Checked and left out

- Settle, snooze, approve, deny, interrupt. `t3 thread --help` lists only `list`, `start`, `send` and `show`, so these still need the RPC with an `orchestration:operate` token. U4 hides snoozed rows on the page and writes nothing.
- A page-only "park" mark. T3 snooze already does this job, and the user uses it a lot. U4 covers the noise.
- Automatic briefs and tools for the model. U5 needs no model run.

## Top 5

1. **U1 with I1, wait time and phrase on attention rows.** Every view gets it: the user sees what each waiting thread wants and for how long, with no hover.
2. **F1, "Open next".** One key goes to the thread that waited longest, so the user does not need to pick (needs U1 first).
3. **U2, last message on demand.** The user reads what the agent asks before the switch to T3, and often answers from the send dialog.
4. **U3, fix "Group by status" placement.** Small fix, but the one queue-like view now hides a your-turn thread under "Idle".
5. **U4, fold calm sections and hide snoozed rows.** Snoozed and done rows push the urgent rows down; in one snapshot of the real app, most rows were snoozed.
