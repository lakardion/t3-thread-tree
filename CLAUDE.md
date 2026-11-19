# CLAUDE.md

## Keep the README current

When a change adds or changes a feature that the user sees, update `README.md` in the same change. Describe what the feature does for the user, in the "What you get" list, and update Requirements, Setup, Run or "How it works" if they change.

- Do this for features that improve the user experience: a new control, view, mark or behavior on the page, or a new setup option.
- Do not do this for bug fixes, patches, refactors, performance work with no visible change, or tooling.
- Write in ASD-STE100 Simplified Technical English, like the rest of the README.

## Planning docs and wayfinder maps

Wayfinder maps, research and issue notes for this repo live in the wiki, not in the repo. Read `~/repos/wiki/AGENTS.md` first.

- **Maps:** `~/repos/wiki/t3-thread-tree/issues/<map>/` (`map.md`, `tickets/`, `research/`, `assets/`). The tracker rules are in `~/repos/wiki/t3-thread-tree/wayfinder-tracker.md`.
- **Index:** `~/repos/wiki/t3-thread-tree/INDEX.md` lists every map and doc.
- **No wiki:** if `~/repos/wiki` does not exist, use the local-markdown tracker in `.wayfinder/` at the repo root.
- `SPEC.md`, `DESIGN-SPEC.md` and `CONTEXT.md` stay in the repo. Update them in the same change as the code.
