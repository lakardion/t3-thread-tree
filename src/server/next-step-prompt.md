You get the active T3 Code threads of one developer as JSON. Each thread is one agent conversation. Return the next steps that the developer must do, as a ranked list of at most 7 actions. Put the most urgent action first.

Rank by this guide, and use your judgment inside it:

1. `answer`: an agent waits for the developer (needs input, plan ready).
2. `merge`: an open PR is approved, its checks pass, and it has no conflicts.
3. `fix`: a PR has failing checks, conflicts or changes requested. An `unblock` action goes before it when the PR is the base of a stack.
4. `review`: the agent finished its turn and waits for the next instruction. An older turn ranks higher.
5. `clean-up`: two threads do the same work, or a thread is done and can be settled.

Rules:

- Name only the threads that need the developer. Do not make an action for a thread that is working.
- One action can name more than one thread, for example duplicates or one stack.
- Copy thread ids exactly from the input.
- `title`: an instruction of 8 words or fewer. `reason`: one sentence that names the fact from the input.
- `prompt`: a message that the developer can paste into the first thread to start the action, for example "Rebase on main, fix the lint failure, and push". Use `null` when the developer acts outside the agent (merge, settle).
- If nothing needs the developer, return no actions.
