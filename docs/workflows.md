# Workflows setup

The repo holds general T3 Code workflows in `workflows/`. They need only T3, git and `gh`.

## Install

1. In T3 Code, turn on Settings › Labs › Workflows.
2. Clone the repo and run `bun install`.
3. In the main checkout, not in a worktree, run this command:

   ```sh
   bun run workflows:install
   ```

The command links `workflows/` as the subfolder `t3-thread-tree` of `~/.t3/workflows/` (or of `T3CODE_WORKFLOWS`). Then it writes one small top-level file per repo workflow, which T3 loads. It does not change your own files.

## Update

After a pull, run `bun run workflows:install` again. It adds new workflows and removes the files of deleted ones. Then restart the T3 server: T3 reloads only the top-level files, not the subfolder.

## Add your own steps

To add your own steps to a repo workflow, replace its top-level file with your own file. Import the repo workflow from `./t3-thread-tree/<name>.ts`, `invoke` it, and export both definitions. The command then writes no file for that workflow.
