# Workflows

General T3 Code workflows. They need only T3, git and `gh`.

- One workflow per file. Name the file with letters, digits, `-`, `_` and `.`, and end it in `.ts`.
- Export the definition: `export default workflow("name", …)`. The entry file that `bun run workflows:install` writes re-exports it.
- After an edit to a file here, restart the T3 server. T3 does not watch this folder.
- A top-level file holds only its `workflow(...)` call. Put options, bodies and shared code in `lib/`. T3 registers every `workflow(...)` call made while a file loads, imports included.
