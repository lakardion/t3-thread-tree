---
title: Compile the server into a sidecar binary
type: wayfinder:task
status: open
assignee:
blocked-by: [05-spec-and-route]
---

## Question

Make the Bun server compile into one `bun-darwin-arm64` binary that runs with no repo next to it.

## Spec

- Follow `SPEC.md` › "Desktop app" › "Build and dev" and "CI".
- `scripts/build-sidecar.ts` and `bun run build:sidecar`: `Bun.build({ compile })` of `src/server.ts` with the Tailwind plugin, into `dist/sidecar/server`.
- Pass the lineage worker as a string path, so the compiler bundles it. Import `next-step-prompt.md` as text, so it is in the binary. `bun start` and `bun run demo` still work.
- Add `dist/` and `release/` to `.gitignore`.
- CI: one more step, `bun run build:sidecar`, on ubuntu.

## Done when

`bun run check` passes. CI compiles the sidecar. On the Mac, `PORT=4790 dist/sidecar/server` started from `/tmp` serves the styled page, connects to T3, and a "What's next" run reads the prompt (no file read error).
