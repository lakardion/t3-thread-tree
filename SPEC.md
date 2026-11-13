# T3 thread tree: build spec

A local, read-only webapp. It shows the active T3 Code threads as one live tree: Project › issue key › thread. Each node shows its status and its PR stack. A click on a node opens the thread in T3 Code.

Terms are defined in [CONTEXT.md](CONTEXT.md). Each section links the ticket that holds the full decision and its reasons. When this spec and a ticket do not agree, this spec wins: it includes the later changes.

## Scope

- In scope: the threads of the local T3 environment (`~/.t3/userdata`), live updates, and "open in T3".
- Out of scope: write actions (settle, snooze, send, interrupt, launch); threads from linked T3 environments on other machines; any change to T3 Code itself.

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
- The token goes in the gitignored `.env` as `T3_TOKEN`, which Bun loads.
- If T3 rejects the token (HTTP 401), the page banner shows this command.

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
   3. A keyless thread with a visible spawner in the same project nests under that spawner.
   4. Any other keyless thread goes under `Project › No issue key`.
7. **Launcher threads** get no special rule.
8. **PR stack:** it adds no level to the tree. Each thread in a stack shows a badge with its position, for example `⧉ 3/6`. Key groups in one project that share a stack sit next to each other, in stack order.
   - Stack membership: the thread's open PRs with `source` `created`, `stack` or `agent`.
   - Stack order: as computed by `build.py` on branch `prototype/005-tree-ui`.
9. **Order:**
   - Projects are sorted by their latest update, newest first.
   - In a project: issue-key groups (newest first, with stack mates kept together), then Reviews, then No issue key.
   - Threads in a group are sorted by their latest update, newest first. The latest update includes nested threads.

## UI

The page shows an outline tree: Project, group, thread. Each thread row has a status dot, a title link to `t3code://threads/<environmentId>/<threadId>`, a stack badge and PR links. Closed rows are saved in `localStorage`. A toggle shows settled threads. When `LINEAR_WORKSPACE` and `LINEAR_TEAMS` are set, an issue key of a listed team links to its Linear issue. A banner shows when T3 is down or rejects the token.

A pending request wins over snooze. A snoozed thread with a pending request shows as needs input.

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

A click on "What's next" runs a local agent CLI on a cheap model. Code makes the obvious **Actions** (`answer`, `fix`, `merge`). The CLI returns the rest of the **Next-step brief**: up to 7 ranked **Actions** over the threads that code did not cover. The app stays read-only: the CLI runs with its tools off and writes nothing to T3.

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

## Check at build

These facts are not confirmed against a real stream. The research used the MCP thread list and SQLite.

- Nobody has opened the shell stream with a real token yet.
- The PR fields: the MCP list has `pullRequests[].state`; the shell has `pullRequests[].snapshot.state`. Confirm the path for the open-PR filter and for the stack.
- `pendingRuntimeRequest` as the "needs input" signal (the prototype used `orchestration_v2_projection_runtime_requests` with `status = 'pending'`). Also check how the `waiting` run status fits the table.
- `toolName` for callers that are not Claude (for example Codex) in the lineage lookup.
- Whether `codex exec --ignore-user-config` skips a global `~/.codex/AGENTS.md`. If not, the brief run sees it.
