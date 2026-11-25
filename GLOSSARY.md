# T3 Thread Tree

A local view that shows T3 Code threads as one tree, so the user can see what each thread is, how it relates to others, and its status.

## Language

### Threads

**Thread**:
One T3 Code conversation with an agent. It has a title, a **Status**, a **Project**, and linked PRs.
_Avoid_: session, chat, task

**Status**:
The state of a thread on the page: needs input, plan ready, your turn, working, starting, blocked, snoozed, failed, interrupted, done or idle.
_Avoid_: state, phase

**Your turn**:
The **Status** of a thread whose run completed and that the user has not opened since.
_Avoid_: unread, unseen

**Blocked**:
The **Status** of a thread whose run waits on another thread. The row says "Waiting".
_Avoid_: waiting (that word is for **Wait**)

**Settled**:
A thread that T3 marks as finished, by the user or by an agent. It leaves the default view and stays findable.
_Avoid_: archived, closed, done (done is a **Status**)

**Snoozed**:
A thread put aside until a set time. Until then its **Status** is snoozed, unless it has an open request.
_Avoid_: muted, deferred

**Review thread**:
A thread that reviews a PR, with a title that starts with "Review #". The Reviews **Placement rule** puts it in the Reviews group.
_Avoid_: reviewer thread

**Subthread**:
A thread that another thread spawned: a subagent, a delegate, or a launched thread.
_Avoid_: child task

**Spawn lineage**:
The parent → subthread relation, from the thread that spawned a subthread to that subthread.
_Avoid_: ancestry, history

**Launched thread**:
A top-level thread that an agent started with a launch tool. T3 does not record its spawner as a parent.

**Active thread**:
An unsettled top-level thread (any **Status**, snoozed included), or a subagent whose top-level ancestor is active. The default view shows only active threads.

### Structure

**Project**:
A T3 Code project, usually one repo.

**Issue key**:
A tracker key in a thread title, such as `JED-4313` or `ENG-6081`. It groups the work thread and its review threads.
_Avoid_: ticket id, slug

**PR stack**:
A chain of dependent PRs. T3 reports every PR in a thread's stack.

**Group**:
A named set of rows in the tree: a **Project**, an **Issue key**, a **PR stack**, a **Map group**, the Reviews group, No project, or a Linear project or milestone.
_Avoid_: branch (that word is for git)

**Launch nesting**:
The last **Placement rule**: it shows a keyless **Launched thread** under its visible spawner when both have the same **Home**. It is off by default.
_Avoid_: launcher nesting, lineage view

**Status section**:
A group of the flat view, with "Group by Status", that holds the threads of one or more statuses, most urgent first.
_Avoid_: status group, bucket

**Context row**:
A row that shows only to give context: a thread outside the statuses of its **Status section**, a settled thread, or a kept spawner in the "Needs you" filter. It shows muted and does not count.

### Placement

**Placement rule**:
One step of the ordered chain that decides where a thread goes: Map group, Reviews, PR stack, Issue key or **Launch nesting**. The user can switch each one on or off and reorder the middle three.
_Avoid_: grouping, group rule, placement mode

**Pool**:
The threads that no earlier **Placement rule** has claimed.
_Avoid_: queue, remaining threads

**Claim**:
A **Placement rule** taking a thread from the **Pool**, into a **Group** or under a row. The first claim wins.
_Avoid_: match, assign

**Layout**:
The shape that turns the claims into groups: the project layout (the T3 tree) or the Linear layout (the Linear tree).
_Avoid_: view (the flat view uses a layout and places nothing)

**Home**:
The container that a thread's own **Issue key** and review title give it in a **Layout**.
_Avoid_: parent, slot

**Loose thread**:
A thread that no **Placement rule** claims. It sits directly under its **Project**, or at the top level of the Linear tree.
_Avoid_: No issue key, ungrouped thread, loose row

### Order

**Last run**:
The one time a row sorts by and shows: the start or end of the newest run of the thread, else its creation time. A row that heads a block shows the newest Last run of the threads that the view shows.
_Avoid_: last updated, updated, activity

**Pin**:
A mark the user puts on a row or a header so that it leads its own list, whatever the sort. It is local to the page, and is not T3's own pin ("Pinned in T3").
_Avoid_: favorite, star, sticky

**Sleeping pin**:
A **Pin** whose item is not in the view now. It wakes when the item comes back.
_Avoid_: stale pin, orphan pin

### Waiting on the user

**Needs you**:
The unsettled threads with needs input, plan ready or **Your turn**, plus the **Run questions** and **Paused runs**. These wait on the user.
_Avoid_: attention, unread

**Wait**:
The time since a thread or a run started to wait on the user.
_Avoid_: age (age is the time since the **Last run**)

**Open next queue**:
The **Needs you** items, subthreads included, in the order that "Open next" opens them: oldest **Wait** first.
_Avoid_: waiting list, Needs-you list

**Triage**:
The card that walks the **Open next queue** one item at a time, where the user acts on each one.
_Avoid_: inbox, review mode

**Looks done**:
An unsettled thread with no activity for more than 1 hour and a sign that its work is finished: all its PRs are merged or closed, or its **Catch-up** says it is done. The UI says "look done".
_Avoid_: finished, stale, ready to close

### Finding and acting

**Find**:
The control that finds any thread by title, issue key, project, branch or PR number, and opens it or shows it in the tree.
_Avoid_: search, quick open, command palette

**Key hint**:
A small key cap beside a control or a row that names the key that does the same thing. It shows only while the user holds Alt/Option. Tooltips and the Keys legend are not key hints.
_Avoid_: shortcut hint, keyboard hint, keycap badge

**Send**:
One message from the page to one thread, which the user confirms first. A busy thread gets it as its next turn. Nothing is interrupted.
_Avoid_: post, push, dispatch

**Suggested reply**:
A reply from a fixed pool, such as "commit push", that the page offers for a waiting top-level thread. A click puts its text in the **Send** message. It is not a **Catch-up** option, which answers the thread's own question.
_Avoid_: quick reply, canned reply, suggestion chip

**Reply intent**:
One entry of the **Suggested reply** pool: an id such as `ship`, its chip text, and the cue that picks it.
_Avoid_: reply type, reply category

**Start thread**:
A new top-level thread in a project, with a first message. T3 records it as a **Launched thread** with no spawner.
_Avoid_: launch, spawn, create

**Watched label**:
A GitHub label name that the user lists in Settings. No **Label pill** shows until the user adds one.
_Avoid_: tracked label, filter label

**Label pill**:
A small mark in a thread row that shows a **Watched label** on one of the row's PRs, for example `ready-for-review`.
_Avoid_: label tag, label chip

### Catch-up and models

**Catch-up**:
One line, written by the **Model pick**, that says what a waiting thread did and what it asks of the user.
_Avoid_: summary, brief

**Digest**:
The compact text form of one thread that the model reads for a **Catch-up**: one line of facts, then the tail of the last assistant message.
_Avoid_: summary, snapshot

**Model pick**:
The model that the user chose to write the **Catch-up**: Claude Haiku, Codex Luna, the **Local model** or the **Apple model**.
_Avoid_: CLI, provider, engine

**Local model**:
A model that runs in a runtime the user starts on their machine. Thread text does not leave the machine. It is opt-in: the page never picks it alone and never falls back from it to a remote model.
_Avoid_: offline model, on-device AI

**Apple model**:
Apple's on-device model, which macOS runs when Apple Intelligence is on. It has the same rules as the **Local model**, needs no setup, and is offered only in the **Desktop app**.
_Avoid_: Apple Intelligence, FoundationModels, on-device AI, local model

### Workflows

**Workflow**:
A T3 Code script that chains agent steps, code steps and questions to the user into one durable job.
_Avoid_: pipeline, automation, bot

**Run**:
One execution of a **Workflow**. The tree shows an active run as a run row, with its **Step threads** and child runs under it.
_Avoid_: job, execution, instance

**Step thread**:
A thread that an agent step of a **Run** runs in. It shows only under its run, never as a **Loose thread**.
_Avoid_: run thread, workflow thread

**Run question**:
An open question that a **Run** asks the user, with a title and choices. The user answers with one choice and an optional reason.
_Avoid_: workflow prompt, ask, approval

**Paused run**:
A **Run** that a failed step stopped and that waits for a person to resume or cancel it. A run that T3 will resume by itself is not a paused run.
_Avoid_: failed run, stuck run

**Start workflow**:
One new **Run** of a **Workflow** from the page, which the user confirms first. The page fills the input from where the user starts it: a thread, a PR, a PR stack or the checked **Looks done** threads.
_Avoid_: launch, trigger, kick off

### Maps

**Map key**:
The wayfinder map that a thread works on, read from its first message. It is internal and never shows.
_Avoid_: map id, map slug

**Map thread**:
The thread that launched the topmost threads of a **Map key**, usually the thread that charted the map. It heads the **Map group**.
_Avoid_: charting thread, launcher, root thread

**Marked map thread**:
A **Map thread** that the user marked by hand, for a map with no **Map key**. Its direct children with no own key form its **Map group**.
_Avoid_: manual map, fake map

**Map member**:
A thread that belongs to a map: by its own **Map key**, else by the key of its nearest ancestor on the spawner chain. A thread belongs to one map at most. A **Step thread** is never a member.
_Avoid_: map thread (that is the head), ticket thread

**Map group**:
The **Map members** of one map, shown under their **Map thread**. It is one unit in every view.
_Avoid_: map stack, map section

**Map header**:
The row that heads a **Map group** when its **Map thread** is settled or missing, or heads several maps. It is not a thread.
_Avoid_: map row, map title

### The app

**Desktop app**:
The tree in its own macOS window, with a Dock icon, a Dock badge, notifications and a menu-bar entry. It shows the same page as the **Browser version**.
_Avoid_: native app, Electron app

**Browser version**:
The tree opened in a browser tab, with no Dock badge, notifications or menu-bar entry.
_Avoid_: web app, web version

**Up next window**:
A small always-on-top window of the **Desktop app** that lists the **Open next queue**. It only opens threads.
_Avoid_: mini window, small window, Needs-you window

## Relationships

- A **Project** holds many **Issue keys**; an **Issue key** holds one or more **Spawn lineage** trees.
- A **Thread** has zero or one parent and zero or more **Subthreads**.
- A **PR stack** can span threads of more than one **Issue key**.
- A thread goes to the first **Placement rule** that **Claims** it. With the default order, a thread in a **PR stack** shows in its stack block, whatever its **Issue key**, spawner or **Launch nesting**; a **Review thread** stays in Reviews, and a **Map member** shows in its **Map group**, with its stack mates inside the group.
- A **Pin** orders a list that the **Placement rules** already built. It never moves an item to another list.
- A **Map thread** heads one **Map group** for each map it launched. A **Map group** can hold the **Map group** of a sub-map, at the place of its **Map thread**.
- The keyless threads of one **PR stack** share one group, named after the bottom PR (`PR stack #61`).

## Example dialogue

> **Dev:** "Where did the `Verify review candidates` thread come from?"
> **Domain expert:** "It is a **Subthread** of `Review #14998 ENG-5779`, which is under issue key `ENG-5779` in the frontend **Project**."
