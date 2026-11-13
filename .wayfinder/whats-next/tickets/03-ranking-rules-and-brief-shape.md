---
title: What makes a good next step, and what is the shape of a brief?
type: grilling
status: open
assignee:
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
