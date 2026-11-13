---
title: How do we run claude and codex headless, with no tools, on a cheap model?
type: research
status: closed
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

## Resolution

Both CLIs return schema JSON with their tools off, in real runs. Findings and tested commands: [01-headless-cli.md](../research/01-headless-cli.md) on branch `research/headless-cli`.

- **Claude:** `claude -p --model haiku --effort medium --tools "" --system-prompt … --output-format json --json-schema … --no-session-persistence --strict-mcp-config --setting-sources "" --disable-slash-commands`, prompt on stdin. The answer is in `structured_output`. Check `is_error` and the exit code. Do not use `--bare`: it ignores the OAuth login.
- **Codex:** `codex exec --model gpt-6-luna -c model_reasoning_effort=medium --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check -s read-only -C <empty dir> --disable shell_tool --disable unified_exec … --output-schema <file> --json -`. The answer is the last `item.completed` `agent_message`. A failure gives `turn.failed` and exit 1.
- **Models:** `claude-haiku-5-5` (alias `haiku`) and `gpt-6-luna`.
- **Detection:** `claude auth status` and `codex login status`. Exit 0 means logged in. Free and under 0.2 s.
- **Cancel:** SIGTERM stops both cleanly. **Time:** 9–11 s for a 20 KB prompt; use a 60 s timeout.
- **Side effects:** no sessions or history, nothing in T3.
- **Open:** not proven that `--ignore-user-config` skips a global `~/.codex/AGENTS.md`.
