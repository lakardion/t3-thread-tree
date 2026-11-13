---
title: How do we run claude and codex headless, with no tools, on a cheap model?
type: research
status: open
assignee:
blocked-by: []
---

## Question

How does the backend run `claude` and `codex` as one-shot subprocesses that read a prompt and return structured JSON, with their tools off, on a chosen model and effort?

## Brief

Answer from primary sources (the CLIs' `--help`, official docs, and a real run on this machine):

1. **Invocation.** The command and flags for a non-interactive run of each CLI: prompt from stdin, model, reasoning effort, tools off, no session saved, no project config or MCP servers loaded.
2. **Structured output.** How to get JSON that matches a schema (for example `--output-format json`, `--json-schema`, `--output-schema`), and the shape of the output envelope.
3. **Models.** The exact model ids and effort flags for "Claude Haiku, medium effort" and "OpenAI Luna, medium effort". Say if `claude` has an effort flag for Haiku.
4. **Detection.** How the backend finds out if a CLI is installed and logged in, without a paid call if possible.
5. **Cancel and timeouts.** Does a SIGTERM to the process stop it cleanly? Typical wall time for a ~20 KB prompt.
6. **Side effects.** Does a run write anything (session files, T3 threads, history)? How to turn that off.

## Output

`.wayfinder/whats-next/research/01-headless-cli.md` on branch `research/headless-cli`, with a tested command line for each CLI.
