---
id: 01
title: Improvement review A (Claude Opus)
type: research
status: closed
assignee: opus-agent
blocked_by: []
---

Run this ticket on **Claude Opus**. Do not read `research/02-*`. The two reviews must be independent.

## Question

Which UX, UI and new-feature changes would help most an engineer who runs many T3 Code threads at once, gets overwhelmed, and uses this app to focus and pick what to continue next?

## Brief

Read `README.md`, `CONTEXT.md`, `SPEC.md`, `DESIGN-SPEC.md`, `src/page/`, `src/shared/` and `src/server/`. Skim the closed maps in `.wayfinder/*/map.md` to see what was decided and ruled out. The T3 Code source is at `~/repos/t3code`, if you need to know what data T3 has.

Use the app. Run `PORT=4775 bun run demo` and drive it in a browser (Playwright tools): light and dark, desktop and phone width, every control (filters, folds, drag, details, "What's next", send dialog, View panel). Kill the server when done. The real app may run on port 4773: look only, never send a message or start a thread.

Report findings in three groups: **UX** (flow, friction, cognitive load), **UI** (visual, layout, legibility) and **New features**. For each finding give:

- What you saw (file:line or screen), and why it matters for this user.
- The change you propose.
- Impact (high / medium / low) and effort (S / M / L).

End with your top 5, ranked, with one line of reason each. Prefer fewer strong findings over many weak ones. Do not propose what a closed map ruled out unless you say why it should come back.

## Output

`.wayfinder/improvements/research/01-opus-review.md`, in ASD-STE100. Screenshots, if any, in `.wayfinder/improvements/research/01-opus/`. Do not change app code.

## Resolution

- Review: [research/01-opus-review.md](../research/01-opus-review.md), screenshots in [research/01-opus/](../research/01-opus/). Reviewed release 0.1.7 (`5bf8567`).
- Top 5: wait time and status phrase on rows that need you, oldest wait first; an "Open next" key and menu-bar item; last agent message on demand in details and the send dialog; fix "Group by status" placement of subthreads and PR stacks; fold calm sections and hide snoozed rows.
- Also found: a filtered PR stack shows a wrong position number ("1 · #2102" for position 2 of 4).
