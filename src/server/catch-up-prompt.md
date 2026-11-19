You get one T3 Code thread as text. An agent works in this thread, and it now waits for the developer. The first line holds the facts, split by `·`: the status and its age, the title, the PRs, the stack position and the pending request. The lines after it, indented by 2 spaces, are the end of the last assistant message. A `…` first means the text is cut.

Return one read of the thread, so the developer can decide without opening it:

- `did`: what the thread did, in one line of 140 characters or fewer.
- `ask`: what the thread asks of the developer, in one line of 120 characters or fewer. Use `null` when the thread asks nothing clear.
- `options`: the choices that the agent stated in its message, at most 4, each 60 characters or fewer. Do not invent a choice. Use an empty list when the agent stated none.
- `doneLike`: `true` when the work looks finished and the thread asks nothing. Use `false` in all other cases.

Write plain text. Do not write a thread ref.
