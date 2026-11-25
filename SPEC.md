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

- The user issues the token once with `~/.t3/bin/t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope filesystem:read --label thread-tree --ttl 52w --token-only | pbcopy`. `pbcopy` puts the token on the macOS clipboard.
- The user pastes it in the "T3 token" password field of the Settings panel. The page sends `POST /token` with `{"token": "…"}` (JSON only, so a cross-site form cannot send it). The server checks it (one line, at most 4096 bytes), writes it to the token file (mode `0600`), drops the open socket and connects again. The user can replace it at any time.
- **Token file:** `T3_TOKEN_FILE`, else `~/.config/t3-thread-tree/token`. When the file holds no token, `T3_TOKEN` from the env is the fallback.
- With no token, the tree `conn` is `no-token`. If T3 rejects the token (HTTP 401), it is `unauthorized`. Both banners link to the token field.

### T3 not running, or restarted

- The backend starts even when T3 is not running.
- Every 3 s, it reads `server-runtime.json` again and tries to connect.
- While T3 is down, the page keeps the last tree, greyed, with the banner "T3 not running: last update HH:MM".
- Each new connection takes a fresh snapshot, and its first `snapshot` item replaces the whole thread map. Do not use `afterSequence`.

## Run questions

A **Run question** and a **Paused run** wait for the user, as threads do (see CONTEXT.md). The app shows them with the threads that need the user. They add no row to the tree. A run that has a step thread has its own row (see "Runs in the tree").

### Data

- The client sends a second request on the socket: `workflows.subscribe`, request id `"w"`, payload `{}`. Each chunk of it holds full `WorkflowRunsSnapshot` values. The newest one replaces the state. No merge.
- The client sends each chunk's `Ack` with the chunk's own `requestId`. The shell stream keeps id `"1"`. An `Exit` for `"w"` (an old T3 with no workflows) is logged and keeps the socket open. The runs list then stays empty. Only an `Exit` of `"1"` closes the socket.
- `runItems` makes the items. Each entry of `questions` gives a **Run question**. A run with `status` `paused` and `resumesAt` null gives a **Paused run**. Other runs, `skipped` runs and ended runs give nothing.
- A **Run question** has the id `q:<runId>:<name>`, the question title, the choices, its Wait from `askedAt`, and `threadHref` (`t3code://threads/<environmentId>/<threadId>` of the run's latest agent thread, or null). A null `environmentId` means this environment. The workflow name and run title come from the run in the same snapshot; with no run they are the run id.
- A **Paused run** has the id `p:<runId>`, the run title, `detail`, `retired`, and its Wait from `updatedAt`.
- The **Catch-up line** is the question title, or the first line of `detail`. No model call.
- The tree has `runs`: the list of items, or null until the first workflows snapshot. The page sets its notification baseline from the first list that is not null.
- **Open in T3.** The link is `<T3 origin>/workflows?run=<runId>`. The T3 desktop app opens only `t3code://new` and `t3code://threads/…`, so a `t3code://workflows` link would do nothing. The page opens it in a new window; the desktop app hands it to the system browser.

### Routes

All three take JSON only (415 for another content type, 400 for a bad body) and answer 204. A failure answers 502 with the T3 message; a missing scope names the fix, as for settle.

- `POST /t3/workflows/answer` with `{ runId, name, choice, reason? }` calls `workflows.answer`. The server sends `reason` only when it is not blank.
- `POST /t3/workflows/resume` with `{ runId }` calls `workflows.resume`.
- `POST /t3/workflows/cancel` with `{ runId }` calls `workflows.cancel`. T3 can take 30 s to cancel. A call that times out answers 202: the next snapshot settles it.

### Where they show

- **Needs you.** Each item counts in the Needs-you badge, the tab title, the Dock badge and the menu-bar list. The "Needs you" filter and the tree do not change.
- **Open next queue.** Items and threads mix, oldest Wait first. The skip memory keys an item by `id` and `since`: `runId` + `name` + `askedAt` for a question, `runId` + `updatedAt` for a paused run. Open next opens the run page.
- **Triage card, Run question.** It has the layout of the thread card. The header has the `Workflow` icon and "Run question" in the plan color, "· <workflow>", the Wait, the count and Close. Then the question title and, in muted text, the run title. The choices show as numbered chips. A click or the keys `1` to `9` select one; it does not answer. The field "Reason (optional)…" is the reason. "Answer" and Cmd/Ctrl+Enter send the choice and the reason, and stay off until a choice is selected. On success, the card goes to the next one. On a failure, the card shows the error and stays. With no choices, a box says that T3 takes only a choice and offers "Open run in T3". The footer has "Talk it through" (only when `threadHref` is set; it opens that thread), "Open run in T3" (`o`) and Skip (`j`).
- **Triage card, Paused run.** The header has the `CirclePause` icon and "Paused run" in the failed color. Under the run title, a muted line says "Waits for you", or "Its workflow version is gone. It cannot resume." for a retired run. The `detail` shows clamped to 3 lines; "Show detail" (`space`) shows all. "Resume" is hidden for a retired run. "Cancel" shows the confirm "Cancel run <title>?" with "Cancel run" and "Keep"; while the call runs, the card says "Cancelling…". "Open run in T3" is there too.
- **No other actions.** A run card has no Settle, Snooze, Focus or Send. The end counts add "answered", "resumed" and "cancelled" when they are not 0.

## Runs in the tree

A **Run** with a **Step thread** shows in the tree as a **run row**. The step threads and the child runs of the run sit under it.

### Data

- A step thread is a shell thread with `workflowRun { runId, workflow, step }`.
- The runs come from `workflows.subscribe`. `parentRunId`, `parentStep` and `startedAt` of each run are read too.
- The steps of a run come from `workflows.get` with `{ runId }`. The result has `steps` in start order, each with `name`, `status` (`running`, `completed`, `failed`) and `threadId`. T3 lists only steps that started.
- The server calls `workflows.get` for each run that shows, and again when the `updatedAt` of the run changes. A failed call is logged once. The old steps stay.

### Rules

- **Step threads.** A step thread is never a top-level thread, and never a **Map member** (see "Map groups"). It is not in the tree, the flat view or the Settled list. It shows only under its run. A subagent or side chat with `workflowRun` stays hidden.
- **Which runs show.** A run shows when it has at least one step thread, and its status is `running`, `waiting` or `paused`, or one of its step threads is `working`, `starting`, `needs-input` or `plan-ready`. A run that is not in the snapshot counts as ended. Its title is the `workflow` of its first step thread. A run with no step thread is not in the tree. Its question or pause still shows in Needs you, Triage and Up next.
- **Placement.** A root run has no `parentRunId`, or its parent run does not show. It is placed like a top-level thread (Tree rule 6), in the project of its first step thread (the oldest `createdAt`). Its issue key is the first key in the run title, else the key of its first step thread. A title that starts with `Review #` goes to Reviews. A run has no stack group and no launch nesting. With no key, it goes to No issue key (in the Linear tree, to the loose list).
- **Children.** Under a run: all its step threads (from any project, settled or not) and its child runs, to any depth. A child run nests under its parent run and is never placed by itself. A step thread from another project than its run shows a muted project chip. A step thread in a PR stack stays under its run and keeps its stack badge. Its keyless stack mates still go to the stack group. The snooze rules apply to step threads as to threads. Subagents stay hidden (Tree rule 2).
- **Order.** Children sort by `createdAt` (a child run by `startedAt`), oldest first. A tie goes to the id. A run row drags like a top-level thread in its group. With "Last updated", a run sorts by the newest of its `updatedAt` and the last run of its step threads.
- **Row data.** The status and phrase of the run:
  - An open **Run question**: needs input, "asks you · <step>", with the **Wait** from `askedAt`.
  - A paused run: needs input, "paused · <step>", with the **Wait** from `updatedAt`.
  - A run that is `running` or `waiting`: working, "running · <step>".
  - Any other run: done, "done · N steps".
  - `<step>` is the last step that is running or failed, else the question name. With neither, the phrase is only the word.
  - The `detail` of the run is the tooltip of the phrase. A run row has no PR chips.
- **Steps.** One line for each step from `workflows.get`: `running` is current, `completed` is done, `failed` is failed. A line shows the step thread whose id is the `threadId` of the step. Else it shows the child run whose `parentStep` is the step name. A child that no line took follows, as a line named by its step. Without fetched steps, the lines are the children in order. There is no pending line, because T3 lists only steps that started.
- **Flat view.** A run with its children is one unit. In Group by Status, the unit goes to its most urgent section, from the run status and the statuses of its step threads. Group by Linear project places a run by its issue key, like a thread. A run does not count as a thread in a section header.
- **Find.** Find matches a run by its title. Enter opens the run page in a new window. A step thread result shows "in <run title>".
- **Keys.** A run row is a stop. Enter opens the run page. `o`, `l` and `h` fold and unfold its rail. `s` does nothing.
- **Left out.** A run is not a thread. It never joins the Focus list, Needs you, Open next, Triage or Looks done. Its step threads count as threads. A run row has no Settle, no Send and no Focus mark.

### Look

- **Run row:** a box with a thin purple border and a light purple tint (`border-status-plan/30 bg-status-plan/5`), at the height and text size of a thread row. From left to right: the run icon, the title (semibold, truncates, opens the run page), the step strip, the phrase with its **Wait**, the workflow name (mono, muted), the age of `updatedAt`, "Open run in T3" and a fold chevron.
- **Run icon and phrase:** running is `LoaderCircle` in the working color. An open question is `Workflow` in the plan color. A paused run is `CirclePause` in the failed color. A done run is `Check` in the done color.
- **Step strip:** one short pill for each step, in step order: done green, current blue, failed red, pending muted. The tooltip lists each step name and state.
- **Step rail:** under the run row, a 2 px purple rail. Each step is one line in a grid. The left column (6.5 rem) has a colored dot on the rail and the step name in mono. The right column has the step content: the thread row of the step thread (no drag handle), a child run row with its own rail, or a muted state word ("not started" for a pending step).
- **Fold:** the chevron folds the rail. The run row stays. The fold state is not stored.
- **Link:** the run title, "Open run in T3" and the Find result open `<T3 origin>/workflows?run=<runId>` in a new window (see "Run questions").
- **Theme:** only theme tokens, so light and dark both work.

## Map groups

Source: wayfinder map `map-groups` in the wiki (`t3-thread-tree/issues/map-groups/`). Ticket 01 reads the first messages in `statev2.sqlite` (research in `research/01-first-message-facts.md`). Ticket 02 fixes the **Map key**, the **Map thread** and membership. Ticket 03 ranks membership against the tree rules. Ticket 04 picks the look; the prototype is on branch `prototype/map-group-look` (`src/page/map-group.prototype.tsx`, variant B). Ticket 05 fixes the flat view and the Linear tree. Ticket 06 settles the fold, a callback to a settled map thread, and a thread that anchors several maps.

The threads of one wayfinder map show as one **Map group** under their **Map thread**. The feature is always on. It has no setting. It reads no map file and shows no map progress.

### Data

- **First message.** The server reads the first user message of each top-level thread from `orchestration_v2_projection_messages`, in the SQLite module of "Launched-thread lineage". For an id with `mcp:` (also `mcp:launch:`), the row has `message_id = thread_id`: a primary-key lookup. For other ids (`thread:mcp:…:N`, `<uuid>`, `import:claudeAgent:<uuid>`), use `WHERE thread_id = ? AND role = 'user' ORDER BY created_at, message_id LIMIT 1` (index `orchestration_v2_projection_messages_thread_created_idx`). Read it for each visible thread and each thread on its spawner chain. Cache the key by thread id in memory. All 2578 threads take about 0.26 s.
- **Skill call.** The parser accepts four forms, with the skill `wayfinder` or `wayfinder-implement`:
  - `/wayfinder …` as the first characters;
  - `$wayfinder …` as the first characters;
  - `Invoke the wayfinder skill with arguments: …`;
  - the imported XML form `<command-message>…</command-message>`, `<command-name>/wayfinder</command-name>`, `<command-args>…</command-args>`.
- **Map key.** Take the first whitespace-separated token after the skill name (after `with arguments:`, inside `<command-args>`). The token can come after a newline. Strip a trailing `</command-args>`.
  - An `http(s)` URL: the key is the URL with no query and no fragment. This covers GitHub and Linear issue URLs.
  - A token that ends in `map.md`: replace a leading `~` with the home folder, keep an absolute path, join `.wayfinder/…` to the `workspace_root` of the thread's project, and join any other relative path to `~/repos/wiki`. Normalize the path. The key is the folder that holds `map.md`.
  - Any other token gives no key. There is no rule for a bare issue key such as `ENG-5432`.
  - The key is internal and never shows. A moved map with two path spellings gives two keys and two maps.
- **Marked map thread.** The user can mark any thread as a map thread, for a map that has no `map.md` path or issue URL, such as `$wayfinder-implement <folder>`.
  - The marked ids are a JSON array in the server file `~/.config/t3-thread-tree/map-threads` (env `MAP_THREADS_FILE`). The server reads it on each tree build, so a hand edit shows on the next change. The Details block of a thread has a "Mark as map thread" or "Unmark map thread" button. It is not on a run, a Map header or a step thread. The head of a marked map shows an unmark button in place of its map icon (see below). `POST /map-threads` with `{ id, marked }` edits the file.
  - A direct child of a marked thread that has no own **Map key** gets the key `thread:<id>`. Deeper descendants join through the nearest keyed ancestor. The marked thread is the map thread, not a member. `mapKey()` does not change.
  - A real key on a child wins. Then the marked thread anchors several maps, and each map gets one Map header. A marked thread that is a member of a real map holds its keyless children in a nested `thread:` group inside that map.
  - The name of a `thread:` map is the title of the marked thread with "Wayfinder" removed, else the thread id.
  - The map icon at the left of a marked map group is a button. On hover and focus it shows an X, and its tooltip says "Unmark map thread". A click unmarks the thread. The head row has no Details button, so this is the way to unmark from the tree. A settled marked thread gives a Map header whose id is the thread id, and its icon does the same. A Map header with a `map:` id has no button. An id of a thread that does not exist does nothing.
- **Spawner chain.** As in "Launched-thread lineage". A thread is an **ancestor** of another when it is on that thread's spawner chain.

### Membership

- **Map thread.** For each key, the topmost keyed threads are the threads with that key and no ancestor with the same key. Their spawner is the map thread. It is usually the charting thread, which has no key, and it gets the `/t3-handoff` callbacks.
  - With two such spawners, the spawner of the earliest keyed thread (by `createdAt`) is the map thread. The keyed threads from the other spawner join its group.
  - A hand-started keyed thread (no spawner) joins the group of its map thread when the map has one.
  - A ticket thread is never the map thread. A map whose topmost keyed threads have no spawner has no map thread.
  - One thread can be the map thread of several maps.
  - A map thread can be a member of another map (a sub-map charted in a ticket thread of a parent map).
- **One map for each thread.** The first match wins:
  1. its own key;
  2. else the map of its nearest ancestor that has a key (a dispatch's `start-issue` threads join this way);
  3. else the map that it anchors as map thread.
- A **Map member** is a thread with a map by step 1 or 2. A map thread joins only through a parent map. A sub-map's ticket threads belong to the sub-map, and the sub-map's map thread belongs to the parent map.
- Keyless threads with no keyed ancestor (`$wayfinder continue with the next ticket`) are not members. They place by the tree rules.
- **Runs ignore maps.** A step thread is never a member, also when its first message names a map. It stays under its run.
- **Display name.** The title of the map thread with the word "Wayfinder" removed, case ignored. This also removes a prefix or suffix such as "Wayfinder:". When the map thread anchors several maps, or the map has no map thread, the name is the folder name of the key, made readable: `workflow-runs-tree` gives "Workflow runs tree". When two visible maps have the same folder name, add the parent folder: `TIB-3860/wayfinder`. A URL key uses its last path part, for example `#33`.

### Placement

- **Rule 6.0.** A map member goes into its map group. This comes before every case of Tree rule 6: Reviews, key groups, PR stacks and launch nesting. A `Review #…` member goes into the group too. A member never places by itself.
- **The head.** The map thread is a normal row and places by Tree rule 6 in its own project. Its map group comes with it. When the map thread is a member of a parent map, it nests in the parent's group. A snoozed map thread stays as a muted row.
- **Map header.** A **Map header** is the head instead of the map thread row when:
  - the map thread is settled or archived: the header takes the place that the map thread would have by rule 6;
  - the map has no map thread: the header takes the place of the oldest visible member;
  - the map thread anchors several maps: the map thread row is the head, and under it each map gets one map header with its own rail, oldest map first (by its oldest member).
- The header follows `settledAt` of the map thread and nothing else. A callback (`/t3-handoff <map>`) to a settled map thread brings back the row only when T3 unsettles the thread.
- A map group shows only while one or more members are visible.
- **Stack mates.** A keyless non-member in a PR stack with a map member goes into that map's group, in stack order, next to the member. A keyed non-member stays in its key group. In a stack with members of two maps, each member stays in its own map, and keyless non-members go to the map of the lowest member.
- **Other projects.** A member from another project than the head shows in the group, with the muted project chip, as a step thread does.
- **Inside a group.** Members nest by spawner chain (a dispatch holds its `start-issue` threads), whatever the launch nesting setting. A settled member is hidden, and its visible children move up to the next visible ancestor. Each list sorts by `createdAt`, oldest first, and a tie goes to the id. Stack mates stay together in stack order. Stack mates that spawned each other do not nest. They sit together where the topmost mate sits.
- **Nested maps.** A sub-map's group nests in the parent's group, at the place of the sub-map's map thread, to any depth. If that map thread is settled, its map header takes that place.

### Order and drag

- Only the head is in a stored order list: `thread-tree:order`, `thread-tree:order-linear`, and the list `flat` in each. The head id is the map thread id, also while the header shows for a settled map thread, so the header keeps the place of its map thread. A map with no map thread uses `map:<key>`.
- The group drags as one block with its head. Members keep the base order and do not drag.
- "Last updated" sorts the group by its newest member, the head included.

### Look

The **Map rail**, in amber: `amber-500` for the rail, `amber-600` (light) and `amber-400` (dark) for the icon. Use theme tokens beside it, so light and dark both work.

- **Map node.** A round node with the lucide `Map` icon in an amber ring, left of the head.
- **Map thread row.** The normal thread row with no details fold. At the right end, the member count and the map fold take the place of the details fold.
- **Map header.** The map node, the fold, the map icon, the display name, the member count and, only when a map thread exists, "Open map thread in T3" (`t3code://threads/<environmentId>/<threadId>`). It has no status, no Settle, no Send and no Focus mark. It is not a thread: no count, Needs you, Open next, Triage, Looks done or Find takes it.
- **Rail.** An amber rail drops from the map node. Members hang on it, nested like subthreads. It is one continuous line and ends in a rounded elbow into the last member. A sub-map nests on the parent's rail with its own map node and rail.
- **PR stack inside.** The stack mates sit together in a small stack rail inside the group: the PR stack rail of today, a dashed box with a line of PR stops and numbered PR nodes on the rows. The rows show no `1/2` badges.
- **Count.** The count of visible members, sub-map members included.
- **Fold.** The map fold hides the rail and the members. The head stays. The closed state is saved in `thread-tree:closed` under the head id; a map header under a map thread of several maps uses `map:<key>`.
- **Keys.** The map fold and the map header fold are stops. On the map thread row, `o`, `l` and `h` act on the map fold. On a map header, Enter folds and unfolds, and `s` does nothing.

### Flat view

- **One unit.** The head and all members, nested by spawner chain, never split over sections, in every "Group by" choice. The map header shows at the head of the unit, as a run row does. It does not count as a thread in a section header.
- **Group by Status.** The unit goes to the section of its most urgent member, the map thread included. The other members are context rows. As in a PR stack, a row folds when it and all its subthreads are context rows, and a "+N other threads" button shows them. In the waiting sections, the unit sorts by the oldest Wait of its members.
- **Group by None.** The unit sits at its place in the flat order.
- **Group by Linear project.** The unit goes to the section of its head, as in the Linear tree.

### Linear tree

- The map thread places by the Linear placement rules: its key gives the project and milestone, else it is a loose row. The whole group follows it.
- A member whose key is in another Linear project stays in the group (rule 6.0).
- A settled map thread puts the map header at the place the map thread would have. With no map thread, the header goes to the place of the oldest visible member.

### Left out

- Map progress (tickets closed, frontier count). The app reads no `map.md` and no ticket file.
- Map marks in Find and on Triage cards.
- Any change to T3 Code or to the `t3-handoff` and `wayfinder` skills.

## Start workflow

The user can start a **Workflow** from the page. The start opens a dialog, and nothing goes to T3 until the user clicks Start. The server runs `t3 workflow start` like a **Send** runs `t3 thread send`.

### Data

- The `workflows.subscribe` snapshot has `workflows`: `{ name, version, triggers }` for the newest version of each workflow. It also has `definition.revision`. The server reads both. The Exit of `"w"` gives an empty list.
- T3 gives a workflow no title. The name is the title everywhere.
- A project of the shell stream has `workspaceRoot`. The tree has it as `path` on a project branch.
- The tree has `workflows` (null until the first workflows snapshot), `workflowScan` and `t3Origin`.

### Fields scan

- The page fills the payload fields `threadId`, `pr`, `stack`, `threadIds`, `project` and `text`. T3 drops the fields that a payload schema does not name.
- The server calls `workflows.getDefinition` with `{}`. For each file, it looks for each field name as `<name>:` in `source`, not after a word character, `$` or `.`. Each workflow of `files[].workflows` (`name@version`) gets the fields of its file. The result is `fields` of the workflow in the tree.
- The server reads the files again when `definition.revision` changes. A failed read is retried on the next snapshot, and logged once for each error text.
- With no result, `fields` is null. This holds with no read scope, with a failed read, and for a workflow that no file names. A workflow with `fields` null shows in Find only.
- `workflowScan` is the error text of the last failed read, else null. Settings shows it (see "Where it starts").
- A workflow whose triggers are all `webhook …` has `webhookOnly`. Find leaves it out.

### Route

`POST /t3/workflows/start` with `{ workflow, input, key }`. `workflow` and `key` are non-empty strings, `workflow` does not start with `-`, and `input` is a JSON object. A bad body gives `400`.

- The server runs `<bin> workflow start --json --input=<json> --key=<key> <workflow>` with no stdin. It reads `run.runId` from stdout and answers `200 { runId }`.
- The CLI runs through the same path as send. The failures are the same: `503` for a missing CLI, `502` with the last stderr line and the tail for a non-zero exit, a timeout or output with no `run.runId`.
- When stderr says that the `workflow` command is unknown, the error is "Update T3 Code to use workflows".

### Where it starts

Each start point lists only the workflows that fit it.

- **Find.** The footer says "Type `>` to start a workflow". When the query starts with `>`, Find shows only the group "Start a workflow": every workflow that is not `webhookOnly`, filtered by the text after `>`. An item shows the `Workflow` icon, the name in mono, the version and the triggers. With no workflow, the text is "No workflows. Turn on Workflows in T3 Settings → Labs, or add a workflow file." A pick closes Find and opens the dialog with nothing filled.
- **Thread row.** A `Workflow` icon button sits in the row toolbar (see "Row toolbar"), between Send and Focus. Its menu is labelled "Start a workflow". It lists the workflows with `threadId`, and the workflows with `pr` when the row has a PR. It fills `threadId`, `pr` (the newest open PR, else the newest PR) and `project` (the path of the row's project, when it has one).
- **PR stack rail.** The same button in the rail header, for the workflows with `stack`. It fills `stack` with the repo and the PRs of the rail stops, bottom first.
- **Looks done.** A "Start a workflow" button in the dialog footer, for the workflows with `threadIds`. It fills `threadIds` with the checked threads and closes the dialog. It is off when no thread is checked.
- The button is disabled when the `t3` CLI is missing, as the send controls are.
- **Settings.** When `workflowScan` is set, the T3 token fold says "Row menus show no workflows: the app cannot read the workflow files (<error>)." When the error names a scope or an authorization, it adds "Give the token the filesystem:read scope."

### Dialog

A modal like the Send dialog.

- **Header.** The `Workflow` icon and the name. The description is "Starts v<version> on this server." A thread row adds a muted line "For <thread title>".
- **Fields.** One field for each field of the workflow, or all of them when `fields` is null. `text` is a textarea. `pr` is a select of the row's PRs when the row has more than one, else a mono input `owner/name#123`. `stack` is a mono input `owner/name #1 #2`, bottom first. `threadIds` is a mono input, comma separated. A field that the start point filled shows "· from the row" after its label.
- **Payload.** An empty field is left out. `pr` becomes `{ repo, number }`, `stack` becomes `{ repo, prs }` and `threadIds` becomes a list. A value that does not parse shows a line under the field and turns Start off.
- **Advanced.** A fold with a JSON box. While the user has not typed in it, it shows the payload of the fields. After an edit, its text is the payload, and the fields are off. A JSON error or a non-object turns Start off and shows the error.
- **Start.** Button with a key hint, `⌘↵` or `Ctrl+↵`, from any field. While the call runs, the fields are off, the button shows a spinner and "Starting", and the dialog cannot close. A failure shows the error alert above the footer, and the dialog stays open.
- **Key.** `<workflow>/<context>/<ms>`. The context is `pr-<owner>-<repo>-<n>` (the row's newest PR, for a workflow with `pr`), `stack-<owner>-<repo>-<bottom>`, `thread-<id>`, `threads-<count>` or `none`. `<ms>` is the time at which the dialog opened. A second Start in the same dialog sends the same key, and T3 answers with the same run. A new dialog makes a new key.

### After a start

The dialog closes. A toast says "Started <workflow>" with "Show in tree", for 10 s. The button scrolls to the run row and flashes it. A new run has no row until it has a step thread (see "Runs in the tree"). Then the button opens `<T3 origin>/workflows?run=<runId>` in a new window.

### Demo stub

The demo has four fake workflows and a fake file scan: `review-pr` (`pr`, `text`), `land-stack` (`stack`), `digest` (`threadIds`, `text`) and `sentry-hook` (webhook only). The stub CLI answers `workflow start` after 1 s with a new run id. An input that holds "fail" gives a payload error. `WF_OLD=1` gives the unknown command error. `WF_SCAN=off` makes the file scan fail, with a scope error.

## Launched-thread lineage

Source: [Can the spawner of a launched thread be recovered?](.wayfinder/tickets/002-recover-launched-lineage.md), [Standalone webapp or a view inside T3 Code?](.wayfinder/tickets/003-standalone-or-in-t3.md), research on branch `research/launched-lineage`.

A thread that an agent starts with `t3_thread_launch`, `create_threads` or `delegate_task` has no native parent. Its **spawner** is found in `statev2.sqlite`:

1. **First:** `senderThreadId` on the thread's first user message in `orchestration_v2_projection_messages` (`message_id = thread_id` for a launch). This is a primary-key lookup. When both sources exist, they agree.
2. **Full scan:** the caller's `dynamic_tool` row in `orchestration_v2_projection_turn_items` with `status = 'completed'`, where `toolName` ends in `t3_thread_launch`, `create_threads` or `delegate_task`. Parse `payload_json.output.content` as JSON. The new id is in `threadId`, `threads[].threadId` or `childThreadId`. The row's `thread_id` is the spawner. Do not match the child id as a substring.

Run the lookup when the backend first sees a top-level thread whose id contains `mcp:` or `mcp%3A` (`t3_thread_launch` gives `mcp:…`, `create_threads` gives `thread:mcp:…`, `delegate_task` gives `thread:delegated-task:command%3Amcp%3A…`), in the snapshot or in `thread.updated`. Cache the result in memory. A thread that arrives before its first message is written gets a short retry. The full scan reads every launch tool call (seconds on a cold disk, no index), so it runs in a Worker, and only when a thread with no sender message is on a requested view: an active thread or its spawner chain, or any thread once the page asks for the settled list. Keep the SQLite code in one module.

## Tree rules

Source: [Tree model rules for the nested tree](.wayfinder/tickets/004-tree-model-rules.md), changed by [Rough tree UI on a real snapshot](.wayfinder/tickets/005-rough-tree-ui.md).

A **top-level thread** has no native `parentThreadId`. A **subagent** has `relationshipToParent: subagent`. The backend applies these rules and builds the whole tree.

1. **Visible.** A top-level, non-archived thread is visible when `settledAt` is null, whatever its status. No recency window applies. Settled threads are never in the tree. A step thread (a thread with `workflowRun`) is never a top-level thread; it shows only under its run (see "Runs in the tree"). The settled toggle shows them in the Settled list.
2. **Subagents are not shown.** The tree holds top-level threads only. It shows no subagent rows, counts or signals.
3. **Snoozed** threads stay visible, unless "Show snoozed threads" is off. They are shown muted, with their wake time. When it is off, a page filter hides them. A snoozed thread with a visible subthread stays as a muted context row.
4. **Issue key:** the first match of `/\b[A-Z][A-Z0-9]+-\d+\b/` in the title of a top-level thread. `Review #15708 JED-4319` gives `JED-4319`.
5. **Visible spawner:** start at the thread's spawner and go up the spawner chain. Skip threads that are not visible, and stop at the first visible one. If no thread in the chain is visible, the thread has no visible spawner.
6. **Placement.** A thread is always placed in its own `projectId`, except a **Map member**, which goes into its map group (rule 6.0, see "Map groups"). This rule outranks all the others. Else apply the first rule that matches:
   1. A title that starts with `Review #` goes under `Project › Reviews › <key>`, or `Project › Reviews › No issue key` if it has no key.
   2. A keyed thread goes under `Project › <key>`.
   3. A keyless thread in a PR stack goes under `Project › PR stack #<n>`, where `<n>` is the bottom PR of the stack. All keyless threads of one stack share this group, and it gets the stack rail. A stack outranks the spawner.
   4. With launch nesting on, a keyless thread with a visible spawner in the same project nests under that spawner. Launch nesting is a page setting, off by default; the page sends it as `nest=1` on `/events`.
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
   - The user can reorder project cards, key groups (a stack run moves as one block), review groups and top-level threads by drag. A map group moves as one block with its head (see "Map groups"). The page stores the order of each list in `localStorage`. An id that is not in the stored list goes after the stored ones, in base order. Ids that no longer exist drop out. Reviews and No issue key stay last. Subthreads keep the base order. No drag crosses lists.
   - A save keeps only the ids of the current view. Settled threads are never in the view, so they are never in the stored order.
   - A live push during a drag does not change the dragged list until the drop.

## UI

The page shows an outline tree: Project, group, thread. Each thread row has a status icon, a title link to `t3code://threads/<environmentId>/<threadId>`, a stack badge, PR links and, when a PR has a Watched label, a Label pill (see "Label pills"). A row that waits on the user (needs input, plan ready or your turn) shows its phrase and the Wait beside the icon, for example "Approval 12m". The Wait is the time since `since`. A guest message has no `since`, so it shows the phrase only. A failed row shows "Failed" with no time. Other rows show no text. This reverses `d602e6e` (#18) for these rows only. The row end keeps the age of `updatedAt`. Closed rows are saved in `localStorage`. A toggle shows the Settled list below the tree or the flat list. A toggle "Show snoozed threads" hides snoozed threads when it is off; it saves `"0"` under `thread-tree:snoozed`, and it is on by default. It changes the page only: the Needs-you count, the Dock badge and the notifications do not change, and the server gets no parameter. A second toggle turns on launch nesting. When a Linear workspace is set, an issue key links to its Linear issue. With team keys set, only a key of a listed team links. The Settings panel keeps the workspace and teams in `localStorage`; `LINEAR_WORKSPACE` and `LINEAR_TEAMS` give the default. A banner shows when T3 is down, when no token is set, or when T3 rejects the token. The token banners open the Settings panel.

The header holds the title, the filter ("All", "Needs you"), "Open next", "Focus", "Triage", a sort menu ("Manual", "Last updated"), a Tree / Flat switch, a "Group by" menu ("T3 project", "Linear project" in the tree; "None", "Status", "Linear project" in the flat view), in the tree a fold all button beside it, and a Settings button (a cog). The "Needs you" chip shows the Needs-you count as a badge. Then it shows the your-turn count as a muted number. A "·" sits between them when both show. Each count shows only when above 0. The tooltip reads "N need you, M your turn". The cog opens the Settings panel on the right, beside the tree. Its header stays in view while the panel scrolls, and Escape closes it. The panel has three groups. "Updates" (desktop app only) has the version, the update state and its action. "View" has show settled, show snoozed, nest launched threads, show key hints, reset order (it clears the tree order and the Linear tree order) and the theme as three icons (Light, System, Dark). "Setup" has seven folds, closed at first: T3 token, Linear links (the workspace and team keys, and an API key field with its own Save, see "Linear grouping"), Catch-up (see "Catch-up fold"), Local model (see "Model picks"), Watched labels (see "Label pills"), the status icon legend and Keys. A fold shows its state at the right: green text when set, yellow text with a warning sign when not set (Local model shows "Checking…" in neutral text until the first `GET /local-model` answers, then "Ready", or "Not reachable", "Model not found" or "Not set" in yellow; Watched labels shows a neutral "None" instead), a blue info icon for the legend and for Keys. The Keys fold lists `j k ↑ ↓` Move, Enter Open, `o` Details or fold, `l h` Expand, collapse, `s` Send, `n` Open next, `t` Triage, ⌘K (Ctrl+K off macOS) Find, and `1`–`3` Open a Focus slot, each key as a `Kbd` (the shadcn component). The token banners open the panel with the T3 token fold open. When the panel opens in the desktop app, it checks for updates, but not when the last good check is less than 60 s old.

The tree choice of the "Group by" menu is saved under `thread-tree:tree-group` (`"t3"` or `"linear"`). "Linear project" is disabled unless the key state is `ok`, and the tree shows T3 projects while the state is `no-key`. While the tree groups by Linear project and the key state is `rejected`, a banner reads "Linear rejected the API key." Its "Set the key" link opens the panel with the "Linear links" fold open. The tree keeps the last good data.

With "Linear project", the page sends `linear=1` and shows the Linear tree (see "Linear grouping"). A Linear project header has the project icon, the name, a link to the Linear project and the thread count. A milestone header has the name, the target date in muted text ("Dec 4", read as UTC) and the count. A fallback group header has the name, the count and a neutral left edge. Reviews has its eye icon. A thread row shows its issue key as a chip and its T3 project as a muted chip (an icon only on a phone). Projects drag. Keyless threads show as loose rows after the groups, with no header and no fold. Threads drag inside a milestone, in "No project" and in the loose rows. Milestones do not drag. The order of the Linear tree is saved under `thread-tree:order-linear`, apart from `thread-tree:order`. "Last updated" keeps the project and milestone order and sorts only the threads. Find and Up next show the T3 project of a thread.

A pending request wins over snooze. A snoozed thread with a pending request shows as needs input.

The sort menu keeps its choice in `localStorage` under `thread-tree:sort`. "Last updated" sorts by `lastRun` of the thread node: the newest of `activityRunStartedAt` (the start of the working run), `latestRunStartedAt` and `latestRunCompletedAt`. It is never `updatedAt`, which changes about once a second while a thread works. The page sorts the arranged tree. Projects keep their order; Reviews stays first and No issue key last; groups and threads sort newest first, and a group or PR stack sorts by its newest thread, subthreads included. A thread with no run sorts last. Ties keep the manual order. Drag is off in "Last updated".

The flat view lists all threads of all projects in one list. The switch keeps its choice in `localStorage` under `thread-tree:layout`, and "Group by" under `thread-tree:group`. With "Group by Status", each section header is a fold button. A closed section keeps its header and its count, and shows no rows, so its rows have no drag. The closed sections are saved as a JSON list of section keys under `thread-tree:sections`. With no saved list, "Idle and snoozed" and "Done" are closed. A new thread does not open a closed section. The "Needs you" filter and the sort keep the folds. "Group by None" has no folds. The flat list has no fold-all button. Drag works with "Manual" sort and is off in "Last updated". The flat list keeps its own order in the stored orders (`thread-tree:order`, list key `flat`), so "Reset order" clears it. It starts as the tree order, flattened, and a new thread goes last. A flat drag never changes the tree order, and the reverse. With "Group by Status", a row drags only inside its section; all sections share the one flat order. A stack run is one block, and subthreads stay under their parent. "Manual" keeps the tree order, flattened. "Last updated" sorts the whole list. "Group by Linear project" makes sections from the Linear tree (see "Linear grouping"). "Group by Status" makes sections in this order: Needs input, Plan ready, Your turn, Failed (`failed`, `interrupted`), Working (`working`, `starting`, `waiting`), Idle and snoozed, Done. A section with no thread is hidden. A unit (a thread, a stack or a map group) goes to the section of its most urgent thread, subthreads included. Settled threads do not pull; a unit with only settled threads goes by all of them. With "Group by Status", Needs input, Plan ready and Your turn sort by Wait, oldest first, with both sort choices. A row with no Wait goes last, and a unit sorts by the oldest Wait of its threads in the section, subthreads included, settled threads left out. Drag is off there. The stored flat order does not change, so a row that stops waiting goes back to its place. A **context row** is a thread row in a section whose status is not one of the section's statuses, or that is settled. A section header counts the threads that match the section, subthreads included, settled threads left out. A context row shows muted title text. In a PR stack or a map group, a row folds when it and all its subthreads are context rows. The rail header then shows a "+N other threads" button that shows and hides them. The open state is not saved. Saved tree folds stay unchanged.

**Open next** opens in T3 the thread, Run question or Paused run that has waited longest. The page owns the target and the skip memory; the button, the key `n` and the menu-bar item share them.

- **Target.** The queue holds all threads of the server's tree, subthreads included, with status `needs-input`, `plan-ready` or `your-turn`, not settled. The filter, "Show settled", folds, layout and sort do not change it. The queue sorts by `since`, oldest first, no `since` last. Ties keep the server's tree order, not a saved manual order.
- **Skip memory.** The page keeps, in memory, the threads it opened, keyed by thread id plus `since`. The target is the first thread of the queue that is not in the memory. A new Wait of a thread (a new `since`) makes it a target again. When all threads were opened, the target is the top thread, and the memory starts again with that thread only.
- **Button.** It sits after the filter, with an icon and "Open next". At phone width it shows the icon only, with an `aria-label`. The tooltip is "<phrase> · <title> · <Wait>" ("Run question" or "Paused run" as the phrase of a run item); the Wait part is left out when `since` is null. With no target, the button is disabled and the tooltip is "Nothing waits".
- **Key `n`.** It is a page key (see **Page keys**). It does nothing with no target.
- **Opens.** It goes to `t3code://threads/<environmentId>/<threadId>`, the same URL as the row link. It writes nothing to T3.

**Focus list.** A "Focus" button after "Open next" shows the count (`2/3`) and shows or hides the strip. The strip is hidden by default. The page keeps this choice under `thread-tree:focus-show` (`"1"` or `"0"`) and the entry ids under `thread-tree:focus` (a JSON list of at most three thread ids). The strip sits above the tree. Its heading reads `Focus N of 3`, with `· full, remove one to add another` at 3 of 3. It has three fixed slots; the filled slots come first, and a remove closes the gap. At phone width (720px and less), the slots stack and the empty slots after the first one hide. A card shows the status icon, the phrase (with the Wait for a thread that needs the user), a remove button, the title, an **Open** link and **Show in tree**. A slot whose thread is not in the loaded tree shows "Not loaded" with a remove button; it counts toward the three.

- **Prune.** An entry leaves the list when its thread is settled or no longer in the tree. Only a tree with connection `up` prunes, so a down or loading tree never clears the list.
- **Add.** A crosshair button in each thread row (not in a settled row) adds the thread; it stays visible and pressed on a listed row and removes it. At 3 of 3 the add buttons are disabled with the tooltip "Focus is full (3 of 3). Remove one first."
- **Drag.** A thread row dragged by its handle onto the strip adds the thread on an empty slot. On a filled card, the card asks "Replace with <title>?" with Replace and Cancel; Escape and a click outside cancel. A thread that is in the list already changes nothing. A drop on the strip does not reorder the tree; the page remounts the tree list after such a drop. A row drags only where its handle shows: "Manual" sort, a list of two or more units, not on a PR stack rail, and not in the waiting sections of the grouped flat view. The crosshair button covers the other rows.
- **Show in tree.** It first unfolds the path to the row and stores the folds: in the tree, the project, the groups and the PR stack on the path; in the flat view with "Group by Status" or "Group by Linear project", the shut section that holds the thread. It then scrolls to the row (instant with reduced motion), and the row flashes for about 1.5 s. When the row is still not visible (the "Needs you" filter, hidden snoozed threads, or a row behind the "+N other threads" button of a flat PR stack, whose open state is local and not saved), the button reads "Hidden in the tree" for a few seconds.
- **Row buttons.** All row buttons show a pointer cursor; a disabled one keeps the default cursor.

**Triage mode.** A card at the top of the list walks the Open next queue one item at a time. The queue is the Open next queue. A Run question or a Paused run has its own card (see "Run questions").

- **Button.** A "Triage" button after "Focus" shows the queue count. The key `t` and the button open and close it. At phone width, the button shows its icon only. With an empty queue it still opens and says "Nothing waits".
- **Round.** Each open starts a round. The card in hand stays until the user acts, also when the queue changes. A thread that leaves the queue while its card shows gets a dashed "No longer waits" note with a "Next" link. A thread that joins the queue shows as "+K new". "Skip" sends the thread out of the round. Sent, settled and snoozed threads count as done.
- **Card.** The card is sticky at the top of the list. It shows the status, the phrase, the Wait, "N of M", the title link, the Catch-up line, "Show last message" (`space`), the chips, the reply field, the actions and a "Next:" line with the next three titles. When the card changes, the tree scrolls to its row.
- **Chips.** The Catch-up options come first. A your-turn thread then gets the PR rule chip, "Fix PR #N" or "Merge PR #N". A chip only fills the field. The keys `1` to `9` pick a chip.
- **Approval.** A thread that waits for an approval has no field and no chips. The card says that T3 does not take an approval as a message, and offers "Open in T3".
- **Send.** The field sends with Cmd/Ctrl+Enter or the button, through `POST /t3/send`. The button is disabled without a t3 CLI. On success the round goes to the next card. On failure, the error shows on the card and the card stays.
- **Actions.** "Settle" (`e`) calls `POST /t3/settle`. "Snooze" (`z`) opens a menu: "1 hour", "Tonight 18:00" (only before 18:00) and "Tomorrow 09:00", in local time. A pick calls `POST /t3/snooze`. "Focus" (`f`) adds the thread to the Focus list, and is disabled when the list is full or holds the thread. "Open in T3" (`o`) skips the thread, then opens it. "Skip" (`j` or →) goes to the next card.
- **Keys.** The letters act only when no field has focus. `r` focuses the field. In the field, only Esc acts: it leaves the field. Esc closes Triage mode. A dialog, a menu or Find open pauses the keys.
- **End.** With no thread left, the card says "Nothing waits" with the counts of sent, settled and snoozed threads. "Start again" brings the skipped threads back. Below the counts, the "N look done" button of Looks done shows when threads look done. It opens the same dialog.

**Looks done.** An offer to settle in one step the threads that look finished. The rule is `looksDone` in `src/page/looks-done.ts`.

- **Candidate.** A thread of the tree, subthreads included, that is not settled. Its status is `your-turn`, `done` or `idle`. Its `lastRun` is set and older than 1 h. It is not pinned (`detail.pinned`), not in the Focus list and not in the skip list. No subthread has the status `working`, `starting`, `waiting`, `needs-input` or `plan-ready`.
- **Reason.** A thread with 1 or more PRs, all merged or closed, has the reason `prs`. Else a Catch-up with `state` `done`, `doneLike` and a `pick` other than `local` gives the reason `catch-up`. A thread with no reason is not offered. The Local model never gives a reason. The Apple model does.
- **Views.** Every node of the tree is a T3 top-level thread, so the T3 tree and the Linear tree offer the same threads. The subthread rule reads `children`, so it sees a launched thread only while it nests. Map members always nest, so a busy member holds back its map thread in both trees. With Launch nesting on, a keyed thread with a busy keyless launched thread is held back in the T3 tree and offered in the Linear tree. A subagent is not in the tree: a thread that waits for one has the status `waiting`.
- **Chip.** A "N look done" button after "Triage" (icon `CircleCheckBig`). It is hidden at 0. At phone width, it shows the icon and the count. The tooltip reads "N threads look done".
- **Dialog.** One row for each thread: a checkbox (checked), the status icon, the title, the project and the reason, "N PRs merged" (or "merged or closed") or "Catch-up: <did>". The rows stay while the tree changes. "Settle N" (N is the checked count) is disabled at 0. "Cancel" closes the dialog.
- **Settle.** One `POST /t3/settle` for each checked thread, one after the other. A thread that failed stays in the dialog with its error and stays checked, and the dialog stays open. With no failure, it closes.
- **Skip list.** `localStorage` key `thread-tree:looks-done-skip`: a list of thread id and `lastRun`. "Settle N" adds an entry for each unchecked thread. "Cancel" writes nothing. A new `lastRun` makes an entry stale. The page removes stale entries, and the entries of threads that left the active tree, while the tree is live. A thread that was settled by hand and later unsettled is offered again.
- **Undo.** After a settle, a toast "Settled N · Undo" shows for 10 s. "Undo" sends `settled: false` for each thread that settled.

**Find.** The key Cmd+K (Ctrl+K off macOS) opens a dialog: a search input on top, the results below. It is full screen at phone width. It is a shadcn `Command` (`cmdk`) in the `Dialog`, with `shouldFilter={false}`: the match decides the results. Escape or a pick closes it, and the query clears.

- **Set.** Every thread of the loaded tree, subthreads included. The filter, the folds and hidden snoozed threads do not limit it. Settled threads come in only through the settled search.
- **Match.** `find` in `src/shared/find.ts`, shared by the page and the server. It is case-insensitive. The query splits on spaces, and every word must be a substring of one field: title, issue key, project label, `detail.branch`, or the PR numbers written as `#123 #456` (so `123`, `#123` and `12` match PR 123). A word scores 0 when it is in the issue key or starts the title or a title word, else 1. The order is the sum of the scores, then tree order. An empty query matches nothing. There is no fuzzy match.
- **Row.** The status icon, the full title (it wraps), and at the right the Wait text as in the tree (`phrase · age` for a thread that needs the user, the phrase only with no `since` or for a failed thread), else the age of `updatedAt`. A muted second line shows project, issue key and branch, and "in <parent title>" for a subthread. There are no PR badges. A settled result has a muted title.
- **Actions.** Enter or a click opens the thread in T3, like the row link, and closes the dialog. **Show in tree**, a row button and Shift+Enter, closes the dialog, then runs the Show in tree of the Focus list (unfold the path, store the folds, scroll, flash). A result that a view setting hides ("Needs you" filter, hidden snoozed) and a settled result have no Show in tree. Find never changes a view setting.
- **Settled search.** With a query, the last row is "Search settled threads". A pick calls `GET /find?q=<query>`. The server runs `find` over the settled threads of the settled tree and returns `{ t, project, parent }` rows, with `t.children` empty. The rows show in a "Settled" group below the active ones. For the rest of the dialog session, a change of the query fetches the group again after 200 ms, and a newer query cancels the older request. On close, Find goes back to active threads only. A missing or blank `q` gives `[]`.
- **Empty and no match.** An empty input lists the Focus threads, then the most recently updated threads, up to 8 in all ("Recent"). With none, an icon state reads "Find by title, issue key, project, branch or #PR". With no match, an icon state reads "No thread matches", plus the "Search settled threads" row when it applies.

**Page keys.** One `keydown` handler holds all page keys (`pageKey` in `src/page/keys.ts` decides). A plain key does nothing with a modifier, on key repeat (except `j`, `k`, ↑ and ↓), when the event is handled, while focus is in an input, a textarea or a contenteditable element, while the Settings panel is open, and while Find, a dialog, an alert dialog, a menu or a listbox is open.

**Row keys.** A stop is an element with `data-stop`: the title link of each visible thread row, and the fold button of each project, group, PR stack, map header and flat section. Focus is real DOM focus, and the tab order does not change. The stop list is the stops in DOM order inside the list. It skips an inert row, a row in a closed fold and a hidden row. `j` and `k` focus the next or previous stop, and do nothing at the ends. With no stop focused, the first one focuses the first stop that lies inside the list view. ↑ and ↓ do the same only when a stop has focus, and call `preventDefault` only when they move, so the page scrolls otherwise. A move scrolls the stop into view only as needed. On a thread stop, Enter opens the thread (the link), and `s` opens the Send dialog for the row when the `t3` CLI is available. On a header, Enter folds or unfolds, and `s` does nothing. `o` toggles the details of a thread (the map fold on a map thread row) or the fold of a header, `l` opens them and `h` closes them, as in vim. `l` on an open fold and `h` on a closed fold do nothing. The drag handle is not a stop. While a stop has focus, the page keeps its id and index. When a render moves the row and focus is lost, focus returns to the row. When the row leaves, focus goes to the stop at the old index, or to the page when no stop is left. When a fold closes with focus inside it, focus goes to its header. The focus ring is an inset outline on the row or header, not only on the link or button.

- **`n`.** Open next.
- **`t`.** Opens Triage mode. While Triage mode is open, the page keys stop, except Cmd+K.
- **`1` to `3`.** Open in T3, like its card, the thread of that Focus slot. An empty slot, or a thread that is not loaded, does nothing.
- **Cmd+K (Ctrl+K off macOS).** Opens Find, also from a text field. It calls `preventDefault`. It does nothing while another dialog or a menu is open. In the open Find dialog it closes Find.
- **`/`.** Not a page key.

**Key hints.** No key hint shows at first. `useKeyHints` (`src/page/key-hints.tsx`) and `holdRule` (`src/page/key-hints.ts`) set `data-key-hints` on `<html>` after the user holds Alt/Option alone for 300 ms. The hold hides on Alt key up, on any other keydown, on pointerdown and on window blur. A shorter tap shows nothing. A repeated Alt keydown does not hide. Alt with Cmd, Ctrl or Shift starts no hold. The hold calls no `preventDefault` and changes no key. Every key hint floats (`position: absolute`, `pointer-events: none`) and takes no space, so no element moves. The hints are: `n` and `t` on the header buttons (hidden at 720 px and below), the slot number on each Focus card, `o Details` and `s Send` on the thread row that has a stop in focus (`s` only when Send is available), the key of each control in the Triage card, and a bar over the bottom of the Find list (`↑↓ Move`, `↵ Open`, `⇧↵ Show in tree`, `esc Close`). The "Show key hints" switch in the View group sets `thread-tree:key-hints` (on by default). Off, the hold does nothing. A touch device (`(hover: none), (pointer: coarse)`) has no hold and no hints. The ⌖ button in a Find row always has the tooltip "Show in tree (Shift+Enter)".

The header has a System / Light / Dark choice. The full design is in [DESIGN-SPEC.md](DESIGN-SPEC.md).

## Live updates

1. The backend keeps the thread map from the stream.
2. On each change, it builds the whole tree again, after a short debounce.
3. It pushes the tree as JSON on `GET /events`. The tree has no settled threads. It carries a `settled` signature: the count, the newest settle and the newest update of the settled threads. When the signature changes, the page fetches its loaded Settled rows again. `GET /settled?after=&limit=` returns `{ items, next, total }`: the settled threads, newest settle first, each with its project. `after` is the `next` of the previous page. `limit` defaults to 50 and clamps to 1..1000. `next` is null on the last page.
4. The page renders each tree it gets. It does not apply diffs.
   - **Recovery** (`src/page/live.ts`). The server pushes at least every 30 s. With no push for 75 s, the page closes the stream and opens it again. When the browser closes the stream for good, the page opens it again after 1 s × 2^attempt, at most 10 s. A push resets the attempt count. While the stream is down, a banner says "Live updates stopped: the rows can be out of date. Reconnecting… Last update HH:MM." Its "Reconnect now" button opens the stream again at once. The first push hides the banner.
5. `Bun.serve` closes a connection after 10 s with no bytes. Call `server.timeout(req, 0)` on the SSE request.
6. Stop the push timer when the client disconnects.
7. The page also sends `nest=1` (launch nesting) and `labels=<names>` (the Watched labels, see "Label pills"). The backend builds one tree for each set of parameters and sends it to all connections with that set.
8. The page also sends `linear=1` when it needs the Linear project and milestone of each thread (see "Linear grouping"). `linear=1` is part of the set of parameters.

## Linear grouping

### Linear source

The server knows the Linear project and milestone of each issue key in the tree. The grouping in the page uses this data.

- **API key.** The user pastes a personal API key in the API key field of the "Linear links" fold. The page sends `POST /linear-key` with `{"key": "…"}`. The request is JSON only, like `/token`. The server answers 415 without JSON and 400 for a bad key (one line, at most 4096 bytes). Else it writes the key to the key file (mode `0600`), uses it at once and answers 204. The server never sends the key back.
- **Key file:** `LINEAR_KEY_FILE`, else `~/.config/t3-thread-tree/linear-key`. When the file holds no key, `LINEAR_API_KEY` from the env is the fallback. The desktop app sets `LINEAR_KEY_FILE` to its data folder.
- **Key state.** The tree carries `linearKey`: `no-key` with no key, `rejected` after Linear refuses the key, else `ok`. The fold shows the workspace text, only when a workspace is set, then "Key set" (green), "Key not set" (yellow) or "Key rejected" (yellow), joined with " · ".
- **Request.** `POST https://api.linear.app/graphql` with the header `Authorization: <key>` and no `Bearer`. One batch asks `issues(filter: { id: { in: $keys } }, first: 250, includeArchived: true)` for `identifier`, `previousIdentifiers`, `project { id name url }` and `projectMilestone { id name targetDate }`. A key matches a node by `identifier` or by `previousIdentifiers`. More than 250 keys go in pages. A key that the batch misses gets one `issue(id:)` call, for an issue that moved to another team. A key whose number has a leading zero, like `AB-00012`, always gets an `issue(id:)` call, because Linear refuses a whole batch with such a key. A batch that Linear refuses with `INVALID_INPUT` or `INPUT_ERROR` sends its keys to `issue(id:)` calls. A key that Linear does not know has no project.
- **Cache.** The server keeps the answers in memory, like the label store. The rule is a pure module with no network (`src/server/linear.ts`). The network calls are in `src/server/linear-api.ts`.
- **Refresh.** The server fetches only while a connection sends `linear=1`. It fetches the keys it has not tried yet when the key set of the visible threads changes. It sends every key again each 10 min, and when the user saves a key, also with no page that sends `linear=1`. It does not fetch on a T3 `updatedAt`. One fetch runs at a time. A new answer that changes the data, or the key state, pushes the tree.
- **Fallbacks.** No key: no fetch. HTTP 401 or `AUTHENTICATION_ERROR`: keep the data, report `rejected`, and fetch again only after the user saves a key. HTTP 429 or `RATELIMITED`: keep the data, and fetch all keys again after `Retry-After` seconds (60 s when it is missing). This retry runs once even with no `linear=1` page, because it follows a fetch on save or a full refetch. A network error or a 5xx: keep the data. The next 10 min refresh tries again. A key that was tried and failed is not sent again until then. An answer to an older key is dropped.
- **Tree data.** With `linear=1`, each thread carries `linear` for the first issue key of its title: `{ project, milestone }`, each `null` when the issue has none. `linear` is `null` with no key, no answer yet, or no `linear=1`.

### Tree

With `linear=1`, the server builds `projects` with `buildLinearTree`, not `buildTree`. The levels are Linear project, then milestone, then thread. There is no T3 project level and no issue-key level. Each thread node carries `t3Project` (`{ id, label }`), the T3 project of the thread, also on nested threads. Other users of the tree (`/find`, `/settled`) never send `linear=1`.

- **Stack placement.** A PR stack stays whole. The lowest stack member that has an issue key and is not a review places the full stack. Each other stack member that is not a review uses the key of that member in the rules below. A stack with no keyed member places as a keyless stack.
- **Placement.** A **Map member** goes into its map group, which follows its head (see "Map groups"). Else the first match wins.
  1. A title that starts with `Review #`: Reviews.
  2. A key with a Linear project: that project, then its milestone, else "No milestone".
  3. A key with no Linear project, no answer yet, or an issue that Linear does not know: "No project".
  4. No key, in a PR stack: a loose row. A stack outranks the spawner.
  5. No key, not in a stack, launch nesting on, and the visible spawner has no key and is not a review: a child of the spawner. The spawner is a loose row, or nested.
  6. Else a loose row.
- **Launched by.** A thread that has a spawner and does not nest under it gets `launchedBy`, as in the T3 tree. A keyless thread whose spawner has a key is a loose row, not under the spawner.
- **Fallback groups.** After the Linear projects, in this order: Reviews, "No project", then the loose rows. A group with no thread is left out. Reviews keeps one subgroup per issue key, in first-seen order.
- **Loose rows.** Keyless threads have no group header. They come last, as rows with no fold. The server sends them in one branch with the id `lf:loose` and an empty label.
- **Order.**
  - Projects sort by their oldest thread.
  - Milestones sort by target date, soonest first, then milestones with no date, then "No milestone". The oldest thread breaks a tie.
  - Threads in a group sort by creation time. Nested threads sort the same way.
  - Stack mates sit next to each other in stack order, at the place of the oldest mate.
  - Each thread sorts and drags alone inside its milestone. So "Last updated" and a drag in the page can separate stack mates.
- **Headers.** Project: name, project URL, thread count. Milestone: name, target date, count. Fallback group: name and count. The server sends no count.
- **Ids.** These ids feed the fold store and the order lists. They never clash with the T3 ids `p:` and `g:`.

  | Branch               | Id                    |
  | -------------------- | --------------------- |
  | Linear project       | `lp:<projectId>`      |
  | Milestone            | `lm:<milestoneId>`    |
  | No milestone         | `lm:<projectId>:none` |
  | Reviews              | `lf:reviews`          |
  | Reviews key subgroup | `lf:reviews:<key>`    |
  | No project           | `lf:none`             |
  | Loose rows           | `lf:loose`            |

- **Payload shape.** Every top-level branch and every milestone branch has `linear`. A project has `linear.url`. A milestone has `linear.date` (`"YYYY-MM-DD"` or `null`). A fallback group has `linear: {}`. A branch of the T3 tree never has `linear`. A fallback group has an id that starts with `lf:`, so the page tells it from a project. Projects have milestone branches in `branches` and no `threads`. Milestones and fallback groups hold the threads. Reviews holds its key subgroups in `branches`.

### Flat

The flat view has a third "Group by" choice, "Linear project", saved under `thread-tree:group` as `"linear"`. It is disabled unless the key state is `ok`. While the key state is `no-key`, the flat view shows "None" and the saved choice stays. While the choice is on, the page sends `linear=1` and the sections follow the Linear tree.

- **Sections.** One fold section per milestone, headed "Project · Milestone" or "Project · No milestone", with the target date in muted text beside the name. Then Reviews and "No project". The order is the order of the Linear tree. A section with no thread is hidden.
- **Loose rows.** Keyless threads come last, as rows with no header and no fold, below a thin divider line. They drag among themselves.
- **Units.** A thread goes to the section that holds it. Reviews keeps one section for all its key subgroups. The Linear tree keeps a PR stack in one milestone, so all its threads are in one section. A map group is one unit in the section of its head. Each thread is one row.
- **Count.** A header counts all threads of its rows, subthreads and settled threads included, as the Tree does.
- **No context rows.** A section groups by place, not by status. So no row shows muted, no PR stack folds, and no "+N other threads" button shows.
- **Rows.** A row shows its issue key as a chip and its T3 project as a muted chip, as in the Tree. It shows no Linear project column.
- **Folds and drag.** As "Group by Status": a header is a fold button, closed sections save in `thread-tree:sections`, a row drags only inside its section, and all sections share the one flat order. That order is saved under `thread-tree:order-linear`, key `flat`. A new section starts open.

## Label pills

Source: map [pr-label-pill](.wayfinder/pr-label-pill/map.md), tickets [Where do PR labels come from, and how fresh are they?](.wayfinder/pr-label-pill/tickets/001-label-data-source.md) (research on branch `research/pr-label-source`), [How does a Label pill read in the row?](.wayfinder/pr-label-pill/tickets/002-label-pill-look.md) (prototype on branch `prototype/label-pill-look`), [How does the Watched labels section in Settings work?](.wayfinder/pr-label-pill/tickets/003-watched-labels-setting.md).

A Tree or Flat row shows a **Label pill** when one of its PRs has a **Watched label**. The user sets the Watched labels in Settings. The list is empty by default, so no pill shows until the user adds a name.

### Watched labels setting

- **Fold.** Settings › Setup, after "Local model", before "Status icons". Label: "Watched labels". State text: the names joined by ", ", green. With an empty list: "None", neutral tone, not a warning.
- **Form.** One text field, label "Label names", placeholder `ready-for-review`. Hint: "Separate names with commas. A row shows a pill when one of its PRs has one of these labels. Empty: no pills." A Save button and the "Saved." text, as in the Linear form.
- **Parse.** Split on commas, trim the spaces at the two ends of each name, and drop empty names. Keep the order: it is the order of the pill.
- **Storage.** Page storage, key `thread-tree:labels`, the names joined by ",". No server env value. One list for all repos.
- **Stream.** The page sends the list on `/events` as `labels=<names>`, URL-encoded, only when the list is not empty. A change of the list opens the stream again, as a change of `settled` does.

### Match

A PR label matches a Watched label when the two names are equal, case-insensitive. No substring match.

### Labels from T3

The shell stream has no labels. The server reads them with the T3 RPC `pullRequests.detail` on the open shell socket. The `orchestration:read` token can call it.

- **Decode.** Each PR link keeps `host` and `repository` from the stream (empty when the link has none), and the snapshot `updatedAt` (empty with no snapshot). A label with no string name is dropped from an answer.
- **Call.** A unary Effect RPC `Request` on the shell socket, with its own request id, tag `pullRequests.detail`, and payload `{ projectId, repository, number, host, allowStale: false }`. `projectId` is the thread's. The answer is an `Exit` frame with that request id; its value holds `labels: { name, color, description? }[]` and `updatedAt`. An `Exit` for a detail request does not close the socket; only the `Exit` of the shell request does.
- **Which PRs.** Open PR links with a source other than `stack` and `stack-dismissed`, on top-level threads that are not settled and not archived. These are the PRs that a row can count.
- **When.** Only while at least one connection sends a non-empty `labels` list. The server keeps, per PR (`host`, `repository`, `number`), the snapshot `updatedAt` of its last call. It calls `detail` for a PR when that value differs from the snapshot `updatedAt` on the stream, or when it has no value. This covers the first snapshot, a new PR, a label change on GitHub (it moves `updatedAt`), the first client with a list, and a reconnect (a fresh snapshot with the same `updatedAt` makes no call). A link with no snapshot yet has the value "": it gets one call, then the next call comes when its snapshot arrives. The server saves the value when an answer comes, also a failed answer, and not when a call starts. A call dropped by a socket close saves nothing and is not queued again: the PR gets a call when the next stream snapshot arrives after the reconnect, so a down socket makes no call loop.
- **Push.** An answer that changes the labels of a PR calls the debounced tree push, as a stream change does.
- **Stale answer.** T3 caches a detail for 60 s. When the answer's `updatedAt` is older than the snapshot `updatedAt`, the server queues one more call after 60 s. It obeys the call limit and the eligibility rules, and it is not repeated.
- **Rate.** At most 4 calls at a time; the others wait in a queue. With no connection that sends a list, queued calls wait and no new call starts. No polling: the server calls only on a stream change.
- **Store.** The server keeps all labels of each PR in memory, for all connections. It does not keep them per connection, so a new name or a new tab makes no new call.
- **Tree.** Each `PrNode` gets `labels: { name: string; color: string | null }[]`: only the labels that match the connection's list. A settled thread's PRs get `[]`. With no list, all PRs get `[]`.
- **Failure.** When T3 is down, the socket closes, or the call fails, the server keeps the last labels. It calls again on the next `updatedAt` change. A call in flight when the socket closes is dropped.
- **Freshness.** T3 syncs a PR every minute when it changed in the last 30 minutes, else every 5 minutes. So a label change shows in about 2 minutes, or up to about 6 minutes for a quiet PR. T3 does not sync settled threads.

### Label pill

- **Counts.** The open PRs of the row (`state` `open`), all of them, also past the first two chips. Merged and closed PRs do not count. Stack PRs are not row PRs, so they do not count. A settled row has no pill.
- **Where.** One pill per row, in the right group, before the PR chips. Tree and Flat rows only: not in the details block, the PR stack rail or the Focus cards.
- **Several matches.** The pill shows the first matching name in Watched-label order, then "+N" for the other matching names. One label on two PRs counts as one name.
- **Name.** The lucide `Tag` icon, then the initials of the first three words of the label in upper case, mono font. Words split on any character that is not a letter or digit: `ready-for-review` gives "RFR", `do-not-merge` gives "DNM".
- **Color.** The label color (six hex digits with no `#`, as T3 gives it) fills the pill. The text and icon are black when `0.299 r + 0.587 g + 0.114 b > 150`, else white. A label with no color (GitLab can give `null`) uses the `secondary` badge colors.
- **Tooltip.** Each match as "<name>: #<PR>", joined with " · ". Example: "ready-for-review: #3004". The pill is focusable, so the tooltip opens from the keyboard.
- **Phone width.** No change. The pill is at most three letters and "+N".
- **Before the first answer.** No pill and no placeholder. The pill shows when the labels arrive.

## Model picks

One shared module, `src/server/model.ts`, runs every Model pick: a feature gives its guide, input and JSON schema.

| Pick     | Label           | Model                        | Effort                             |
| -------- | --------------- | ---------------------------- | ---------------------------------- |
| `claude` | Claude Haiku    | `haiku` (`claude-haiku-5-5`) | `--effort medium`                  |
| `codex`  | Codex Luna      | `gpt-6-luna`                 | `-c model_reasoning_effort=medium` |
| `local`  | Local · <model> | `model` from the config      | `reasoning_effort: "none"`         |
| `apple`  | Apple model     | Apple's on-device model      | none                               |

- **Detection:** at start, run `claude auth status` and `codex login status`. Exit 0 means logged in. A CLI that is not on `PATH` (spawn gives `ENOENT`) or not logged in is not offered.
- **Run:** use the tested command lines in ticket 01 (research file on branch `research/headless-cli`), with the prompt on stdin. Do not use `claude --bare`: it ignores the OAuth login. Codex runs with `-C` set to an empty temp folder and reads the schema from a temp file.
- **Answer:** Claude: `structured_output` of the last JSON object on stdout; a failure is `is_error: true` or a non-zero exit. Codex: `JSON.parse` of the text of the last `item.completed` event with `item.type == "agent_message"`; a failure is `turn.failed` or a non-zero exit.
- **Timeout:** 60 s, then SIGTERM. **Cancel:** SIGTERM to the process.
- **Local model config:** `{ baseUrl, model }` as JSON in `~/.config/t3-thread-tree/local-model`, the same folder as the Linear key (`LOCAL_MODEL_FILE` sets another path). No file means no Local model. `baseUrl` is an `http` or `https` URL, with no trailing `/`. `model` is one non-empty line. The server reads the file on each call.
- **Local model offered:** `local` is the last pick, with the label `Local · <model>`, whenever a config is saved, whatever the runtime state. A down runtime or a missing model shows as the run error. The page never picks it on its own: its fallback pick is the first offered pick that is not `local` or `apple`.
- **Local model fold:** Settings › Setup, after "Catch-up", before "Watched labels". It loads `GET /local-model` each time the panel opens, and shows its form after the first answer. The form has a help line ("Runs the Catch-up on a model on this machine. An agent thread can install and set it up for you."), a button "Set up with an agent", "Base URL" (default `http://localhost:11434/v1`), "Model" and "Save". "Save" sends `PUT /local-model` with the JSON config. On success the fold takes the answer, shows "Saved." and the page reloads `GET /models`, so the Local pick shows in the Catch-up fold. On failure the response text shows in the destructive colour. The button sits in `CliGate` and is disabled with no t3 CLI. It opens a dialog "Set up the Local model" with a project select (from `GET /t3/projects`, the project of this repo first, preselected), an editable prompt and "Start thread". The prompt tells the agent to install the Ollama app build (`brew install --cask ollama-app`), pull `qwen3.5:4b-nvfp4`, check the model with one strict `json_schema` call, and save the config with `PUT /local-model` on the app origin. "Start thread" sends `POST /t3/start` with the title "Set up the Local model", then closes the dialog. The fold shows the new config when Settings opens again. apfel (`brew install apfel`) also works in this fold: base URL `http://localhost:11434/v1`, model `apple-foundationmodel`. The app has no code and no detection for it.
- **Local model detection:** `GET /local-model` returns `{ config, state }`. It calls `GET <baseUrl>/models` with a 2 s timeout each time. `state` is `ok` when the list holds `model`, `missing` when the runtime answers but the list does not hold it, `down` when the call fails or is not 2xx, and `unset` with no config. `PUT /local-model` takes the JSON config (415 for other content, 400 for a bad config), saves it, then answers like `GET`.
- **Local model call:** `POST <baseUrl>/chat/completions` with `model`, the guide as the system message, the input as the user message, `response_format` `{ type: "json_schema", json_schema: { name: "answer", strict: true, schema } }`, `reasoning_effort: "none"`, `keep_alive: "30m"` and `max_tokens: 2000`. The answer is `JSON.parse` of `choices[0].message.content`. Cancel and the 60 s timeout abort the request.
- **Offered:** `GET /models` answers the offered Model picks as `{ id, label }[]`.
- **Error text:** the CLI error message (Claude `result`, Codex `turn.failed` message), or "timed out" or the parse error. `stderrTail` is the last 2 KB of stderr. The Local model gives one of these texts, and `stderrTail` is the last 2 KB of the response body, or the fetch error message: "Local model not reachable at <baseUrl>." (the runtime is down), "Model <model> is not in the runtime." (HTTP 404), "The runtime cannot enforce the schema. Install the Ollama app build." (HTTP 501), "The local runtime answered HTTP <status>." (any other failure status), "The local model gave no valid answer." (`finish_reason` is `length`, or the answer is not JSON), "The Local model is not set up." (the config was removed after the pick was offered), or "timed out". The Apple model texts are in "Apple model" below.
- **Demo:** `LOCAL=ok`, `LOCAL=down` and `LOCAL=missing` start `bun run demo` with a saved Local model config in that state; with no `LOCAL`, the demo has no config. A Save in the fold keeps the config in memory. `APPLE=ok` offers the Apple model pick. `CLIS=0` offers no CLI.

### Apple model

Source: wayfinder map `apple-model` in the wiki (`t3-thread-tree/issues/apple-model/`). Tickets 01, 03 and 04 fix the route, ticket 06 measures the Catch-up, ticket 07 sets its rules. The bench helper, `brief.swift`, is on branch `prototype/apple-model-bench`.

The **Apple model** runs through a small Swift helper, `apple-model`, on `FoundationModels` guided generation. The desktop build compiles it and ships it next to `server` in the `.app`. It is an opt-in **Model pick** with the same rules as the Local model: the page never picks it on its own, and never falls back from it.

- **Helper path:** the first file that exists of `dirname(process.execPath)/apple-model` (the `.app`: `Contents/Resources/apple-model`) and `dist/sidecar/apple-model` (a dev runs `bun run build:apple-helper` by hand, then `bun start`). No env override. In a compiled Bun binary, `process.execPath` is the real absolute path of the binary, whatever the cwd.
- **Detection:** on each `GET /models`, when the helper exists, the server runs `apple-model check`. `available: true` offers `apple` with the label "Apple model", after `codex` and before `local`. Any other answer, a non-zero exit or a spawn error hides the pick, and the server logs the reason. No helper means no spawn and no pick.
- **Icon:** the Apple mark from Simple Icons (slug `apple`, CC0), like the Claude and Codex marks. It shows beside the label in the Catch-up fold radio.
- **`apple-model check`:** prints one JSON object and exits 0: `{"available":true,"contextSize":4096}` or `{"available":false,"reason":"deviceNotEligible" | "appleIntelligenceNotEnabled" | "modelNotReady"}`. It makes no model call.
- **`apple-model run`:** reads one JSON object on stdin, `{ guide, input, schema }`. The guide goes in as `Instructions`, the input as the prompt, the schema as a `GenerationSchema` decoded from JSON. It prints one JSON object on stdout:
  - `{"answer": {…}}` and exit 0 (the `GeneratedContent` JSON).
  - `{"error": "<code>", …}` and exit 1 for a known failure. The codes are in the error table below.
  - Any other exit is a crash. `stderrTail` holds the last 2 KB of stderr.
- **Window test:** before it generates, the helper counts guide, schema and input with `tokenCount(for:)` and reads `contextSize` from the model at run time. When count + 600 is more than `contextSize`, it stops at once with `{"error":"overflow","tokens":<count>,"limit":<contextSize - 600>}`. The 600-token output reserve is a constant in the helper.
- **No output limit:** the helper sets no `maximumResponseTokens`. A low limit cuts the JSON and gives `decodingFailure`.
- **Schema transform:** `appleSchema(schema)` in `model.ts` is generic over the feature's JSON schema. It adds `title` (the property name, or `Answer` at the root) and `x-order` (the property keys in order) to each object. It changes each type array such as `["string","null"]` to the non-null type, and removes that key from `required`. The `apple` run sets each such key that the answer leaves out to `null`, so the feature gets the shape of its own schema. The helper has no schema logic. A unit test covers the transform with the Catch-up `SCHEMA`.
- **Timeout:** 60 s, then SIGTERM. **Cancel:** SIGTERM to the process.
- **Two runs at the same time:** macOS runs one generation at a time and holds the second call until the first ends. It does not refuse it. `tokenCount` also waits behind a running generation. The Catch-up queue keeps its cap of 2 and no retry for `apple`: a held call ends far inside the 60 s timeout (2 s median).
- **Build:** `bun run build:apple-helper` runs `swiftc -O -target arm64-apple-macos26.4 src/apple-model/main.swift -o dist/sidecar/apple-model`. It needs Command Line Tools with the macOS 26.4+ SDK. When the SDK is missing, the script fails and so does the build: a release always ships the helper. Users build nothing.

Error texts (the run error, which the server logs; the Catch-up line shows "Catch-up failed"):

| Failure                                                       | Text                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `overflow`                                                    | "The thread is too long for the Apple model: <tokens> of <limit> tokens." (thousands separators) |
| `contextWindow` (`exceededContextWindowSize` in generation)   | "The thread did not fit in the Apple model's window."                                            |
| `unavailable`, reason `deviceNotEligible`                     | "This Mac cannot run the Apple model."                                                           |
| `unavailable`, reason `appleIntelligenceNotEnabled`           | "Turn on Apple Intelligence in System Settings to use the Apple model."                          |
| `unavailable`, reason `modelNotReady`, or `assetsUnavailable` | "The Apple model is not ready yet. Try again later."                                             |
| `refusal`, `guardrail`                                        | "The Apple model refused the input."                                                             |
| `decoding` (`decodingFailure`, `unsupportedGuide`)            | "The Apple model gave no valid answer."                                                          |
| `busy` (`rateLimited`, `concurrentRequests`)                  | "The Apple model is busy. Try again."                                                            |
| `locale` (`unsupportedLanguageOrLocale`)                      | "The Apple model does not support this language."                                                |
| spawn fails                                                   | "Cannot start the Apple model helper."                                                           |
| other exit                                                    | "The Apple model helper exited with code <N>."                                                   |
| timeout                                                       | "timed out"                                                                                      |

## Catch-up

A **Catch-up** is one line from the Model pick about a waiting thread: what the thread did, and what it asks of the user. The server makes and caches it. The server makes `catchUp` on each thread node. The notification, the Up next window and the menu-bar entry show it (see "Desktop app").

### Pick file

- **File:** `{ pick, catchUp }` as JSON in `~/.config/t3-thread-tree/model-pick`, beside the Local model config (`MODEL_PICK_FILE` sets another path). The server reads it on each call. A missing or invalid file means no pick.
- **Switch default:** when the file holds no `catchUp`, the switch is on for `claude` and `codex`, and off for `local` and `apple`. A saved `catchUp` applies to every pick. With no pick the switch is off. A `PUT` of `pick: "local"` or `pick: "apple"` with no saved `catchUp` therefore turns the switch off and clears the cache.
- **`GET /model-pick`:** answers `{ pick, catchUp }` with the switch resolved.
- **`PUT /model-pick`:** takes JSON `{ pick?, catchUp? }` (415 for other content, 400 for a bad body). It merges the fields into the saved file, writes it with mode `0600`, and answers like `GET`. A resolved switch that is off cancels the running calls and clears the cache.
- **No saved pick:** no Catch-up runs. The page saves the pick when the user picks a model in the Catch-up fold, or turns the switch on (see "Catch-up fold").

### Trigger

The server runs the check in the debounced tree push, so the 30 s tick also drives it. A thread waits when its status is needs input, plan ready, your turn or failed, and it is not snoozed and not settled.

- **Key:** thread id, the id of the newest complete assistant message, and for a needs-input thread its `since`, which is the request id.
- **Debounce:** a key with no cache entry and no timer gets a timer of 5 s. When the timer ends, the call starts only if the thread still has this key and the switch is on.
- **Stop:** a thread that stops waiting, or gets a new key, loses its entry. The server cancels its run, removes it from the queue and the cache, and clears its timer.

### Queue and call

- **Queue:** at most 2 calls run at the same time. The other entries are `queued`, and the one with the oldest **Wait** starts first. A thread with no Wait, such as a failed or guest-message thread, counts from its `updatedAt`. The timers start in the same order.
- **Input:** the `digestOf` text of the thread, with a 4000-character tail of the last message. The guide is `src/server/catch-up-prompt.md`.
- **Call:** `run(pick, { guide, input, schema })` with the pick that was set when the entry was queued. The schema is `{ did: string, ask: string | null, options: string[], doneLike: boolean }`, all required, no extra properties.
- **Answer:** `parseAnswer` reads an `ask` that is `""` or `"null"` (any case, after trim) as `null`, and drops such entries from `options`. This holds for every pick. Then the server validates the answer. It cuts `did` at 140 and `ask` at 120 characters with "…", keeps at most 4 options, and cuts each at 60 characters. An invalid answer is a failure.

### Cache and delivery

- **Cache:** a `Map` in memory by key. Each key gets one try and no retry: a model error, a timeout or an invalid answer stays `failed` until the key changes. A server restart runs the calls again. A new pick does not change the cached entries.
- **Delivery:** each thread node holds `catchUp?: { state: "queued" | "running" | "done" | "failed", did?, ask?, options?, doneLike?, question?, pick }` while an entry of its current key exists. `did`, `ask`, `options` and `doneLike` are set in `done`. `question` is set in `done` and `failed`: it is the last question of the last message (the last sentence or line that ends in `?`, else the last sentence or line), cut at 140 characters with `…` (`questionOf` of its 4000-character tail), or `null` when the thread has no message. Each state change sends the tree again.

### Catch-up fold

Settings › Setup, after "Linear links" and before "Local model". It holds the Catch-up switch and the Model pick. It is closed at first.

- **Value:** at the right of the fold: "No model" in yellow with a warning sign when `GET /models` gives no pick, else nothing while the switch is off, else "Off" in neutral text when no pick is set, else the label of the pick in green. "Checking…" in neutral text shows until the first `GET /models` answers.
- **Body:** a radio group "Model" with each offered pick in the order of `GET /models` (`claude`, `codex`, `apple`, `local`), each with its provider icon and label. The radios are disabled while the switch is off. The switch "Catch-up" sits on the fold row, between the value and the chevron, and shows only when a pick is offered. A click on it does not open or close the fold.
- **Effective pick:** the saved pick when it is offered, else the first offered pick that is not `local` or `apple`.
- **Pick:** a click on a radio sends `PUT /model-pick` with `{ pick }`. The answer sets the switch.
- **Switch:** a click sends `PUT /model-pick` with `{ catchUp }`. When no pick is saved, turning the switch on also sends the effective pick, else the first offered pick, so a setup with only a Local model or the Apple model can turn on.
- **No model:** the body shows a hint and a link button "Set up a Local model" that opens the "Local model" fold.
- The page moves a pick that an older page saved in `localStorage` to the file one time, and then reads the pick from the server. The page removes the old `localStorage` value only after the server holds the pick.

### Row line

A thread row in the tree and the flat list shows a **Catch-up line** under the title when the thread has a `catchUp` and its status is needs input, plan ready, your turn or failed. Other rows do not change. The status text switch does not hide the line.

- **Done with an ask:** what the thread did, then "Asks:" in the status color, then the ask, then each option as a small chip.
- **Queued or running:** a skeleton bar.
- **No clear ask or failed call:** a dashed tag, "No clear ask" or "Catch-up failed", then the first line of the raw question in italic and quotes. With no raw question, what the thread did, else the tag alone.
- **Trust:** a tooltip on the line shows the end of the last message as GitHub Flavored Markdown. The page loads it when the tooltip opens. It skips raw HTML and shows link labels and image descriptions as text.

## Send message

Source: map [send-message](.wayfinder/send-message/map.md), decisions at charting and grilling.

The user can send a message to one thread from the page. The send opens a dialog, and nothing goes to T3 until the user confirms. The server also has a route that starts a thread in a project. The page does not call it.

### Transport

The server runs the T3 CLI as a child process (`Bun.spawn`), like the model runner. It uses T3's own login. The token needs the `orchestration:operate` scope for settle. The database stays read-only.

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

Ids go in the JSON body, not in the path, because ids hold `:` and `%`. The read-only `GET /t3/last-message` takes the id as a query value. The module `src/server/send.ts` exports a service with `routes`. The response types live in `src/shared/send.ts`.

| Route                      | Body                                                    | Success                                                                                         |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /t3/cli`              | none                                                    | `200 { available: boolean, path: string }`                                                      |
| `POST /t3/send`            | `{ threadId: string, message: string }`                 | `200 { delivery: "started" \| "queued" \| "steered" \| "restarted" }`                           |
| `GET /t3/last-message?id=` | none                                                    | `200 { text: string \| null }`. `400` without `id`. `404` for an unknown thread.                |
| `POST /t3/snooze`          | `{ threadId: string, snoozedUntil: string }`            | `204`. The server sends `thread.snooze` to T3, like settle.                                     |
| `GET /t3/projects`         | none                                                    | `200 { id: string, label: string }[]`: the T3 projects by label, the project of this repo first |
| `POST /t3/start`           | `{ projectId: string, title: string, message: string }` | `200 { threadId: string }`                                                                      |

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

The page reads `GET /t3/cli` once at load. When `available` is false, every send control shows disabled, with the tooltip "No t3 CLI at <path>. Set T3_BIN in .env."

### Row toolbar

A thread row has an always-visible `⋯` button (label "Row actions") before the details chevron. It opens a toolbar with Settle, Send, Workflow and Focus. Opening the toolbar never moves the row.

- **Open:** a mouse hover on the button opens it. A click, a tap or Enter toggles it. On touch it opens only on a tap.
- **Icon:** the `⋯` morphs to `X` while the toolbar is open.
- **Place:** the toolbar renders in a portal to the left of the button, centered on the row. It covers the row's own PR pill and time, never the next row, and flips when there is no room. No row or divider covers it.
- **Close:** the pointer leaves the button and the toolbar for 180 ms, a click outside, or Escape. It stays open while a menu of the toolbar is open, while a settle request runs and after a settle failure.
- **One at a time:** opening a toolbar closes the one that is open.
- **Focus:** a hover open does not move focus. A keyboard open moves focus into the toolbar. Tab past the last action, or Shift+Tab past the first, closes it and focuses `⋯`. Escape closes the toolbar. After a keyboard open, focus goes back to `⋯`. After a hover open, focus does not move.

### Settle icon

A thread row, top-level or subthread, in the tree and in the flat list, has a settle icon at its end, just before the send icon. It does not depend on the `t3` CLI.

- **Icon:** `CircleCheckBig` with the label "Settle thread". On a settled row (in the Settled list): `Undo2` with the label "Unsettle thread". The tooltip shows the label.
- **Reveal:** it sits in the row toolbar (see "Row toolbar"), so it shows when the toolbar is open.
- **Click:** one click, with no dialog. The icon stops propagation, so it does not open the thread and does not start a drag. It is disabled while the request runs.
- **Request:** `POST /t3/settle` with `{ threadId, settled }` and a JSON content type. The server sends `thread.settle` or `thread.unsettle` to T3 over the stream socket. This needs the `orchestration:operate` scope.
- **Result:** the row changes through the stream: it leaves the live list. With "Show settled threads" on, it shows in the Settled list with the "Settled" chip after the next fetch.
- **Failure:** the icon turns red. The toolbar stays open while a request runs and after a failure, until a click outside or Escape. The tooltip shows the error until the next click. A token without the `orchestration:operate` scope gives the error "The T3 token cannot settle. Issue a new token with the command in Settings."

### Send dialog

One reusable component on the shadcn Dialog (Radix).

- **Opens from:** a thread row, top-level or subthread: a send icon in the row toolbar that the `⋯` button opens (see "Row toolbar"), after the settle icon (see "Settle icon"). Its tooltip says "Send message". The icon stops propagation, so it does not open the thread and does not start a drag.
- **Target:** fixed. The dialog shows the icon and title of the row, with no picker.
- **Message:** a textarea, editable. It starts empty. Confirm send is disabled while the message is empty after trim.
- **Busy note:** when the target status is `working`, `starting` or `waiting`, a muted line under the target says "This thread is working. The message waits for its next turn." Other statuses show no note.
- **Last message:** a muted box above the textarea, with the label "Last message". It shows the end of the last message of the target thread, in a box of at most 10 rem with scroll. It loads when the dialog opens and again when the target changes. It shows nothing while it loads or when the thread has no message.
- **Approval note:** when the target status is `needs-input` and its phrase is "Approval", a muted line says "This thread waits for an approval. A message does not approve the request. Approve it in T3."
- **Suggested replies:** a chip row between "Last message" and the textarea (see "Suggested replies").
- **Buttons:** Cancel and Confirm send.
- **Keys:** Cmd/Ctrl+Enter sends, Escape cancels, and Enter makes a new line.
- **In flight:** Confirm send shows a spinner. Until the request ends, the fields, Cancel, Escape and the outside click do nothing. Thus a cancel never hides a message that was sent.
- **Success:** the dialog closes. There is no mark: the row status changes through the stream.
- **Failure:** the dialog stays open, with the draft and the target. An inline alert above the buttons shows:
  - `error`;
  - "exit <code>", when `exitCode` is set;
  - `stderrTail` in mono, when it is not empty.

  Confirm send tries again. A network error shows "The server did not answer."

### Demo stub

`scripts/demo.ts` passes a stub runner to the send service. It never runs the real `t3`.

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

[Ticket 02](.wayfinder/send-message/tickets/02-send-endpoints.md) adds `T3_BIN` to Setup in `README.md` and the demo knobs to Run.

## Suggested replies

Source: wayfinder map `suggested-replies` in the wiki (`t3-thread-tree/issues/suggested-replies/`). Ticket 01 mines the replies, ticket 02 fixes the pool, ticket 04 fixes the place and the click, and ticket 06 picks cue rules over the Local model.

When a thread waits for the user, the send dialog offers **Suggested replies**: chips with fixed text from a pool. Cue rules on the last agent message pick them. When no cue matches, the dialog offers a fixed fallback row. No model runs, and the page never sends a chip by itself.

### Pool

Each **Reply intent** has an id, one or two chip texts and a cue. The chip label and the sent text are the same string. The table order is the pool order.

| Intent id    | Chip text                              | Cue on the last agent message                                                                                |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `run-app`    | `run the app and tell me what to test` | The `ship` cue, and a UI sign: it names a `.tsx`, `.css` or `.html` file, or says "UI", "page" or "browser". |
| `ship`       | `commit push`, then `commit push pr`   | The work is not committed. The message has no `fail`, `error` or "not tested".                               |
| `push`       | `push`                                 | The commit is local or not pushed.                                                                           |
| `handoff`    | `$t3-handoff`                          | It names a next ticket, or writes `/t3-handoff`.                                                             |
| `retry`      | `retry`                                | An API or network error, not a usage limit.                                                                  |
| `agree-all`  | `agreed to all`                        | A grill round with `❓ Q<N>` and `➡️` lines.                                                                 |
| `merged`     | `merged`                               | It asks the user to say when the PR is merged.                                                               |
| `refresh-pr` | `$refresh-pr`                          | It says the PR body is stale.                                                                                |

`ship` is one intent with two chips, because the text cannot tell `commit push` from `commit push pr`.

### Cue rules

- **Input:** the text of the newest complete assistant message of the thread. Row signals (PR state, `lastError`) do not gate any intent.
- **Match:** a case-insensitive regex for each cue. The build writes the regexes from the cue column. A unit test holds real message samples for each intent, with a match and a miss.
- **Cue chips:** when 1 or more cues match, the matched intents give the chips, in pool order. The fallback row does not show.
- **Fallback row:** when no cue matches, the intents are `ship` and `handoff`: `commit push`, `commit push pr`, `$t3-handoff`. `merged` shows only from its cue.
- **Cap:** at most 4 chips. The server walks the matched intents in pool order and adds an intent only when all its chips fit in the cap. So `ship` never shows only one of its two chips.

### Field

The server sets `suggestedReplies?: string[]` on each thread node, next to `catchUp`: the intent ids, in pool order, after the cap. A pure function of the message text makes it in the debounced tree push. It has no queue, no cache, no debounce timer and no failure state, and it does not depend on the Catch-up switch or the Model pick.

The server sets the field only when all of these are true. Else the field is absent.

- The thread is top-level. Subthreads get no chips.
- The thread waits: its status is needs input, plan ready, your turn or failed, and it is not snoozed and not settled.
- A needs-input thread does not have the phrase "Approval".
- The thread has a complete assistant message.

### Chips

- **Place:** only in the send dialog, in one row between "Last message" and the textarea. The thread row, the Up next window and the notifications show no chips.
- **Look:** small outline chips with the chip text, in the order of `suggestedReplies`. The page maps each id to its chip texts. An unknown id gives no chip. With no field, the row does not show.
- **Click:** the chip text replaces the textarea text, and the textarea gets focus. Nothing is sent. The user can edit the text, then presses Confirm send.
- **In flight:** the chips are disabled with the other fields.
- **Live:** the row follows the field on the target node, so a new agent message changes the chips while the dialog is open. The draft does not change.
- **Not Catch-up:** the Catch-up `options` answer the thread's own question. They stay a separate set, and they stay non-interactive.

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

An app started from the Dock or Spotlight does not get the shell PATH, so the Catch-up would not find `claude` or `codex`.

- At start, main runs `$SHELL -l -c env` once, with a 5 s timeout. It takes the `PATH=` line and passes it to the child env.
- On failure (timeout, non-zero exit, no `PATH=` line), main keeps its own PATH and appends `/opt/homebrew/bin`, `~/.local/bin` and `~/.bun/bin`.

### Window

- One main window, and the Up next window (see "Up next window"). The main window loads `http://127.0.0.1:<port>`. No custom scheme. When the port is not 4773, that run has its own `localStorage`, so the theme and fold state are the defaults. This is a known cost.
- `show: false`, then show on `ready-to-show`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `backgroundThrottling: false`. The standard macOS title bar.
- The app saves the window size and place in `window.json` in the app data folder, and restores them at start. A saved place that is off all screens is dropped.
- **Close:** the close button hides the window. The page keeps running and drives the badge, the menu-bar entry and the notifications. A Dock click or "Open tree" shows the window again.
- **Quit:** Cmd-Q, or "Quit" in the menu-bar menu. Launch at login is not offered.
- **App menu:** the role menus (app, edit, view, window). The Window menu keeps Minimize, Zoom and Bring All to Front, and adds the "Up next" check item. The app menu also holds "Mute Notifications" and, when one exists, "Update available: vX.Y.Z…".
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
  setOpenNext(title: string | null): void /** menu-bar "Open next" item */;
  onOpenNext(cb: () => void): () => void /** a click on that item */;
  openExternal(url: string): void;
  setUpNext(list: UpNext): void /** the Up next window */;
  onOpenThread(cb: (id: string) => void): () => void /** a row click in the Up next window */;
};
```

Main checks each payload by hand (types, sizes, a `t3code:`, `https:` or `http:` URL) before it acts. It accepts IPC only from the main window, except the calls of the Up next window (see "Up next window").

### Needs you

The **Needs you** set is the visible top-level threads with status `needs-input` or `plan-ready`, and the **Run questions** and **Paused runs** (see "Run questions"). Settled threads do not count. A run item has `url` (its run page) in place of an environment id, and a `status` of `run-question` or `paused-run`. Its title is the run title, and its Catch-up line is the question title or the first line of the failure. The page computes it from each tree it gets (the same count as the Needs-you badge in the header) and calls `setNeedsYou`. `since` is the start of the wait, for the menu order: the request time for `needs-input`, `latestRunCompletedAt` for `plan-ready`, `askedAt` for a question, and `updatedAt` for a paused run.

### Up next window

The **Up next window** is a small always-on-top window with the **Open next queue**: one row for each thread, Run question and Paused run, with its Wait, and an "Open next" button. Its title, its top bar and both menu items say "Up next".

- **Page:** `/up-next` on the same server, with its own preload (`up-next-preload.ts`, `window.upNextBridge`). It has no SSE stream, no tree logic and no skip memory.
- **Data path:** the main page owns the queue, the target and the skip memory. It sends them to main with `setUpNext({ rows, targetId })`. A row holds the id, title, status, phrase, raw status, `since`, project label, issue key, Linear URL and, when the thread has one, its Catch-up (`state`, `did`, `ask`, `options`, `question`). Main checks the payload by hand, stores the last one and sends it to the Up next window. When the window loads, it asks main for the stored list, so it never opens empty while threads wait.
- **IPC:** main takes `setUpNext` from the main window only. It takes `upNext`, `upNextOpenNext`, `upNextOpenThread` and `upNextOpenLinear` from the Up next window only.
- **Open next:** the button sends `openNext` to the main page, as the menu-bar item does.
- **Row click:** main sends `openThread(id)` to the main page. The page adds the thread to the skip memory and opens it, so Open next then goes to the next row. The main window does not come forward. Tree rows and menu-bar rows do not change.
- **Key click:** a linked issue key opens Linear with `shell.openExternal`, only for an `https://linear.app/` URL. It does not touch the skip memory.
- **Toggle:** the check item "Up next" in the Window menu and after "Open tree" in the menu-bar menu, and the shortcut ⌥⌘U. The shortcut uses `globalShortcut`, so it works in any app. When it cannot register, main logs it and the menu items still work. The window is created at its first show, hidden at start and not restored at restart.
- **On top:** `type: "panel"`, the floating level, on all Spaces and over full-screen apps. It has no Dock or Cmd-Tab entry, and it does not take focus when it shows.
- **Size and place:** 360×480 at first, resizable, at least 280×160. Main saves them in `up-next.json` and restores them with the same off-screen check as `window.json`. With no saved place, the window sits at the top right of the work area of the screen that holds the cursor.
- **Close:** the close button hides the window and clears the check in both menus. Cmd-Q quits the app.
- **Look:** a top bar with "Up next", the count and an "Open next" button (disabled with no target), then one row for each thread: a 28 px top line with the status icon, project icon, issue key, title and Wait. A row with a Catch-up has a second line: "Asks: <ask>", else what the thread did; a skeleton while the call runs; a dashed tag and the raw question when there is no clear ask or the call failed (see DESIGN-SPEC.md › "Up next second line"). A row of a Run question or a Paused run shows a `Workflow` icon (plan color) or a `CirclePause` icon (failed color) in place of the status icon, the workflow name in place of the project icon, the title and the Wait. Its second line is the question title with "Asks: ", or the first line of the failure. A click opens the run page. The target row has an amber left mark and a tint. With no thread, the list shows "Nothing waits" and "Threads that need you show here." The theme follows the app theme.

### Dock badge

- `app.setBadgeCount(count)` with the Needs-you count. 0 hides the badge.
- It always shows. It does not clear on window focus.

### Notifications

The page owns the rules. Main shows them, so the mute switch stays in main.

- **Trigger:** a Run question opens, or a run becomes a Paused run: its item key (`id` + `since`) is new in the list. Items have their own baseline: the first tree with a workflows snapshot sends nothing. A paused run that pauses again, or a question asked again, has a new key and notifies again. A thread enters `needs-input`, `plan-ready` or `failed`. "Enters" means its status in this tree differs from its status in the last tree. A thread that is new in the tree with one of these statuses also enters. No notification for your turn or for PR checks.
- **Baseline:** the first tree after the page loads sends nothing. A tree with `conn` not `up` sends nothing and does not move the baseline.
- **Grouping:** 1 or 2 threads enter in one tree: one notification per thread. 3 or more: one summary, "N need you". Threads and run items count together.
- **Hold:** when the Catch-up switch is on, the page holds a thread notification until the Catch-up of the thread is `done` or `failed`, for 15 s at most. Then it sends the notification with the Catch-up, or as it is after 15 s. A held notification drops when its thread changes status, settles or leaves the tree. A tree with `conn` not `up` keeps it. A new notification for the same thread replaces the held one. The summary and all notifications with the switch off go out at once. The page reads the switch from `GET /model-pick` and from the answer of `PUT /model-pick`; it holds until the first answer, and a failed read sets the switch off.
- **Text:** with no Catch-up, title "Needs input", "Plan ready" or "Failed"; body the thread title. With a `done` Catch-up that has an ask, title "<status> · <thread title>"; body "Asks: <ask>" (options as "A or B?"), then what the thread did on a second line. With no clear ask or a `failed` call, the body is the raw question, else what the thread did, else the thread title. The body is plain text.
- **Run text:** title "Run question" or "Run paused"; body the question title or the run title. No Catch-up hold. A click opens the run page.
- **Replace:** a new notification for a thread closes the earlier one for that thread. A run item has the same rule by its id.
- **Click:** a thread notification opens `t3code://threads/<environmentId>/<threadId>`. The summary shows and focuses the window.
- **Mute:** "Mute Notifications" in the app menu and in the menu-bar menu. Off by default, saved in `settings.json`. It stops notifications only, not the badge or the menu. macOS Focus covers Do Not Disturb.
- Main uses Electron `Notification`, silent off. No per-status or per-project rules.

### Menu-bar entry

- A `Tray` with a template icon and the Needs-you count as its title. No title when the count is 0.
- A click opens a native menu:
  1. "Open next · <title>" and a separator, only when the page has an Open next target. A click asks the page to open that target, so the item and the page button open the same thread. The page sends the title with `setOpenNext`; `null` hides the item.
  2. Up to 10 Needs-you threads, the longest wait first (oldest `since`; `null` last). Each item shows the status ("Run question" or "Run paused" for a run item) and the title, and, for a `done` Catch-up with an ask, " — <ask>" (options as "A or B?"). A click opens the thread in T3 Code, and a run item on its run page.
  3. "+N more… (open tree)" when more than 10, which shows the window.
  4. "Open tree", "Up next" (a check item), "Mute Notifications", "Update available: vX.Y.Z…" when one exists, "Quit".
- Main builds the menu again on each `setNeedsYou` and each `setOpenNext`.

### Token

- The packaged app keeps the T3 token in `token` in the app data folder, mode `0600`. No Keychain: an ad-hoc signature changes with each build, so the Keychain would ask after each update.
- Main passes the file path to the child as `T3_TOKEN_FILE`. The server reads and writes it (see "Token" above), so the desktop app and the browser use the same field. With no file, the child env keeps any `T3_TOKEN` it already has (dev uses `.env`).

### Build and dev

- `bun run desktop`: bundles main and preload with `Bun.build({ target: "node", format: "cjs", external: ["electron"] })` into `dist/desktop/`, then starts Electron. No watch for main: restart after a main change. The page keeps HMR.
- `bun run desktop:demo`: the same, with `DESKTOP_DEMO=1`.
- `bun run build:sidecar`: `scripts/build-sidecar.ts` calls `Bun.build({ compile: { target: "bun-darwin-arm64" } })` on `src/server.ts` with the Tailwind plugin, into `dist/sidecar/server`. The CLI is not enough: the Tailwind plugin works only through the JS API.
  - The lineage worker is passed as a string path, so the compiler bundles it as an extra entry point.
  - `catch-up-prompt.md` is imported as text (`with { type: "text" }`), so it is in the binary.
- `bun run build:apple-helper`: compiles `src/apple-model/main.swift` into `dist/sidecar/apple-model` (see "Apple model").
- `dist/` and `release/` go in `.gitignore`.

### Package, sign and install

- **electron-builder** packages the app into `release/`, `arm64`, with the sidecar and the Apple model helper through `extraResources` (`dist/sidecar/server` → `server`, `dist/sidecar/apple-model` → `apple-model`). `desktop:dmg` and `desktop:install` run `build:apple-helper` after `build:sidecar`. Product name "T3 Thread Tree".
- **Signing:** ad-hoc (`codesign -s -`), with `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory` for the sidecar. No Developer ID, no notarization.
- **Install paths** (all in the README):
  - `.dmg` from GitHub Releases. The first open needs System Settings › Privacy & Security › "Open Anyway", or `xattr -dr com.apple.quarantine "/Applications/T3 Thread Tree.app"`.
  - From source: `bun run desktop:install` builds the sidecar, bundles main and preload, runs electron-builder `--dir`, signs ad-hoc and copies the `.app` to `/Applications`.
  - Browser: `bun start`, as today.

### Release and updates

- A push of a `v*` tag runs `.github/workflows/release.yml` on `macos-14`. It builds the ad-hoc signed `.dmg` and attaches it to the GitHub Release of that tag. `package.json` holds the version.
- The main process keeps one update state (`UpdateState` in `src/shared/desktop.ts`). The app menu, the menu-bar menu and the Settings panel read it. The page gets it through `updateState` and `onUpdateState` on the bridge, and sends no URL or path.
- The packaged app reads the GitHub latest-release API at start and every 6 h. The panel also checks when it opens. A check never runs during another check or an install, and a check that is not forced is skipped within 60 s of the last good reply. A reply that does not parse counts as a failed check. A failed check keeps a known release.
- When the latest tag is newer than `app.getVersion()`, the menus show "Update available: vX.Y.Z…" and the Settings cog shows a dot. No notification.
- "Update and Restart" (menu) and "Update and restart" (panel) download the release zip to disk, unpack it with `ditto`, start the swap script and quit. The state has the stages `downloading` (with a percent when `content-length` is known), `unpacking` and `restarting`. The menus, the panel, the Settings cog ring and the Dock progress bar (download only) show them. A failed install sets the stage `failed` with the message. A run from source, or a release with no zip, can only open the release page.

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
- Whether `codex exec --ignore-user-config` skips a global `~/.codex/AGENTS.md`. If not, a model run sees it.
- Whether a `bun-darwin-arm64` cross-compile on ubuntu runs on a Mac, and whether Bun's compiled binary loads `.env` from its working folder.
- Label pills: that the token scope `orchestration:read` covers `pullRequests.detail`. The research saw `Success` but read the scope from T3 source only.
- Label pills: whether a GitLab label change moves the merge request `updated_at`. If not, a GitLab pill changes only on the next other change.
- Label pills: the label-change-to-pill time was taken from T3 sync code, not timed live.
