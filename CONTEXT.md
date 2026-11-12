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

**Issue key**:
A tracker key in a thread title, such as `JED-4313` or `ENG-6081`. It groups the work thread and its review threads.
_Avoid_: ticket id, slug

**PR stack**:
A chain of dependent PRs. T3 reports every PR in a thread's stack.

**Project**:
A T3 Code project, usually one repo.

**Active thread**:
A thread that the default view shows. The exact rule is still open.

## Relationships

- A **Project** holds many **Issue keys**; an **Issue key** holds one or more **Spawn lineage** trees.
- A **Thread** has zero or one parent and zero or more **Subthreads**.
- A **PR stack** can span threads of more than one **Issue key**.

## Example dialogue

> **Dev:** "Where did the `Verify review candidates` thread come from?"
> **Domain expert:** "It is a **Subthread** of `Review #14998 ENG-5779`, which is under issue key `ENG-5779` in the frontend **Project**."
