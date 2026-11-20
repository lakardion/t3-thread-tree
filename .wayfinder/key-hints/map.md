---
label: wayfinder:map
status: open
created: 2026-11-20
---

# Map: Key hints

Resume the decision tickets with `/wayfinder .wayfinder/key-hints/map.md`. Resume the route key with `/wayfinder-implement .wayfinder/key-hints/map.md`.

## Destination

The user sees which key does what where it matters, without more noise. Soft **Key hints** show the key symbols where a key acts: the Find dialog (↵ opens, ⇧↵ shows in tree), the header buttons, the focused row and the Focus slots. A "Show key hints" switch in the View group of Settings hides them. One draft PR is merged to `main`.

## Route

Source: markdown tickets in `tickets/`.

### Lane 1

1. [Add key hints and the "Show key hints" switch](tickets/02-key-hints-build.md) — [the key hints look](tickets/01-key-hints-look.md) is closed and the reach-a-thread stack (#89 ← #91) is merged, so it is ready

The destination is reached when the route key is done and no map ticket is open.

## Stacks

- `main` ← key-hints-02-add-key-hints. One PR. It starts on `main` after the reach-a-thread stack (Find #89 ← row keys #91) merges, because the hints name the keys that this stack adds.

## Notes

- Mode: autopilot for the build key. The look ticket is HITL.
- **Merge gate.** The build starts only after #89 and #91 merge to `main`. The look ticket runs now; its prototype may branch from `reach-a-thread-06-add-row-keys` to show the real keys.
- **The PR stops for the user.** The build session opens a draft PR. The user tests it with `bun run demo` and the real app, then merges it. No auto-merge.
- **Rollback.** One PR, so `git revert` removes it. No feature toggle beyond the user switch.
- **Execution lives in this map** (override of plan, don't do): the route key delivers code and a PR. The look ticket writes the `## Spec` of the build ticket when it closes.
- **The keys are owned by** [the page keys](../reach-a-thread/tickets/03-page-keys.md). This map adds no key and changes no key behavior, except a hold key that only reveals hints, if the look ticket picks one.
- **User profile.** The user runs many T3 Code threads at once and gets overwhelmed. Judge every hint against "less noise": a hint that does not teach a hard-to-find key does not show.
- **Spec:** each route ticket, then `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md`. A ticket wins over the spec. The build updates `README.md` (see `CLAUDE.md`).
- **Look at the app:** `bun run demo`, light and dark, desktop and phone width. The real app may run on `4773`: look only, never send a message or start a thread.
- **Skills:** `prototype` for 01. `vercel:shadcn` for UI work (shadcn has a `Kbd` component). Write in ASD-STE100. Terms from `CONTEXT.md` (**Key hint**, **Find**, **Focus list**).
- **Check every change** with `bun run check`, and every UI change with `bun run demo` in light and dark mode.
- Tickets use the frontmatter of the `brief-speed` map (`blocked-by` with file stems, `wayfinder:task` for route keys). Commit after a ticket write.

## Decisions so far

<!-- one line per closed map ticket -->

Decided at charting (by the user):

- **Destination:** decide, then build. The map ends when the PR is merged.
- **Base:** wait for the reach-a-thread stack (#89 ← #91) to merge; the build starts on `main`.
- **Default:** key hints are on by default. The switch turns them off.
- **Switch scope:** the switch hides the in-page key hints only. The tooltips that name keys and the Keys legend in Settings stay.
- **Surfaces to judge:** the Find dialog, the header buttons (Find, Open next), the focused row (`o`, `s`), the Focus slots (`1`–`3`). The look ticket may drop any of them.
- **Hold to reveal:** the look ticket compares always-on soft hints, hints shown while the user holds Alt/Option, and both. If a hold key is used, it is Alt/Option, not Cmd/Ctrl (no clash with Cmd/Ctrl+K).
- **One build PR.**
- **Key cap:** the shadcn `Kbd` component (`bunx shadcn add kbd`, one file in `src/components/ui/`, no new package). The Keys legend in Settings moves to `Kbd` too, so every key looks the same. No key cap library.
- **Term:** **Key hint** in `CONTEXT.md`. Switch label "Show key hints".

- [How do the key hints look, and when do they show?](tickets/01-key-hints-look.md): hold Alt/Option only (nothing always on); hints float, no layout shift; Find gets a footer bar; header `n`/`t`, focused row `o`/`s`, slots `1`–`3`, all on hold; the switch off also stops the hold.

## Not yet specified

Nothing at charting. The look ticket may surface more.

## Out of scope

- New page keys or changes to what a key does. [The page keys](../reach-a-thread/tickets/03-page-keys.md) own them.
- Changes to the tooltips, and to which keys the Keys legend in Settings lists. Only the legend's key cap look changes.
