---
label: wayfinder:map
status: open
created: 2026-11-13
---

# Map: "What's next" button and Next-step brief

Resume with `/wayfinder .wayfinder/whats-next/map.md`.

## Destination

The thread tree page has a "What's next" button. A click runs a local agent CLI on a cheap model. The CLI returns a **Next-step brief**: a ranked list of actions over the active threads, each with links to its threads. The feature is merged to local `main`.

## Notes

- **Execution lives in this map** (override of plan, don't do): after the decision tickets close, build tickets deliver the code.
- **Source:** markdown tickets in `tickets/`. The repo has no remote, so commit only after a ticket write. Do not pull or push.
- **Spec:** `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md` (term: Next-step brief). The feature section goes into `SPEC.md` when the decision tickets close.
- **Skills:** `grilling` + `domain-modeling` for grilling tickets, `prototype` for 04, `research` for research tickets, `vercel:shadcn` for UI build. Write in ASD-STE100.
- **Check every UI key** with `bun run demo` in light and dark mode, plus `bun test` and `bun run typecheck`.

## Decisions so far

<!-- one line per closed map ticket -->

- [How do we run claude and codex headless, with no tools, on a cheap model?](tickets/01-headless-cli-invocation.md): `claude -p` (`haiku`) and `codex exec` (`gpt-6-luna`) with tools off and a JSON schema; detect with `auth status` / `login status`; SIGTERM cancels; about 10 s per run.

- [Where does the backend read the last assistant message of a thread?](tickets/02-thread-messages-source.md): from `statev2.sqlite` with one batched query (the stream field is always null). Cap each message at 1500 characters, head and tail.

Decided at charting (by the user):

- **Model route:** the backend runs a local agent CLI as a subprocess (`claude -p`, `codex exec`). It uses the existing logins, needs no API key, and writes nothing to T3. The app stays read-only.
- **Model choice:** the backend detects the installed CLIs. A dropdown next to the button picks one, saved in `localStorage`. Use cheap models: Claude Haiku at medium effort, and OpenAI Luna at medium effort.
- **No tools:** one prompt in, one answer out. The CLI runs with its tools off.
- **Input:** active threads only, whatever the settled toggle shows. Each thread gives its tree data (title, status, phrase, PRs, checks, review, pending request, age) plus its last assistant message.
- **Trigger:** only on a click. No automatic refresh. One run at a time.
- **Lifetime:** the backend keeps the last brief in memory. A page reload keeps it, and a server restart loses it. The brief shows a "generated HH:MM" stamp.
- **Stale links:** each thread link in the brief shows the thread's current status from the live tree. A thread that is no longer active shows struck through. The brief text does not change.
- **While it runs:** a loading text with a font animation, and a "Cancel" control that kills the subprocess. A failure shows an inline error with the stderr tail.

## Not yet specified

- **Build slicing:** backend run endpoint (spawn, cancel, parse, keep the last brief), CLI detection, page button + dropdown + brief view. Graduates into build tickets when 03 and 04 close.
- **SPEC.md section** for the feature, written from the closed tickets.

## Out of scope

- Write actions in T3, as in `SPEC.md`. The brief only links to threads.
- Giving the model tools (repo reads, `gh`).
- Automatic or scheduled briefs.
