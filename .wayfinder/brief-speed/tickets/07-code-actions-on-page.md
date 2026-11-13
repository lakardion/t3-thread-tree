---
title: Show the code actions while the model runs
type: wayfinder:task
status: open
assignee: claude
blocked-by: [06-code-ranked-actions-build]
---

## Question

Show the code actions in the brief panel at once, while the model runs, and add the model actions below them when the run ends.

## Spec

Decisions: [Which actions does code make, and how do they join the model's actions?](03-code-ranked-actions.md).

- `src/page/brief.tsx`: in the `running` state, show the code actions in the usual action rows, and below them the loading text ("Reading N threads…") with "Cancel". With no code actions, show the loading state as today.
- In `done`, the rows run on in one rank order (code actions first). In `failed`, show the code actions and the error below them.
- When the model did not run, the stamp says so (for example "generated HH:MM · rules only").
- Use the existing shadcn parts and the action row. Load `vercel:shadcn`.
- Update `SPEC.md` › What's next › Page.

## Done when

`bun test` and `bun run typecheck` pass. `bun run demo` shows the running, done, failed and rules-only states in light and dark mode.

## Handed over from brief-speed-06

- **State.** `running` and `failed` now carry `actions` and `titles`: the code actions. `done` holds the code actions first, then the model actions. `threadCount` in `running` counts only the threads that go to the model.
- **Rules only.** When no thread is left for the model, the service sets `done` at once and never sends `running`. That `done` has no marker. Add a field if the stamp must say "rules only".
- **Kinds.** Code makes `answer`, `fix` and `merge`. The model makes only `review`, `clean-up` and `unblock`, and `filterAnswer` drops other kinds.
- **Demo.** The demo tree gives the code actions. `SAMPLE` in `scripts/demo.ts` now holds only the model actions.
- **Measure.** The claude median went from 26.9 s to 18.2 s. Codex did not change much (23.7 s to 26.7 s, noisy). The map's CLI start-up tuning fog stays: this measurement did not test a flag.
