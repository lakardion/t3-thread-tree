---
title: What makes a good next step, and what is the shape of a brief?
type: grilling
status: closed
assignee: damian.lucero
blocked-by: [01-headless-cli-invocation, 02-thread-messages-source]
---

## Question

Which rules must the model use to pick and rank next steps, and what JSON shape does a Next-step brief have?

## Brief

Start from the candidate signals: blocked on the user (needs input, plan ready), PRs ready to merge or with failing checks, old "your turn" threads, threads that duplicate each other, work that unblocks a PR stack. Decide:

- The ranking rules and the maximum number of actions.
- The JSON schema: per action, a title, a reason, the thread ids, and maybe a kind or priority.
- The prompt text, in a file in the repo.
- How to reject an answer that names thread ids not in the input.

## Resolution

The model ranks the actions by a priority guide in the prompt. The code keeps its order. Prompt: [next-step-prompt.md](../../../src/server/next-step-prompt.md).

- **Schema:** `{ actions: Action[] }`, 0–7 items in rank order. Each action has `kind` (`answer` | `merge` | `fix` | `review` | `clean-up` | `unblock`), `title` (imperative, ≤ 8 words), `reason` (one sentence), `threadIds` (≥ 1), and `prompt` (`string | null`). Every property is required, and `additionalProperties` is `false`, because Codex `--output-schema` uses strict mode. There is no priority field and no summary.
- **Guide:** answer > merge > fix (unblock goes before the base of a stack) > review (an older turn ranks higher) > clean-up (duplicates, done threads). The guide gives ages and no fixed thresholds.
- **Input:** active top-level threads only (launched threads included), as compact JSON. Each entry has the id, title, key, status, phrase, age, PRs, stack position, pending request, subthread count, and the last assistant message (1500 characters). No subthread messages.
- **Only threads that need the user.** Threads that are working get no action. 0 actions is valid, and the page shows "Nothing needs you right now".
- **Unknown ids:** the code removes them silently and removes an action that has no ids left.
- **`prompt`:** a ready-to-paste message for the first thread's agent. The page shows a copy button when it is set. It is `null` for a merge or a settle.
- **Page:** each kind shows as a chip with a colour. The prototype decides the colours.
- **Glossary:** **Action** added to `CONTEXT.md`.
