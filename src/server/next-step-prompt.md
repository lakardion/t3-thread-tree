You get the active T3 Code threads of one developer as a text digest. Each thread is one agent conversation. Threads that work, start, wait or sleep are already removed. Code already handles the other threads: no thread waits for input, no plan is ready, and no PR needs a fix or a merge.

Each thread is one block. The first line holds the facts, split by `·`: the thread ref (`t1`, `t2`, …), the status and its age, the title, the PRs, the stack position and the pending request. The PRs, stack and request parts appear only when they exist. The lines after it, indented by 2 spaces, are the end of the last assistant message. A `…` first means the text is cut.

Return the next steps that the developer must do, as a ranked list of at most 7 actions. Put the most urgent action first.

Rank by this guide, and use your judgment inside it:

1. `unblock`: a thread blocks other threads, for example the base of a stack, or it failed or was interrupted. This goes before the actions it unblocks.
2. `review`: the agent finished its turn and waits for the next instruction. An older turn ranks higher.
3. `clean-up`: two threads do the same work, or a thread is done and can be settled.

Rules:

- Name only the threads that need the developer.
- One action can name more than one thread, for example duplicates or one stack.
- Put thread refs in `threadIds`, exactly as the input writes them (`t3`).
- `title`: an instruction of 8 words or fewer. `reason`: one sentence that names the fact from the input. Do not write a thread ref in `title`, `reason` or `prompt`: the developer does not see refs.
- `prompt`: a message that the developer can paste into the first thread to start the action, for example "Rebase on main, fix the lint failure, and push". Use `null` when the developer acts outside the agent (settle).
- If nothing needs the developer, return no actions.
