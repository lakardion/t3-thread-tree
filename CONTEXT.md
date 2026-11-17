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

**Wait**:
The time since a thread started to wait on the user. It counts from the request for needs input, and from the run completion for plan ready and your turn. A row that waits on the user shows it beside the phrase.
_Avoid_: age (age is the time since the last update)

**Desktop app**:
The tree in its own macOS window, with a Dock icon, a Dock badge, notifications and a menu-bar entry. It shows the same page as the **Browser version** and stays alive when its window closes.
_Avoid_: native app, Electron app

**Browser version**:
The tree served on a local port and opened in a browser tab, with no Dock badge, notifications or menu-bar entry.
_Avoid_: web app, web version

**Next-step brief**:
A model-written, ranked list of recommended actions over the active threads. Each action links to one or more threads. The user asks for it with the "What's next" button.
_Avoid_: suggestion, summary, advice

**Action**:
One ranked item of a **Next-step brief**. It has a kind (answer, merge, fix, review, clean-up, unblock) and links to one or more top-level threads.
_Avoid_: step, task, todo

**Digest**:
The compact text form of one thread that the model reads for a **Next-step brief**: one line of facts, then the tail of the last assistant message. Code builds it on each click.
_Avoid_: summary, snapshot

**Send**:
One message from the page to one thread, through the `t3` CLI, after the user confirms it in the send dialog. A busy thread gets it as its next turn. Nothing is interrupted.
_Avoid_: post, push, dispatch

**Start thread**:
A new top-level thread in a project, with a first message, through the `t3` CLI, after the user confirms it in the start dialog. T3 records it as a **Launched thread** with no spawner.
_Avoid_: launch, spawn, create

## Relationships

- A **Project** holds many **Issue keys**; an **Issue key** holds one or more **Spawn lineage** trees.
- A **Thread** has zero or one parent and zero or more **Subthreads**.
- A **PR stack** can span threads of more than one **Issue key**.
- A thread in a **PR stack** always shows in its stack block, whatever its **Issue key**, spawner or **Launch nesting**. Review threads are the exception: they stay in Reviews.
- The keyless threads of one **PR stack** share one group, named after the bottom PR (`PR stack #61`).

## Example dialogue

> **Dev:** "Where did the `Verify review candidates` thread come from?"
> **Domain expert:** "It is a **Subthread** of `Review #14998 ENG-5779`, which is under issue key `ENG-5779` in the frontend **Project**."
