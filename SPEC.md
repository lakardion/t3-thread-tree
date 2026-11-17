# T3 thread tree: build spec

A local webapp, also packaged as a macOS desktop app. It shows the active T3 Code threads as one live tree: Project › issue key › thread. Each node shows its status and its PR stack. A click on a node opens the thread in T3 Code. The app writes to T3 only through a send or a start that the user confirms.

Terms are defined in [CONTEXT.md](CONTEXT.md). Each section links the ticket that holds the full decision and its reasons. When this spec and a ticket do not agree, this spec wins: it includes the later changes.

## Scope

- In scope: the threads of the local T3 environment (`~/.t3/userdata`), live updates, "open in T3", and a send of a message to one thread and a start of a thread in a project, through the `t3` CLI.
- In scope, desktop: a macOS (Apple Silicon) app with its own window, a Dock badge, notifications and a menu-bar entry (see "Desktop app").
- Out of scope: settle, snooze, interrupt, approve or deny a request, archive; a send to several threads at once; threads from linked T3 environments on other machines; any change to T3 Code itself; launch at login; Windows, Linux and Intel Mac builds; Developer ID signing and notarization.

## Runtime and stack

Source: [How does the standalone app run, and on which stack?](.wayfinder/tickets/006-runtime-and-stack.md), research on branch `research/frontend-framework`.

- **Start:** one command, `bun start`, in the repo. It serves the page and the API on `http://127.0.0.1:4773`. The page uses relative URLs. The app stops when the terminal closes.
- **Backend:** Bun 1.3 and TypeScript, with no framework.
  - `Bun.serve` serves the page (HTML import) and `GET /events` (SSE).
  - The Bun WebSocket client holds the T3 shell stream.
  - `bun:sqlite` reads `statev2.sqlite` in read-only mode for the launched-thread lineage.
- **Frontend:** React 19, Tailwind v4 (`bun-plugin-tailwind` through `bunfig.toml`) and shadcn components (Radix), built by Bun HTML imports. No Vite. `tsc --strict` checks the types.
- **Shared type:** one `Tree` type in a shared module. The backend and the page both import it.

## Data source

Source: [How can a local process read T3 thread data live?](.wayfinder/tickets/001-data-source-for-local-reader.md), research on branch `research/data-source`.

1. Read `~/.t3/userdata/server-runtime.json` to get `origin` (the port can change at each T3 start). Read `~/.t3/userdata/environment-id` to get the environment id for the deep links.
2. Open `ws://127.0.0.1:<port>/ws?orchestrationProtocol=2` with the header `Authorization: Bearer <token>`.
3. Call `orchestration.subscribeShell` with `omitIdleSubagents` and `omitOlderSettled` off. The protocol is Effect RPC with JSON frames. Write the small frame handler by hand; the T3 packages are private.
4. Stream items:
   - `snapshot` holds `projects`, `threads` and `archivedThreads`. Only the first `snapshot` of a connection is the full state. Later `snapshot` items (with `resolvedRepositoryIdentityRoots`) carry project metadata and empty thread lists; merge their projects and do not clear the thread map.
   - `thread.updated` holds the full thread, not a patch.
   - `thread.removed`, `project.updated` and `project.removed` also arrive.
5. Ignore archived threads (`archivedThreads`, and items with `location: "archive"`). The app never shows them.
6. Decode leniently: the protocol is internal to T3, and many fields are optional. Keep the stream code in one module, so a protocol change breaks only that module.

### Token

- The user issues the token once with `~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only`.
- The user pastes it in the "T3 token" password field of the "View" panel. The page sends `POST /token` with `{"token": "…"}` (JSON only, so a cross-site form cannot send it). The server checks it (one line, at most 4096 bytes), writes it to the token file (mode `0600`), drops the open socket and connects again. The user can replace it at any time.
- **Token file:** `T3_TOKEN_FILE`, else `~/.config/t3-thread-tree/token`. When the file holds no token, `T3_TOKEN` from the env is the fallback.
- With no token, the tree `conn` is `no-token`. If T3 rejects the token (HTTP 401), it is `unauthorized`. Both banners link to the token field.

### T3 not running, or restarted

- The backend starts even when T3 is not running.
- Every 3 s, it reads `server-runtime.json` again and tries to connect.
- While T3 is down, the page keeps the last tree, greyed, with the banner "T3 not running: last update HH:MM".
- Each new connection takes a fresh snapshot, and its first `snapshot` item replaces the whole thread map. Do not use `afterSequence`.

## Launched-thread lineage

Source: [Can the spawner of a launched thread be recovered?](.wayfinder/tickets/002-recover-launched-lineage.md), [Standalone webapp or a view inside T3 Code?](.wayfinder/tickets/003-standalone-or-in-t3.md), research on branch `research/launched-lineage`.

A thread that an agent starts with `t3_thread_launch`, `create_threads` or `delegate_task` has no native parent. Its **spawner** is found in `statev2.sqlite`:

1. **First:** `senderThreadId` on the thread's first user message in `orchestration_v2_projection_messages` (`message_id = thread_id` for a launch). This is a primary-key lookup. When both sources exist, they agree.
2. **Full scan:** the caller's `dynamic_tool` row in `orchestration_v2_projection_turn_items` with `status = 'completed'`, where `toolName` ends in `t3_thread_launch`, `create_threads` or `delegate_task`. Parse `payload_json.output.content` as JSON. The new id is in `threadId`, `threads[].threadId` or `childThreadId`. The row's `thread_id` is the spawner. Do not match the child id as a substring.

Run the lookup when the backend first sees a top-level thread whose id contains `mcp:` or `mcp%3A` (`t3_thread_launch` gives `mcp:…`, `create_threads` gives `thread:mcp:…`, `delegate_task` gives `thread:delegated-task:command%3Amcp%3A…`), in the snapshot or in `thread.updated`. Cache the result in memory. A thread that arrives before its first message is written gets a short retry. The full scan reads every launch tool call (seconds on a cold disk, no index), so it runs in a Worker, and only when a thread with no sender message is on a requested view: an active thread or its spawner chain, or any thread once a client asks for the settled view. Keep the SQLite code in one module.

## Tree rules

Source: [Tree model rules for the nested tree](.wayfinder/tickets/004-tree-model-rules.md), changed by [Rough tree UI on a real snapshot](.wayfinder/tickets/005-rough-tree-ui.md).

A **top-level thread** has no native `parentThreadId`. A **subagent** has `relationshipToParent: subagent`. The backend applies these rules and builds the whole tree.

1. **Visible.** A top-level, non-archived thread is visible when `settledAt` is null, whatever its status. No recency window applies. With the settled toggle on, settled top-level threads are visible too.
2. **Subagents are not shown.** The tree holds top-level threads only. It shows no subagent rows, counts or signals.
3. **Snoozed** threads stay visible. They are shown muted, with their wake time.
4. **Issue key:** the first match of `/\b[A-Z][A-Z0-9]+-\d+\b/` in the title of a top-level thread. `Review #15708 JED-4319` gives `JED-4319`.
5. **Visible spawner:** start at the thread's spawner and go up the spawner chain. Skip threads that are not visible, and stop at the first visible one. If no thread in the chain is visible, the thread has no visible spawner.
6. **Placement.** A thread is always placed in its own `projectId`. Apply the first rule that matches:
   1. A title that starts with `Review #` goes under `Project › Reviews › <key>`, or `Project › Reviews › No issue key` if it has no key.
   2. A keyed thread goes under `Project › <key>`.
   3. A keyless thread in a PR stack goes under `Project › PR stack #<n>`, where `<n>` is the bottom PR of the stack. All keyless threads of one stack share this group, and it gets the stack rail. A stack outranks the spawner.
   4. A keyless thread with a visible spawner in the same project nests under that spawner.
   5. Any other keyless thread goes under `Project › No issue key`.
7. **Launcher threads** get no special rule.
8. **PR stack:** it adds no level to the tree. Each thread in a stack shows a badge with its position, for example `⧉ 3/6`. Key groups and the stack group in one project that share a stack sit next to each other, in stack order. A group with no PR of its own in the stack goes after the others.
   - Stack membership: the thread's open PRs with `source` `created`, `stack` or `agent`.
   - Stack order: as computed by `build.py` on branch `prototype/005-tree-ui`.
9. **Order:**
   - Projects are sorted by their oldest thread, oldest first.
   - In a project: issue-key groups (by their oldest thread, oldest first, with stack mates kept together at the slot of the oldest member), then Reviews, then No issue key.
   - Threads and nested threads are sorted by `createdAt`, oldest first. A tie goes to the thread id.
   - A new item goes at the end of its list. A status change, a new PR or a new run does not move a row.
   - The user can reorder project cards, key groups (a stack run moves as one block), review groups and top-level threads by drag. The page stores the order of each list in `localStorage`. An id that is not in the stored list goes after the stored ones, in base order. Ids that no longer exist drop out. Reviews and No issue key stay last. Subthreads keep the base order. No drag crosses lists.
   - A save keeps only the ids of the current view. With "show settled" off, settled items drop from the stored order and come back at the end, in base order.
   - A live push during a drag does not change the dragged list until the drop.

## UI

The page shows an outline tree: Project, group, thread. Each thread row has a status dot, a title link to `t3code://threads/<environmentId>/<threadId>`, a stack badge and PR links. Closed rows are saved in `localStorage`. A toggle shows settled threads. When a Linear workspace is set, an issue key links to its Linear issue. With team keys set, only a key of a listed team links. The "View" panel keeps the workspace and teams in `localStorage`; `LINEAR_WORKSPACE` and `LINEAR_TEAMS` give the default. A banner shows when T3 is down, when no token is set, or when T3 rejects the token. The token banners open the "View" panel.

The header holds the title, the filter with the Needs-you count ("All", "Needs you N"), "What's next", a sort menu ("Manual", "Last updated"), a Tree / Flat switch, one button that is fold all in the tree and a "Group by" menu ("None", "Status") in the flat view, and a "View" button. "View" opens a panel on the right, beside the tree. Its header stays in view while the panel scrolls, and Escape closes it. The panel has three groups. "Updates" (desktop app only) has the version, the update state and its action. "View" has show settled, reset order and the theme as three icons (Light, System, Dark). "Setup" has three folds, closed at first: T3 token, Linear links and the status icon legend. A fold shows its state at the right: green text when set, yellow text with a warning sign when not set, a blue info icon for the legend. The token banners open the panel with the T3 token fold open. When the panel opens in the desktop app, it checks for updates, but not when the last good check is less than 60 s old.

A pending request wins over snooze. A snoozed thread with a pending request shows as needs input.

The sort menu keeps its choice in `localStorage` under `thread-tree:sort`. "Last updated" sorts by `lastRun` of the thread node: the later of `latestRunStartedAt` and `latestRunCompletedAt`. It is never `updatedAt`, which changes about once a second while a thread works. The page sorts the arranged tree. Projects keep their order; Reviews stays first and No issue key last; groups and threads sort newest first, and a group or PR stack sorts by its newest thread, subthreads included. A thread with no run sorts last. Ties keep the manual order. Drag is off in "Last updated".

The flat view lists all threads of all projects in one list. The switch keeps its choice in `localStorage` under `thread-tree:layout`, and "Group by" under `thread-tree:group`. The flat list has no folds and no fold-all button. Drag works with "Manual" sort and is off in "Last updated". The flat list keeps its own order in the stored orders (`thread-tree:order`, list key `flat`), so "Reset order" clears it. It starts as the tree order, flattened, and a new thread goes last. A flat drag never changes the tree order, and the reverse. With "Group by Status", a row drags only inside its section; all sections share the one flat order. A stack run is one block, and subthreads stay under their parent. "Manual" keeps the tree order, flattened. "Last updated" sorts the whole list. "Group by Status" makes sections in this order: Needs input, Plan ready, Your turn, Failed (`failed`, `interrupted`), Working (`working`, `starting`, `waiting`), Idle and snoozed, Done. A section with no thread is hidden. A stack goes to the section of its most urgent thread. Saved tree folds stay unchanged.

The header has a System / Light / Dark choice. The full design is in [DESIGN-SPEC.md](DESIGN-SPEC.md).

## Live updates

1. The backend keeps the thread map from the stream.
2. On each change, it builds the whole tree again, after a short debounce.
3. It pushes the tree as JSON on `GET /events`. The settled toggle is a query parameter on this request (`?settled=1`), so the backend builds the tree for that connection's setting.
4. The page renders each tree it gets. It does not apply diffs.
5. `Bun.serve` closes a connection after 10 s with no bytes. Call `server.timeout(req, 0)` on the SSE request.
6. Stop the push timer when the client disconnects.

## "What's next" and the Next-step brief

Source: map [whats-next](.wayfinder/whats-next/map.md), tickets [How do we run claude and codex headless, with no tools, on a cheap model?](.wayfinder/whats-next/tickets/01-headless-cli-invocation.md) (research on branch `research/headless-cli`), [Where does the backend read the last assistant message of a thread?](.wayfinder/whats-next/tickets/02-thread-messages-source.md) (research on branch `research/thread-messages`), [What makes a good next step, and what is the shape of a brief?](.wayfinder/whats-next/tickets/03-ranking-rules-and-brief-shape.md), [Where and how does the brief show on the page?](.wayfinder/whats-next/tickets/04-brief-layout-prototype.md) (prototype on branch `prototype/brief-layout`).

A click on "What's next" runs a local agent CLI on a cheap model. Code makes the obvious **Actions** (`answer`, `fix`, `merge`). The CLI returns the rest of the **Next-step brief**: up to 7 ranked **Actions** over the threads that code did not cover. The CLI runs with its tools off and writes nothing to T3.

### CLIs

| Pick     | Label        | Model                        | Effort                             |
| -------- | ------------ | ---------------------------- | ---------------------------------- |
| `claude` | Claude Haiku | `haiku` (`claude-haiku-5-5`) | `--effort medium`                  |
| `codex`  | Codex Luna   | `gpt-6-luna`                 | `-c model_reasoning_effort=medium` |

- **Detection:** at start, run `claude auth status` and `codex login status`. Exit 0 means logged in. A CLI that is not on `PATH` (spawn gives `ENOENT`) or not logged in is not offered.
- **Run:** use the tested command lines in ticket 01 (research file on branch `research/headless-cli`), with the prompt on stdin. Do not use `claude --bare`: it ignores the OAuth login. Codex runs with `-C` set to an empty temp folder and reads the schema from a temp file.
- **Answer:** Claude: `structured_output` of the last JSON object on stdout; a failure is `is_error: true` or a non-zero exit. Codex: `JSON.parse` of the text of the last `item.completed` event with `item.type == "agent_message"`; a failure is `turn.failed` or a non-zero exit.
- **Timeout:** 60 s, then SIGTERM. **Cancel:** SIGTERM to the process.
- **One run at a time.** A second start while a run is active is refused.

### Input

- **Threads:** the visible top-level threads of the tree for the settled setting of the page that started the run (launched threads included). No subthreads. The code removes the threads that are `working`, `starting`, `waiting` or `snoozed`: they need no action.
- **Code actions:** code makes the actions below, before the model runs. Each thread gets at most one action: the first rule that matches. The list is grouped by kind in rank order (`answer`, `fix`, `merge`), in tree order inside a kind. The title and reason text is fixed.

  | Kind     | Rule                                                                             | Title              | Prompt                                          |
  | -------- | -------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------- |
  | `answer` | status `needs-input`                                                             | "Answer the agent" | `null`                                          |
  | `answer` | status `plan-ready`                                                              | "Review the plan"  | `null`                                          |
  | `fix`    | an open PR has failing checks, conflicts, or changes requested                   | "Fix PR #N"        | The fixed steps for each fact, then "and push." |
  | `merge`  | an open PR is not a draft, is approved, its checks pass, and it has no conflicts | "Merge PR #N"      | `null`                                          |

  `N` is the first PR that matches. The `fix` reason names the facts: "PR #N has failing checks, conflicts and changes requested."

- **Model input:** only the threads with no code action. The refs (`t1`, `t2`, …) number these threads only. When no such thread is left, the CLI does not start and the state is `done` at once.
- **Per thread**, one **Digest** block of text. The first line holds, split by `·`: short thread ref (`t1`, `t2`, … in tree order), status phrase with its age, title (with the issue key), PRs (number, state, draft, review, checks, conflicts), stack position, and pending request. A part with no value is left out. Then the tail of the last assistant message, each line indented by 2 spaces.
- **Last assistant message:** one batched read-only query on `statev2.sqlite` per run, from `orchestration_v2_projection_messages` (`role = 'assistant'`, newest row with `streaming = 0` per thread). The tested query is in the ticket 02 research file. Keep the last 600 characters of each message, with `…` first when the text is cut. `null` when the thread has no assistant message. The shell stream field `latestVisibleMessage` is always `null`; do not use it.
- **Prompt:** the system prompt is [src/server/next-step-prompt.md](src/server/next-step-prompt.md). It holds the ranking guide. The digest text is the user prompt. With no threads, the prompt is `No threads.`.

### Brief shape

The JSON schema for both CLIs (strict: every property required, `additionalProperties: false` at each level):

```ts
type Action = {
  kind:
    | "answer"
    | "merge"
    | "fix"
    | "review"
    | "clean-up"
    | "unblock" /** the model makes only "review", "clean-up" and "unblock" */;
  title: string /** imperative, ≤ 8 words */;
  reason: string /** one sentence */;
  threadIds: string[] /** ≥ 1 */;
  prompt: string | null /** paste-ready message for the first thread's agent */;
};
type Answer = { actions: Action[] }; /** 0–7 from the model, in rank order */
```

- The code keeps the model's order.
- **Unknown ids:** the model writes the short refs of the digest in `threadIds`. The code maps each ref back to the thread id and removes each ref that is not in the input. It removes an action with no ids left. It does not reject the answer.
- **Saved titles:** the code saves the title of each linked thread with the brief, so a thread that leaves the tree still has a name.
- An answer with 0 actions is valid.

### Endpoints and state

The backend keeps one brief state in memory. A page reload keeps it; a server restart loses it.

```ts
type BriefState =
  | { status: "idle" }
  | {
      status: "running";
      cli: Cli;
      threadCount: number;
      startedAt: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    }
  | {
      status: "done";
      cli: Cli;
      generatedAt: string;
      rulesOnly?: true;
      actions: BriefAction[];
      titles: Record<string, string>;
    }
  | {
      status: "failed";
      cli: Cli;
      error: string;
      stderrTail: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    };
```

`BriefAction` is `Action` after the id filter. The state type lives in a shared module, like `Tree`. In `running` and `failed`, `actions` and `titles` hold the code actions only, so the page can show them at once and after a model failure. In `done`, `actions` holds the code actions first, then the model actions. `rulesOnly` is set when no thread went to the model, so the actions come from code alone. A new run replaces the last brief only when it ends; a cancel returns to the state before the run.

- `GET /brief/clis`: the offered CLIs, as `{ id, label }[]`.
- `POST /brief/run?settled=0|1` with `{ cli }`: starts a run. 409 when a run is active, 400 for a CLI that is not offered.
- `POST /brief/cancel`: sends SIGTERM to the active run.
- `GET /events` also sends the brief state as a named SSE event `brief`: once when the connection opens, and again at each change. The page does not poll.
- **Error text:** the CLI error message (Claude `result`, Codex `turn.failed` message), or "timed out" or the parse error. `stderrTail` is the last 2 KB of stderr.

`bun run demo` uses a stub runner. `BRIEF=failed`, `BRIEF=empty` and `BRIEF=rules` pick the failed, empty and rules-only states. It returns a sample of the model part after a short delay; code makes the other actions from the demo tree, so the page works with no CLI.

### Page

The full look is in ticket 04. In short:

- **Controls:** in the header, after the filter, a split control: a primary "What's next" button (Sparkles icon) joined to a model `Select`. The choice is saved in `localStorage`. With no CLI offered, the button is disabled with a tooltip. The button is disabled while a run is active.
- **Panel:** an inline card between the header and the tree. It shows only after the first click, or when the brief state is not `idle` at load. The head has "Next steps", a mono stamp "generated HH:MM · <label>" ("generated HH:MM · rules only" when the model did not run), and a close button that hides the panel.
- **States:** loading ("Reading N threads…" with the letter wave, and "Cancel"); error (alert, "The brief failed.", "Retry", the stderr tail); empty ("Nothing needs you right now."); the ranked actions. In `running`, the code actions show at once as rows above the loading line. In `failed`, they show above the error. In `done`, all rows run in one rank order.
- **Action row:** rank, kind chip, title with the reason, thread links, and a copy icon for `prompt` (none when `prompt` is `null`).
- **Kind chips:** answer = `needs-input`, merge = `done`, unblock = `plan`, fix = `failed`, review = `working`, clean-up = `idle`.
- **Thread links:** each link shows the live `StatusIcon` and title from the current tree, and opens the thread in T3. A thread that is not in the live tree shows its saved title struck through. The brief text does not change.

## Send message

Source: map [send-message](.wayfinder/send-message/map.md), decisions at charting and grilling.

The user can send a message to one thread, and start a thread in a project, from the page. Each action opens a dialog, and nothing goes to T3 until the user confirms.

### Transport

The server runs the T3 CLI as a child process (`Bun.spawn`), like the brief runner. It uses T3's own login. The `orchestration:read` token and the read-only database do not change.

- **Send:** `<bin> thread send --json <threadId> -`.
- **Start:** `<bin> thread start --json --title=<title> <projectId> -`.
- **Message:** it goes on stdin only, never in argv. The title goes in argv as one `--title=<title>` item, so a title that starts with `-` is not read as a flag.
- **Output:** each command prints one JSON value on stdout. The server parses all of stdout as one JSON value. From `send`, it reads `delivery`; from `start`, it reads `threadId`. It ignores the other fields.
- **Flags:** no `--wait`, no `--worktree`, no `--provider` and no `--model`. The project defaults apply.
- **Find the CLI:** `T3_BIN` from `.env`, else `~/.t3/bin/t3` (`os.homedir()`). At server start, the server checks that the file exists and is executable (`fs.access` with `X_OK`). The result holds until a restart.
- **Timeout:** 30 s, then SIGTERM. The request fails with "timed out".
- **No lock:** sends and starts can run at the same time.
- **Started thread placement:** the CLI starts the thread with `t3_thread_launch`, so it is a **Launched thread**. Its first message has no `senderThreadId`, and no launch tool call names it, so it has no spawner. The tree rules place it by the issue key in its title. The title default carries the key for that reason.

### HTTP contract

Ids go in the JSON body, not in the path, because ids hold `:` and `%`. The module `src/server/send.ts` exports a service with `routes`, as `briefService` does. The response types live in `src/shared/send.ts`.

| Route            | Body                                                    | Success                                                               |
| ---------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /t3/cli`    | none                                                    | `200 { available: boolean, path: string }`                            |
| `POST /t3/send`  | `{ threadId: string, message: string }`                 | `200 { delivery: "started" \| "queued" \| "steered" \| "restarted" }` |
| `POST /t3/start` | `{ projectId: string, title: string, message: string }` | `200 { threadId: string }`                                            |

`delivery` comes from the `send --json` output. `threadId` comes from the `start --json` output.

Every failure has the body `{ error: string, exitCode: number | null, stderrTail: string }`:

- `400`: the body is not JSON, a field is missing, or `message` or `title` is empty after trim. `error` names the field.
- `404`: `threadId` is not in the live thread map, or `projectId` is not in the project map. Archived threads are not in the thread map. The CLI does not run. `error` is "Unknown thread" or "Unknown project".
- `503`: the CLI is missing. `available` was false at start, or spawn gives `ENOENT` or `EACCES`. `error` is "No t3 CLI at <path>. Set T3_BIN in .env."
- `502`: the CLI ran and failed. This covers a non-zero exit, a timeout, and stdout that is not the expected JSON.
  - `exitCode`: the exit code, or `null` on a timeout or a parse error.
  - `error`: the last non-empty stderr line, "timed out", or the parse error.
  - `stderrTail`: the last 2 KB of stderr.

The wrapper exit code 127 ("T3 Code has moved…") is a `502`, so the user sees its text. When T3 is not running, the CLI is still there. `available` stays true, and a send fails as a `502` with the CLI stderr.

### CLI-available flag

The page reads `GET /t3/cli` once at load. When `available` is false, every send and start control shows disabled, with the tooltip "No t3 CLI at <path>. Set T3_BIN in .env." This is the same disabled-with-tooltip pattern as the "What's next" button.

### Send dialog

One reusable component on the shadcn Dialog (Radix).

- **Opens from:**
  - A "What's next" step that has a `prompt`: a send icon next to the copy icon. The copy icon stays.
  - A thread row, top-level or subthread: a send icon at the row end, next to the details chevron. It shows on hover and on keyboard focus within the row. On touch devices (`(hover: none)`), at every width, it always shows. The icon stops propagation, so it does not open the thread and does not start a drag.
- **Target, from a step:** a picker (shadcn Select) with the threads of the step. Each option shows the live `StatusIcon` and the title. A thread that is not in the current tree shows its saved title struck through and is disabled. The first enabled thread is selected at open. With no enabled thread, Confirm send is disabled.
- **Target, from a row:** fixed. The dialog shows the icon and title of the row, with no picker.
- **Message:** a textarea, editable. From a step, it starts with the step prompt. From a row, it is empty. Confirm send is disabled while the message is empty after trim.
- **Busy note:** when the target status is `working`, `starting` or `waiting`, a muted line under the target says "This thread is working. The message waits for its next turn." Other statuses show no note.
- **Buttons:** Cancel and Confirm send.
- **Keys:** Cmd/Ctrl+Enter sends, Escape cancels, and Enter makes a new line.
- **In flight:** Confirm send shows a spinner. Until the request ends, the fields, Cancel, Escape and the outside click do nothing. Thus a cancel never hides a message that was sent.
- **Success:** the dialog closes. From a step, the step shows the mark (see "Sent to" mark). From a row, there is no mark: the row status changes through the stream.
- **Failure:** the dialog stays open, with the draft and the target. An inline alert above the buttons shows:
  - `error`;
  - "exit <code>", when `exitCode` is set;
  - `stderrTail` in mono, when it is not empty.

  Confirm send tries again. A network error shows "The server did not answer."

### Start dialog

The same dialog frame, with "Start thread" as the title and as the confirm label.

- **Opens from:** a "Start thread" icon on a "What's next" step that has a `prompt`, next to the send icon.
- **Project:** a Select with the projects of the current tree (project icon and label). At open, it selects the project of the first thread of the step that is in the tree, else the first project.
- **Title:** a text input. The default is the issue key of the first linked thread of the step, a space, then the step title. When the thread has no key or is not in the tree, the default is the step title alone. The page sends the title as the user wrote it, trimmed, with no length cap. Confirm is disabled while the title is empty after trim.
- **Message:** a textarea with the step prompt, editable. Confirm is disabled while it is empty after trim.
- **No worktree field and no model field.**
- **Keys, in flight and failure:** as in the send dialog.
- **Success:** the dialog closes. The new thread shows in the tree through the stream. The page does not add it. The step gets no mark.

### "Sent to" mark

After a send from a step succeeds, the step row shows "Sent to <thread title>" in muted text under its reason, with a check icon. Several sends list each thread once, in send order: "Sent to A, B".

The marks live in page memory. The key of a mark is the `kind`, `title` and `threadIds` of the step. Thus a mark holds in every brief state, also in `running` and `failed`, which show code steps. Each change of the brief state to `running` clears them. A reload clears them.

### Demo stub

`scripts/demo.ts` passes a stub runner to the send service, as it does for the brief. It never runs the real `t3`.

- The stub answers after 1 s. A send returns `{ delivery: "queued" }`. A start returns `{ threadId: "demo-started" }`. The demo tree does not change.
- `SEND=failed`: both routes return `502` with `exitCode: 1`, `error: "Thread demo-1 is not reachable."` and a stderr tail of two sample lines.
- `T3CLI=0`: `GET /t3/cli` returns `available: false`, so the controls show disabled.
- The `400` and `404` checks run in the demo too, against the demo threads and projects.

### Smoke run

Tickets 02 and 05 each run one smoke test against the real T3, with `bun start`:

1. Start: `POST /t3/start` in the project of this repo, with a title that starts with `Smoke test` and a short message such as "Reply with OK.". Expect `200` with a `threadId`, and the new thread shows in the tree.
2. Send: `POST /t3/send` to that new thread. Expect `200`, and the message shows in the thread in T3 Code.
3. Clean up: archive the smoke thread in T3 Code.

### README

[Ticket 02](.wayfinder/send-message/tickets/02-send-endpoints.md) adds `T3_BIN` to Setup in `README.md` and the demo knobs to Run. [Ticket 03](.wayfinder/send-message/tickets/03-brief-send.md), [ticket 04](.wayfinder/send-message/tickets/04-row-send.md) and [ticket 05](.wayfinder/send-message/tickets/05-step-start-thread.md) add their "What you get" entries.

## Desktop app

Source: map [desktop](.wayfinder/desktop/map.md), tickets [What does the Bun app use, and how does T3 Code ship its desktop app?](.wayfinder/desktop/tickets/01-port-inventory.md) (research in `.wayfinder/desktop/research/01-port-inventory.md`), [Which shell and runtime?](.wayfinder/desktop/tickets/02-shell-and-runtime.md), [What do the badge, the notifications and the menu-bar entry do?](.wayfinder/desktop/tickets/03-desktop-features.md), [How is the app built, run in dev and installed?](.wayfinder/desktop/tickets/04-build-and-install.md).

The **Desktop app** runs the tree in its own macOS window, with a Dock icon, a Dock badge, notifications and a menu-bar entry. It changes where the app runs, not what it does to T3. The browser version (`bun start`) stays as it is.

### Shape

- **Shell:** Electron, a dev dependency. macOS on Apple Silicon (arm64) only.
- **Main process:** `src/desktop/main.ts`, plain Electron, no Effect. **Preload:** `src/desktop/preload.ts`. Pure logic (port choice, PATH parsing, restart backoff, notification rules, the menu list) lives in modules with no Electron import, so `bun test` covers it.
- **Server:** the current Bun server, unchanged in role, runs as a child process of main. It is not ported to Node.
  - Packaged: the compiled sidecar at `process.resourcesPath/server`.
  - Dev: `bun src/server.ts`, so Bun's HMR stays. With `DESKTOP_DEMO=1`, `bun scripts/demo.ts`.
  - `app.isPackaged` selects the packaged or the dev command.
- **Port:** main tries `127.0.0.1:4773`, then each next port, and takes the first one it can listen on. It passes the port to the child as `PORT`. The demo uses the same choice.
- **Ready:** main polls `GET http://127.0.0.1:<port>/t3/cli` every 100 ms until it answers, for up to 30 s. Then it loads the window.
- **Restart:** when the child exits and the app is not quitting, main starts it again after `500 ms × 2^attempt`, capped at 10 s. A child that ran for 60 s resets the attempt count. Main stops the child (SIGTERM, then SIGKILL after 5 s) when the app quits.
- **Working folder:** the child runs in the app data folder, `~/Library/Application Support/T3 Thread Tree/` (Electron `userData`). Bun loads a `.env` from there, so `LINEAR_WORKSPACE`, `LINEAR_TEAMS` and `T3_BIN` work in the packaged app. In dev, the child runs in the repo and reads the repo `.env`.
- **Single instance:** `app.requestSingleInstanceLock()`. A second start shows the first window and quits.

### Shell PATH

An app started from the Dock or Spotlight does not get the shell PATH, so the brief would not find `claude` or `codex`.

- At start, main runs `$SHELL -l -c env` once, with a 5 s timeout. It takes the `PATH=` line and passes it to the child env.
- On failure (timeout, non-zero exit, no `PATH=` line), main keeps its own PATH and appends `/opt/homebrew/bin`, `~/.local/bin` and `~/.bun/bin`.

### Window

- One window. It loads `http://127.0.0.1:<port>`. No custom scheme. When the port is not 4773, that run has its own `localStorage`, so the theme and fold state are the defaults. This is a known cost.
- `show: false`, then show on `ready-to-show`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `backgroundThrottling: false`. The standard macOS title bar.
- The app saves the window size and place in `window.json` in the app data folder, and restores them at start. A saved place that is off all screens is dropped.
- **Close:** the close button hides the window. The page keeps running and drives the badge, the menu-bar entry and the notifications. A Dock click or "Open tree" shows the window again.
- **Quit:** Cmd-Q, or "Quit" in the menu-bar menu. Launch at login is not offered.
- **App menu:** the role menus (app, edit, view, window). The app menu also holds "Mute Notifications" and, when one exists, "Update available: vX.Y.Z…".
- External links (`t3code://`, PRs, Linear) open with `shell.openExternal`, not in the app window.

### Preload bridge

The preload exposes `window.desktopBridge`. The page checks for it. In a browser it is absent, and the page works as today.

```ts
type NeedsYouStatus = "needs-input" | "plan-ready";
type NeedsYouThread = {
  id: string;
  title: string;
  environmentId: string;
  since: string | null;
  status: NeedsYouStatus;
};
type NotifyEvent =
  | {
      kind: "thread";
      threadId: string;
      environmentId: string;
      title: string;
      status: "needs-input" | "plan-ready" | "failed";
    }
  | { kind: "summary"; count: number };
type DesktopBridge = {
  setNeedsYou(threads: NeedsYouThread[]): void /** badge and menu-bar entry */;
  notify(events: NotifyEvent[]): void;
  openExternal(url: string): void;
};
```

Main checks each payload by hand (types, sizes, a `t3code:`, `https:` or `http:` URL) before it acts. It accepts IPC only from the main window.

### Needs you

The **Needs you** set is the visible top-level threads with status `needs-input` or `plan-ready`. Settled threads do not count. The page computes it from each tree it gets (the same count as the header chip) and calls `setNeedsYou`. `since` is the start of that status, for the menu order.

### Dock badge

- `app.setBadgeCount(count)` with the Needs-you count. 0 hides the badge.
- It always shows. It does not clear on window focus.

### Notifications

The page owns the rules. Main shows them, so the mute switch stays in main.

- **Trigger:** a thread enters `needs-input`, `plan-ready` or `failed`. "Enters" means its status in this tree differs from its status in the last tree. A thread that is new in the tree with one of these statuses also enters. No notification for your turn or for PR checks.
- **Baseline:** the first tree after the page loads sends nothing. A tree with `conn` not `up` sends nothing and does not move the baseline.
- **Grouping:** 1 or 2 threads enter in one tree: one notification per thread. 3 or more: one summary, "N threads need you".
- **Text:** title "Needs input", "Plan ready" or "Failed"; body the thread title.
- **Replace:** a new notification for a thread closes the earlier one for that thread.
- **Click:** a thread notification opens `t3code://threads/<environmentId>/<threadId>`. The summary shows and focuses the window.
- **Mute:** "Mute Notifications" in the app menu and in the menu-bar menu. Off by default, saved in `settings.json`. It stops notifications only, not the badge or the menu. macOS Focus covers Do Not Disturb.
- Main uses Electron `Notification`, silent off. No per-status or per-project rules.

### Menu-bar entry

- A `Tray` with a template icon and the Needs-you count as its title. No title when the count is 0.
- A click opens a native menu:
  1. Up to 10 Needs-you threads, the longest wait first (oldest `since`; `null` last). Each item shows the status and the title. A click opens the thread in T3 Code.
  2. "+N more… (open tree)" when more than 10, which shows the window.
  3. "Open tree", "Mute Notifications", "Update available: vX.Y.Z…" when one exists, "Quit".
- Main builds the menu again on each `setNeedsYou`.

### Token

- The packaged app keeps the T3 token in `token` in the app data folder, mode `0600`. No Keychain: an ad-hoc signature changes with each build, so the Keychain would ask after each update.
- Main passes the file path to the child as `T3_TOKEN_FILE`. The server reads and writes it (see "Token" above), so the desktop app and the browser use the same field. With no file, the child env keeps any `T3_TOKEN` it already has (dev uses `.env`).

### Build and dev

- `bun run desktop`: bundles main and preload with `Bun.build({ target: "node", format: "cjs", external: ["electron"] })` into `dist/desktop/`, then starts Electron. No watch for main: restart after a main change. The page keeps HMR.
- `bun run desktop:demo`: the same, with `DESKTOP_DEMO=1`.
- `bun run build:sidecar`: `scripts/build-sidecar.ts` calls `Bun.build({ compile: { target: "bun-darwin-arm64" } })` on `src/server.ts` with the Tailwind plugin, into `dist/sidecar/server`. The CLI is not enough: the Tailwind plugin works only through the JS API.
  - The lineage worker is passed as a string path, so the compiler bundles it as an extra entry point.
  - `next-step-prompt.md` is imported as text (`with { type: "text" }`), so it is in the binary.
- `dist/` and `release/` go in `.gitignore`.

### Package, sign and install

- **electron-builder** packages the app into `release/`, `arm64`, with the sidecar through `extraResources` (`dist/sidecar/server` → `server`). Product name "T3 Thread Tree".
- **Signing:** ad-hoc (`codesign -s -`), with `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory` for the sidecar. No Developer ID, no notarization.
- **Install paths** (all in the README):
  - `.dmg` from GitHub Releases. The first open needs System Settings › Privacy & Security › "Open Anyway", or `xattr -dr com.apple.quarantine "/Applications/T3 Thread Tree.app"`.
  - From source: `bun run desktop:install` builds the sidecar, bundles main and preload, runs electron-builder `--dir`, signs ad-hoc and copies the `.app` to `/Applications`.
  - Browser: `bun start`, as today.

### Release and updates

- A push of a `v*` tag runs `.github/workflows/release.yml` on `macos-14`. It builds the ad-hoc signed `.dmg` and attaches it to the GitHub Release of that tag. `package.json` holds the version.
- The main process keeps one update state (`UpdateState` in `src/shared/desktop.ts`). The app menu, the menu-bar menu and the "View" panel read it. The page gets it through `updateState` and `onUpdateState` on the bridge, and sends no URL or path.
- The packaged app reads the GitHub latest-release API at start and every 6 h. The panel also checks when it opens. A check never runs during another check or an install, and a check that is not forced is skipped within 60 s of the last good reply. A reply that does not parse counts as a failed check. A failed check keeps a known release.
- When the latest tag is newer than `app.getVersion()`, the menus show "Update available: vX.Y.Z…" and the "View" button shows a dot. No notification.
- "Update and Restart" (menu) and "Update and restart" (panel) download the release zip to disk, unpack it with `ditto`, start the swap script and quit. The state has the stages `downloading` (with a percent when `content-length` is known), `unpacking` and `restarting`. The menus, the panel, the "View" button ring and the Dock progress bar (download only) show them. A failed install sets the stage `failed` with the message. A run from source, or a release with no zip, can only open the release page.

### CI

- `bun run check` keeps its name. It also formats, lints, typechecks and tests `src/desktop/`.
- CI also runs `bun run build:sidecar` on ubuntu (cross-compile to `bun-darwin-arm64`). CI does not package the app.

### README

Each build ticket updates the README for its own part: the "What you get" entry, and Requirements, Setup, Run and "How it works" when they change. Ticket 13 adds the install paths.

## Check at build

These facts are not confirmed against a real stream. The research used the MCP thread list and SQLite.

- Nobody has opened the shell stream with a real token yet.
- The PR fields: the MCP list has `pullRequests[].state`; the shell has `pullRequests[].snapshot.state`. Confirm the path for the open-PR filter and for the stack.
- `pendingRuntimeRequest` as the "needs input" signal (the prototype used `orchestration_v2_projection_runtime_requests` with `status = 'pending'`). Also check how the `waiting` run status fits the table.
- `toolName` for callers that are not Claude (for example Codex) in the lineage lookup.
- Whether `codex exec --ignore-user-config` skips a global `~/.codex/AGENTS.md`. If not, the brief run sees it.
- Whether a `bun-darwin-arm64` cross-compile on ubuntu runs on a Mac, and whether Bun's compiled binary loads `.env` from its working folder.
