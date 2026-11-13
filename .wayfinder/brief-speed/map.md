---
label: wayfinder:map
status: closed
created: 2026-11-13
---

# Map: Faster Next-step brief, execution

Resume with `/wayfinder-implement .wayfinder/brief-speed/map.md`. Run `/wayfinder-implement .wayfinder/brief-speed/map.md <ticket>` after a PR opens or merges.

## Destination

A click on "What's next" shows the rule-based actions at once, made by code with no model. The model gets only a compact text digest of the threads that need judgment, and it does not run when no such thread is left. A measured run is faster than the `main` baseline. Every route key is merged to `main`. Autopilot threads build it.

## Route

Source: markdown tickets in `tickets/`. All keys touch `src/server/brief.ts` or its state, so they form one chain.

### Lane 1

1. [Build the compact digest input](tickets/05-compact-digest.md)
2. [Rank the obvious actions in code and skip the model when it has nothing to judge](tickets/06-code-ranked-actions-build.md)
3. [Show the code actions while the model runs](tickets/07-code-actions-on-page.md)

The destination is reached when every route key is done and no map ticket is open.

## Stacks

## Notes

- Mode: autopilot
- **Run to completion.** Do not stop for the user, except for a real decision that the tickets and the spec do not answer. Then stop and ask (grilling). A choice the spec leaves open but that has a clear default is not a stop: take the default and name it in the PR body.
- **Auto-merge when green.** When `bun test` and `bun run typecheck` pass, mark the PR ready and merge it to `main` (squash). The next key in the chain then rebases on `main`. A failing check is a stop only after you cannot fix it.
- **Fog graduates by itself.** When the second route key's measurement shows that a CLI flag or a model setting cuts the fixed cost, add it as a route key at the end of Lane 1 and continue.
- **Execution lives in this map** (override of plan, don't do): route keys deliver code and PRs.
- **Main goal is latency.** Rank every choice by the wait the user sees after a click.
- **Spec:** each route ticket, then `SPEC.md` › What's next and `CONTEXT.md`. A ticket wins over the spec; each key updates the spec for its own part.
- **Skills:** `vercel:shadcn` for UI work. Write in ASD-STE100.
- **Check every change** with `bun test` and `bun run typecheck`, and every UI change with `bun run demo` in light and dark mode.

## Decisions so far

<!-- one line per closed map ticket -->

- [What does a thread digest hold, and when does it update?](tickets/02-digest-shape.md): no store, built on each click; working, starting, waiting and snoozed threads removed; one text line per thread plus the last 600 characters of the last message.
- [Which actions does code make, and how do they join the model's actions?](tickets/03-code-ranked-actions.md): code makes `answer`, `fix` and `merge`; the model gets only the other threads that need the user, and does not run when none are left; the page shows code actions first, at once.
- [Where does a brief run spend its time?](tickets/01-measure-brief-run.md): folded into the second route key, which measures before and after its change.
- [Write the digest and code-ranked actions into SPEC.md](tickets/04-spec-section.md): folded into the route keys; each updates its part of the spec.

- [Build the compact digest input](tickets/05-compact-digest.md): text digest with short refs (`t1`, `t2`, …) in place of thread ids, because Haiku changed long ids; PR #5.
- [Rank the obvious actions in code and skip the model when it has nothing to judge](tickets/06-code-ranked-actions-build.md): code makes `answer`, `fix`, `merge`; claude median 26.9 s → 18.2 s, codex unchanged (fixed CLI cost); PR #7.
- [Show the code actions while the model runs](tickets/07-code-actions-on-page.md): the panel shows code actions at once, model actions below when the run ends; PR #8.

Decided at charting (by the user): latency is the main problem; memory is code-built only, no background model calls, in memory only; code removes the threads that need no action before the model runs.

## Not yet specified

<!-- empty: destination reached -->

## Out of scope

- A model-written summary per thread, kept in the background.
- A stored digest cache, in memory or on disk.
- Run the brief before the click, in the background.
- Smaller or streamed model output, as a separate lever.
- CLI start-up tuning (flags, reasoning effort). The measurement did not test it. Codex time is mostly fixed CLI cost, so this is the next lever, as a fresh effort.
