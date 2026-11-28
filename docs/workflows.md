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

After a pull, run `bun run workflows:install` again. It adds new workflows and removes the files of deleted ones. Then restart the T3 server: T3 reloads only the top-level files, not the subfolder. This holds for `t3-thread-tree/lib/` too.

## Add your own steps

To add your own steps to a repo workflow, replace its top-level file with your own file. Import the repo workflow from `./t3-thread-tree/<name>.ts`, `invoke` it, and export both definitions. The command then writes no file for that workflow.

## Change the time of a workflow

The morning catch-up workflow runs at 09:00 on weekdays. To change the time, write your own top-level file `morning-catch-up.ts`. Import the options and the body from `./t3-thread-tree/lib/morning-catch-up.ts` and set your own trigger:

```ts
import { body, options } from "./t3-thread-tree/lib/morning-catch-up.ts";

const { workflow, daily } = T3;

export default workflow(
  "morning-catch-up",
  { ...options, triggers: [daily("07:30", { weekdays: [1, 2, 3, 4, 5] })] },
  body,
);
```

The install command then keeps your file and writes no entry for this workflow. Restart the T3 server after you edit it.
