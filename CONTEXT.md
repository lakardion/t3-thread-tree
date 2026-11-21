# T3 Thread Tree

A local view that shows T3 Code threads as one tree, so the user can see what each thread is, how it relates to others, and its status.

## Language

**Thread**:
One T3 Code conversation with an agent. It has a title, a status, a project, and linked PRs.
_Avoid_: session, chat, task

**Subthread**:
A thread that another thread spawned: a subagent, a delegate, or a launched thread.
_Avoid_: child task

**Spawn lineage**:
The parent → subthread relation, from the thread that spawned a subthread to that subthread.
_Avoid_: ancestry, history

**Launched thread**:
A top-level thread that an agent started with a launch tool. T3 does not record its spawner as a parent.

**Launch nesting**:
Showing a keyless **Launched thread** under its visible spawner, instead of in its project's "No issue key" group. It is a user setting and is off by default.
_Avoid_: launcher nesting, lineage view

**Issue key**:
A tracker key in a thread title, such as `JED-4313` or `ENG-6081`. It groups the work thread and its review threads.
_Avoid_: ticket id, slug

**PR stack**:
A chain of dependent PRs. T3 reports every PR in a thread's stack.

**Project**:
A T3 Code project, usually one repo.

**Active thread**:
An unsettled top-level thread (any status, snoozed included), or a subagent whose top-level ancestor is active. The default view shows only active threads.

**Needs you**:
The threads that wait on the user: status needs input or plan ready. The Dock badge, the Needs-you badge in the header and the menu-bar list show this set. A notification fires when a thread enters this set, or fails. The "Needs you" filter also keeps your-turn threads, and the header shows their count next to the Needs-you count.
_Avoid_: attention, unread

**Context row**:
A row that shows only to give context. In a status section, it is a thread whose status is not one of the section's statuses, or a settled thread. In the "Needs you" filter, it is a kept spawner that does not match. A context row shows muted; in a PR stack in a status section, it folds behind "+N other threads". A section count leaves context rows out.

**Status section**:
A group of the flat view, with "Group by Status", that holds the threads of one or more statuses, most urgent first. Its header counts the threads that match it. It folds.
_Avoid_: status group, bucket

**Wait**:
The time since a thread started to wait on the user. It counts from the request for needs input, and from the run completion for plan ready and your turn. A row that waits on the user shows it beside the phrase.
_Avoid_: age (age is the time since the last update)

**Desktop app**:
The tree in its own macOS window, with a Dock icon, a Dock badge, notifications and a menu-bar entry. It shows the same page as the **Browser version** and stays alive when its window closes.
_Avoid_: native app, Electron app

**Open next queue**:
The threads that "Open next" can open: needs input, plan ready or your turn, not settled, subthreads included, oldest **Wait** first. It is wider than **Needs you**, because it has your-turn threads too.
_Avoid_: waiting list, Needs-you list

**Up next window**:
A small always-on-top window of the **Desktop app** that lists the **Open next queue**, each thread with its **Wait**, and has "Open next". The UI calls it Up next. It only opens threads and changes no T3 state.
_Avoid_: mini window, small window, Needs-you window

**Browser version**:
The tree served on a local port and opened in a browser tab, with no Dock badge, notifications or menu-bar entry.
_Avoid_: web app, web version

**Focus list**:
Up to three threads that the user chose to continue, shown above the tree. It is opt-in: the strip is hidden until the user turns it on. The UI calls it Focus. The user adds a thread from a row or by drag. A settled or deleted thread leaves the list. It is local to this page: it changes no T3 state and does not reorder the tree.
_Avoid_: Now and Next, pins, favorites, working set

**Looks done**:
A thread that is not settled, has no activity for more than 1 hour, and has a sign that its work is finished: all its PRs are merged or closed, or its **Catch-up** says it is done. The page offers to settle these threads in one step. The UI calls it "look done". The user can keep a thread out of the offer until its next run.
_Avoid_: finished, stale, ready to close

**Find**:
The control that finds any thread by title, issue key, project, branch or PR number, and opens it or shows it in the tree. It searches the active threads, and the settled threads on request.
_Avoid_: search, quick open, command palette

**Key hint**:
A small key cap that floats on the page beside a control or a row, and names the key that does the same thing. It shows only while the user holds Alt/Option. The user can turn all key hints off with a switch in Settings. The tooltips and the Keys legend in Settings are not key hints.
_Avoid_: shortcut hint, keyboard hint, keycap badge

**Digest**:
The compact text form of one thread that the model reads for a **Catch-up**: one line of facts, then the tail of the last assistant message.
_Avoid_: summary, snapshot

**Model pick**:
The way the app runs a model, chosen by the user: Claude Haiku, Codex Luna, the **Local model** or the **Apple model**. The **Catch-up** uses it. The user sets it in the Catch-up fold of Settings.
_Avoid_: CLI, provider, engine

**Local model**:
A model that runs on the user's machine, in a runtime the user starts, and writes the **Catch-up**. Thread text does not leave the machine. It is an opt-in **Model pick** next to the remote ones: the page never picks it on its own, and never falls back from it to a remote CLI.
_Avoid_: offline model, on-device AI

**Apple model**:
Apple's on-device model, which macOS runs on a Mac with Apple Intelligence on, and which writes the **Catch-up**. The user starts and configures nothing. Thread text does not leave the machine. It is an opt-in **Model pick** in the desktop app only, with the same rules as the **Local model**: the page never picks it on its own, and never falls back from it to a remote CLI.
_Avoid_: Apple Intelligence, FoundationModels, on-device AI, local model

**Catch-up**:
One line, written by the **Model pick**, that says what a waiting thread did and what it asks of the user. The server makes it once for each waiting thread message and request, and keeps it in memory.
_Avoid_: summary, brief

**Suggested reply**:
A reply from a fixed pool, such as "commit push", that the page offers for a waiting top-level thread. Cue words in the thread's last agent message pick it. When no cue matches, the page offers a fixed default set. It shows as a chip in the send dialog. A click puts its text in the message, and the user still confirms the **Send**. It is not a **Catch-up** option, which answers the thread's own question.
_Avoid_: quick reply, canned reply, suggestion chip

**Reply intent**:
One entry of the **Suggested reply** pool: an id such as `ship`, its chip text, and the cue that picks it.
_Avoid_: reply type, reply category

**Send**:
One message from the page to one thread, through the `t3` CLI, after the user confirms it in the send dialog. A busy thread gets it as its next turn. Nothing is interrupted.
_Avoid_: post, push, dispatch

**Start thread**:
A new top-level thread in a project, with a first message, through the `t3` CLI. The server has the route, and the page has no control for it. T3 records it as a **Launched thread** with no spawner.
_Avoid_: launch, spawn, create

**Watched label**:
A GitHub label name that the user lists in the Settings panel. The list is empty by default, so no **Label pill** shows until the user adds a name.
_Avoid_: tracked label, filter label

**Label pill**:
A small mark in a thread row that shows a **Watched label** on one of the row's PRs, for example `ready-for-review`.
_Avoid_: label tag, label chip

## Relationships

- A **Project** holds many **Issue keys**; an **Issue key** holds one or more **Spawn lineage** trees.
- A **Thread** has zero or one parent and zero or more **Subthreads**.
- A **PR stack** can span threads of more than one **Issue key**.
- A thread in a **PR stack** always shows in its stack block, whatever its **Issue key**, spawner or **Launch nesting**. Review threads are the exception: they stay in Reviews.
- The keyless threads of one **PR stack** share one group, named after the bottom PR (`PR stack #61`).

## Example dialogue

> **Dev:** "Where did the `Verify review candidates` thread come from?"
> **Domain expert:** "It is a **Subthread** of `Review #14998 ENG-5779`, which is under issue key `ENG-5779` in the frontend **Project**."
