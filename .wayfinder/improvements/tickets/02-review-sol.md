---
id: 02
title: Improvement review B (OpenAI Sol)
type: research
status: closed
assignee: sol-delegate
blocked_by: []
---

Run this ticket on **Codex `gpt-6.1-sol`**. Do not read `research/01-*`. The two reviews must be independent.

## Question

Which UX, UI and new-feature changes would help most an engineer who runs many T3 Code threads at once, gets overwhelmed, and uses this app to focus and pick what to continue next?

## Brief

Read `README.md`, `CONTEXT.md`, `SPEC.md`, `DESIGN-SPEC.md`, `src/page/`, `src/shared/` and `src/server/`. Skim the closed maps in `.wayfinder/*/map.md` to see what was decided and ruled out. The T3 Code source is at `~/repos/t3code`, if you need to know what data T3 has.

Use the app. Run `PORT=4776 bun run demo` and drive it in a browser: light and dark, desktop and phone width, every control (filters, folds, drag, details, "What's next", send dialog, View panel). Kill the server when done. The real app may run on port 4773: look only, never send a message or start a thread.

Report findings in three groups: **UX** (flow, friction, cognitive load), **UI** (visual, layout, legibility) and **New features**. For each finding give:

- What you saw (file:line or screen), and why it matters for this user.
- The change you propose.
- Impact (high / medium / low) and effort (S / M / L).

End with your top 5, ranked, with one line of reason each. Prefer fewer strong findings over many weak ones. Do not propose what a closed map ruled out unless you say why it should come back.

## Output

`.wayfinder/improvements/research/02-sol-review.md`, in ASD-STE100. Screenshots, if any, in `.wayfinder/improvements/research/02-sol/`. Do not change app code.

## Resolution

- Review: [research/02-sol-review.md](../research/02-sol-review.md), screenshots in [research/02-sol/](../research/02-sol/). Reviewed release 0.1.7 (`5bf8567`).
- Top 5: status phrase and wait time on the row; a local Now and Next list for a small working set; show three clear brief actions first; correct filter counts and status-group placement of nested threads; mark brief actions whose facts changed.
- Also proposed: a phone layout for the brief, and quick find with a keyboard path.
