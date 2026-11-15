---
label: wayfinder:map
status: open
created: 2026-11-15
---

# Map: Send messages to threads, execution

Resume with `/wayfinder-implement .wayfinder/send-message/map.md`. Run `/wayfinder-implement .wayfinder/send-message/map.md <ticket>` after a PR opens or merges.

## Destination

The page can write to T3 in three ways, each through a preview dialog with an editable message and a "Confirm send" step:

- Send the prompt of a "What's next" step to one of its threads.
- Send a free message to any thread, from its row.
- Start a new thread in a project from a step, with the step prompt as the first message.

Every route key is merged to `main`. Autopilot threads build it, one `/start-issue-auto` thread per ticket.

## Route

Source: markdown tickets in `tickets/`. Each key builds on the one before it (spec, endpoints, dialog, then its two users), so they form one chain.

### Lane 1

1. [Write the "Send message" spec](tickets/01-send-spec.md)
2. [Add the send and start endpoints (t3 CLI subprocess)](tickets/02-send-endpoints.md)
3. [Build the send dialog and the send button on a brief step](tickets/03-brief-send.md)
4. [Send a message from a thread row](tickets/04-row-send.md)
5. [Start a thread from a brief step](tickets/05-step-start-thread.md) — after 04-row-send (forced)

The destination is reached when every route key is done and no map ticket is open.

## Stacks

## Notes

- Mode: autopilot
- **Run to completion.** Do not stop for the user, except for a real decision that the tickets and the spec do not answer. Then stop and ask (grilling). A choice the spec leaves open but that has a clear default is not a stop: take the default and name it in the PR body.
- **Stack, do not wait.** When a key's PR opens, upkeep launches the next key at once, stacked on that key's branch (`stack on <branch>`). No key waits for a merge.
- **Auto-merge when green.** When `bun run check` passes, mark the PR ready and squash-merge it, lowest PR of the chain first. GitHub then sets the next PR's base to `main`; that branch merges `origin/main` (never a rebase or a force-push). A failing check is a stop only after you cannot fix it.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec; each key updates the spec for its own part. Each key that adds a visible feature updates `README.md` (see `CLAUDE.md`).
- **The app stops being read-only.** `SPEC.md` (scope line), `README.md` ("never writes to T3", Status) and `CONTEXT.md` change in ticket 01.
- **Skills:** `domain-modeling` for 01, `vercel:shadcn` for UI work. Write in ASD-STE100.
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode. The demo never runs the real `t3` CLI.

## Decisions so far

<!-- one line per closed map ticket -->

- send-message-01 (#24): the spec is in `SPEC.md` › "Send message". Routes `/t3/cli`, `/t3/send`, `/t3/start`; 30 s CLI timeout; ids in the JSON body; a start leaves no mark.

Decided at charting (by the user):

- **Transport:** the server spawns the T3 CLI: `t3 thread send <thread> -` and `t3 thread start <project> -`, with the message on stdin. It uses T3's own auth. The `orchestration:read` token stays as it is. Same subprocess pattern as the brief runner in `src/server/brief.ts`.
- **Confirm before send:** no one-click send. Every send opens a dialog that shows the target and the message. The user can edit the message, then confirms.
- **Target of a step:** a step can link several threads. The dialog has a thread picker with the step's threads; the first is preselected. One confirm sends to one thread.
- **Grilled before launch (by the user):**
  - After a send succeeds, the dialog closes and the brief step shows "Sent to <thread title>". The mark lives in page memory; a reload clears it.
  - The start dialog shows a project select (preselected from the step's threads), a title (default: the step's issue key, then the step title, so the thread groups under the key) and the editable prompt. No worktree and no model field: the project defaults apply.
  - The row entry point is a send icon at the row end, next to the details chevron. It shows on hover and on keyboard focus, and always on touch devices.
  - Cmd/Ctrl+Enter sends, Escape cancels, Enter makes a new line.
- **Defaults taken at charting:** a failure shows the `t3` exit code and stderr tail inline in the dialog, and keeps the draft. The server finds the CLI at `T3_BIN` from `.env`, else `~/.t3/bin/t3`; when it is missing, the send controls are disabled with a tooltip that says why.
- **Busy threads:** `t3 thread send` queues the message as the next turn and interrupts nothing. The dialog says so when the target is working.

## Not yet specified

## Out of scope

- Desktop notifications (proposed, not chosen).
- Approve or deny a pending request, settle, snooze, interrupt, archive. These need the RPC with an `orchestration:operate` token, not the CLI.
- Send the same message to several threads at once.
- Threads in linked T3 environments on other machines.
