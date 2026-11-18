---
label: wayfinder:map
status: open
created: 2026-11-18
---

# Map: A brief that helps you choose

Resume the decision tickets with `/wayfinder .wayfinder/better-brief/map.md`. Resume the route keys with `/wayfinder-implement .wayfinder/better-brief/map.md`. Parent: [Effort E: a brief that helps you choose](../improvements-program/tickets/06-effort-e-brief.md).

## Destination

The **Next-step brief** helps the user choose. Each answer Action says what the agent asks and how long it waited. An Action that is no longer true shows as **done** or **changed**. The brief shows three Actions first and folds. Thread titles show in full, and a brief row fits a phone. The five items M11, M10, M12, M14 and M15 are merged to `main`, one draft PR each, in that order, as one stack 03 ← 04 ← 05 ← 06 ← 07. The user tests the stack and merges it, bottom PR first.

## Route

Source: markdown tickets in `tickets/`. The keys form one chain, in the order of the improvements list.

### Lane 1

1. [Make the answer Actions specific](tickets/03-answer-actions-build.md) (M11) — after [the brief row look](tickets/01-brief-row-look.md) closes
2. [Mark done and changed Actions](tickets/04-action-marks-build.md) (M10) — stacks on 03-answer-actions-build, and after [the done and short-brief rules](tickets/02-done-and-short-rules.md) close
3. [Show three Actions first and fold the brief](tickets/05-short-brief-build.md) (M12) — stacks on 04-action-marks-build (forced: the "done" count)
4. [Show full thread titles in the brief](tickets/06-full-titles-build.md) (M14) — stacks on 05-short-brief-build
5. [Fit the brief row to a phone](tickets/07-phone-row-build.md) (M15) — stacks on 06-full-titles-build

The destination is reached when every route key is done and no map ticket is open.

## Stacks

- 03-answer-actions-build ← 04-action-marks-build ← 05-short-brief-build ← 06-full-titles-build ← 07-phone-row-build. Each key branches from the branch of the key before it. The stack starts on `main`.
- main ← better-brief-03-specific-answer-actions (#103) ← better-brief-04-mark-done-changed-actions (#104). GitHub stack #105.

## Notes

- Mode: autopilot
- **Stack gate.** A route key unblocks the next key in its chain when its draft PR opens. The next key stacks on its branch.
- **The stack stops for the user.** Each build session opens a draft PR and hands off to the next key. The user tests the stack with `bun run demo` and the real app, then merges it, bottom PR first. No auto-merge.
- **Rollback.** Each item merges as its own PR, so `git revert` removes it cleanly. No feature toggles.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs. Decision tickets come first; each decision ticket writes the `## Spec` of its build tickets when it closes.
- **No model for marks.** Done and changed come from the live tree in code. The refresh stays explicit ("Run again"). No background model calls, no stored digest, no model tools (closed maps `whats-next` and `brief-speed`).
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. Each key updates the spec line that it reverses, and `README.md` for its visible feature (see `CLAUDE.md`).
- **Source:** [the merged review](../improvements/research/03-merged-review.md) › M10, M11, M12, M14, M15 (file:line references at `5bf8567`; the brief code moved since, read the files). The order and the rules are in [Order the merged list](../improvements/tickets/04-order-and-group.md). M08 (last message on demand, #64) is merged: `GET /t3/last-message` and `tailOf` in `src/server/brief.ts`.
- **User profile.** The user runs many T3 Code threads at once and gets overwhelmed. Judge every choice against: less noise, a clear next step, low effort to re-enter a thread.
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01. `grilling` and `domain-modeling` for 02. `vercel:shadcn` for UI work. Write in ASD-STE100. Terms from `CONTEXT.md` (**Next-step brief**, **Action**, **Wait**, **Digest**).
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys). Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the five PRs are merged.
- **Mode:** autopilot. The five build keys run unattended as one stack of draft PRs, 11 ← 10 ← 12 ← 14 ← 15.
- **M11, both options:** a specific verb, the request kind and the **Wait** in the title (Sol); the first sentence of the last message as the reason (Opus); oldest Wait first inside a kind.
- **M10, live rules and a status snapshot:** code kinds (answer, fix, merge) are **done** by the Opus live-tree rules. Model kinds (review, clean-up, unblock) are **changed** when a linked thread's status differs from its status at brief time. Done and changed rows are muted and move to the end. The head says "N changed since HH:MM" with "Run again".
- **M12, three first and a fold:** the brief shows the first 3 open Actions with "Show all N". The panel also folds to its head ("10 Actions · 3 done"), and the fold state is saved.
- **Tickets:** one prototype for the brief row look (M11, M14, M15 and the marks), one grilling for the rules (M10, M12).
- **Terms:** **done** and **changed** go to `CONTEXT.md` as states of an **Action**. The rules ticket confirms them.

- [How does a brief row look, on desktop and phone?](tickets/01-brief-row-look.md): the thread title is the heading; kind, verb and Wait below; the reason is the last question of the last message (not the first sentence); marked rows go to the end under a "N done · N changed since HH:MM · Run again" bar; phone moves labelled buttons below.
- [When is an Action done or changed, and what does the short brief show?](tickets/02-done-and-short-rules.md): live rules per code kind; all linked threads gone = done for every kind; changed = any status change (model kinds) or a moved Wait (answer); done rows hide Send; first 3 open rows, marked rows always behind "Show all N"; fold open by default and saved; terms **Open**, **Done**, **Changed**.

## Not yet specified

None.

## Out of scope

- Writes to T3 (settle, snooze, approve). "Clean up: Settle …" Actions stay as text.
- A model call to mark Actions, or an automatic brief run.
- A read of `turn_items` for the command text of a request (M08 starts with the last message only).
