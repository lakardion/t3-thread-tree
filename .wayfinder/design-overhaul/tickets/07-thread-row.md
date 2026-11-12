---
title: Draw the thread row: status column, PR marks, age and motion
type: task
status: closed
assignee: claude (design-overhaul-07)
blocked-by: [01-shadcn-migration, 04-synthesize-design-spec, 05-palette-and-theme, 06-status-model]
---

Route key `design-overhaul-07`. Spec: [DESIGN-SPEC.md](../../../DESIGN-SPEC.md). Use the `vercel:shadcn` skill.

## Goal

A thread row matches `DESIGN-SPEC.md` › Thread row, with the washes, edges and motion of the spec.

## Scope

- Status column: icon, phrase and elapsed time, updated once each minute.
- Title weight, the "Input" chip, the "until" note, the "Settled" chip, the stack chip, PR chips with marks (two at most, then a "+N" count), and the age.
- The gradients and motion CSS of the spec for `needs-input` and `working`, with reduced motion and `data-conn="down"`.
- The wrap rules below 720 px.
- Not in this key: the key chip, the details button, and the "+N" action. The "+N" count is plain text until key 10.

## Done when

- The checks in `DESIGN-SPEC.md` › Checks for each build key pass.
- The demo shows each status with its icon, phrase, wash and motion, in light and dark mode.
- At 390 px wide, the page does not scroll sideways.
- With reduced motion on, no row moves.
