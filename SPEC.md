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

- The user issues the token once with `~/.t3/bin/t3 auth session issue --scope orchestration:read --scope orchestration:operate --label thread-tree --ttl 52w --token-only | pbcopy`. `pbcopy` puts the token on the macOS clipboard.
- The user pastes it in the "T3 token" password field of the Settings panel. The page sends `POST /token` with `{"token": "…"}` (JSON only, so a cross-site form cannot send it). The server checks it (one line, at most 4096 bytes), writes it to the token file (mode `0600`), drops the open socket and connects again. The user can replace it at any time.
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

Run the lookup when the backend first sees a top-level thread whose id contains `mcp:` or `mcp%3A` (`t3_thread_launch` gives `mcp:…`, `create_threads` gives `thread:mcp:…`, `delegate_task` gives `thread:delegated-task:command%3Amcp%3A…`), in the snapshot or in `thread.updated`. Cache the result in memory. A thread that arrives before its first message is written gets a short retry. The full scan reads every launch tool call (seconds on a cold disk, no index), so it runs in a Worker, and only when a thread with no sender message is on a requested view: an active thread or its spawner chain, or any thread once the page asks for the settled list. Keep the SQLite code in one module.

## Tree rules

Source: [Tree model rules for the nested tree](.wayfinder/tickets/004-tree-model-rules.md), changed by [Rough tree UI on a real snapshot](.wayfinder/tickets/005-rough-tree-ui.md).

A **top-level thread** has no native `parentThreadId`. A **subagent** has `relationshipToParent: subagent`. The backend applies these rules and builds the whole tree.

1. **Visible.** A top-level, non-archived thread is visible when `settledAt` is null, whatever its status. No recency window applies. Settled threads are never in the tree. The settled toggle shows them in the Settled list.
2. **Subagents are not shown.** The tree holds top-level threads only. It shows no subagent rows, counts or signals.
3. **Snoozed** threads stay visible, unless "Show snoozed threads" is off. They are shown muted, with their wake time. When it is off, a page filter hides them. A snoozed thread with a visible subthread stays as a muted context row.
4. **Issue key:** the first match of `/\b[A-Z][A-Z0-9]+-\d+\b/` in the title of a top-level thread. `Review #15708 JED-4319` gives `JED-4319`.
5. **Visible spawner:** start at the thread's spawner and go up the spawner chain. Skip threads that are not visible, and stop at the first visible one. If no thread in the chain is visible, the thread has no visible spawner.
6. **Placement.** A thread is always placed in its own `projectId`. Apply the first rule that matches:
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
   - The user can reorder project cards, key groups (a stack run moves as one block), review groups and top-level threads by drag. The page stores the order of each list in `localStorage`. An id that is not in the stored list goes after the stored ones, in base order. Ids that no longer exist drop out. Reviews and No issue key stay last. Subthreads keep the base order. No drag crosses lists.
   - A save keeps only the ids of the current view. Settled threads are never in the view, so they are never in the stored order.
   - A live push during a drag does not change the dragged list until the drop.

## UI

The page shows an outline tree: Project, group, thread. Each thread row has a status icon, a title link to `t3code://threads/<environmentId>/<threadId>`, a stack badge, PR links and, when a PR has a Watched label, a Label pill (see "Label pills"). A row that waits on the user (needs input, plan ready or your turn) shows its phrase and the Wait beside the icon, for example "Approval 12m". The Wait is the time since `since`. A guest message has no `since`, so it shows the phrase only. A failed row shows "Failed" with no time. Other rows show no text. This reverses `d602e6e` (#18) for these rows only. The row end keeps the age of `updatedAt`. Closed rows are saved in `localStorage`. A toggle shows the Settled list below the tree or the flat list. A toggle "Show snoozed threads" hides snoozed threads when it is off; it saves `"0"` under `thread-tree:snoozed`, and it is on by default. It changes the page only: the Needs-you count, the Dock badge, the brief and the notifications do not change, and the server gets no parameter. A second toggle turns on launch nesting. When a Linear workspace is set, an issue key links to its Linear issue. With team keys set, only a key of a listed team links. The Settings panel keeps the workspace and teams in `localStorage`; `LINEAR_WORKSPACE` and `LINEAR_TEAMS` give the default. A banner shows when T3 is down, when no token is set, or when T3 rejects the token. The token banners open the Settings panel.

The header holds the title, the filter ("All", "Needs you"), "Open next", "Focus", "What's next", a sort menu ("Manual", "Last updated"), a Tree / Flat switch, one button that is fold all in the tree and a "Group by" menu ("None", "Status") in the flat view, and a Settings button (a cog). The "Needs you" chip shows the Needs-you count as a badge. Then it shows the your-turn count as a muted number. A "·" sits between them when both show. Each count shows only when above 0. The tooltip reads "N need you, M your turn". The cog opens the Settings panel on the right, beside the tree. Its header stays in view while the panel scrolls, and Escape closes it. The panel has three groups. "Updates" (desktop app only) has the version, the update state and its action. "View" has show settled, show snoozed, nest launched threads, reset order and the theme as three icons (Light, System, Dark). "Setup" has five folds, closed at first: T3 token, Linear links, Watched labels (see "Label pills"), the status icon legend and Keys. A fold shows its state at the right: green text when set, yellow text with a warning sign when not set (Watched labels shows a neutral "None" instead), a blue info icon for the legend and for Keys. The Keys fold lists `j k ↑ ↓` Move, Enter Open, `o` Details or fold, `l h` Expand, collapse, `s` Send, `n` Open next, ⌘K (Ctrl+K off macOS) Find, and `1`–`3` Open a Focus slot, each key as a `<kbd>` element. The token banners open the panel with the T3 token fold open. When the panel opens in the desktop app, it checks for updates, but not when the last good check is less than 60 s old.

A pending request wins over snooze. A snoozed thread with a pending request shows as needs input.

The sort menu keeps its choice in `localStorage` under `thread-tree:sort`. "Last updated" sorts by `lastRun` of the thread node: the later of `latestRunStartedAt` and `latestRunCompletedAt`. It is never `updatedAt`, which changes about once a second while a thread works. The page sorts the arranged tree. Projects keep their order; Reviews stays first and No issue key last; groups and threads sort newest first, and a group or PR stack sorts by its newest thread, subthreads included. A thread with no run sorts last. Ties keep the manual order. Drag is off in "Last updated".

The flat view lists all threads of all projects in one list. The switch keeps its choice in `localStorage` under `thread-tree:layout`, and "Group by" under `thread-tree:group`. With "Group by Status", each section header is a fold button. A closed section keeps its header and its count, and shows no rows, so its rows have no drag. The closed sections are saved as a JSON list of section keys under `thread-tree:sections`. With no saved list, "Idle and snoozed" and "Done" are closed. A new thread does not open a closed section. The "Needs you" filter and the sort keep the folds. "Group by None" has no folds. The flat list has no fold-all button. Drag works with "Manual" sort and is off in "Last updated". The flat list keeps its own order in the stored orders (`thread-tree:order`, list key `flat`), so "Reset order" clears it. It starts as the tree order, flattened, and a new thread goes last. A flat drag never changes the tree order, and the reverse. With "Group by Status", a row drags only inside its section; all sections share the one flat order. A stack run is one block, and subthreads stay under their parent. "Manual" keeps the tree order, flattened. "Last updated" sorts the whole list. "Group by Status" makes sections in this order: Needs input, Plan ready, Your turn, Failed (`failed`, `interrupted`), Working (`working`, `starting`, `waiting`), Idle and snoozed, Done. A section with no thread is hidden. A unit (a thread or a stack) goes to the section of its most urgent thread, subthreads included. Settled threads do not pull; a unit with only settled threads goes by all of them. With "Group by Status", Needs input, Plan ready and Your turn sort by Wait, oldest first, with both sort choices. A row with no Wait goes last, and a unit sorts by the oldest Wait of its threads in the section, subthreads included, settled threads left out. Drag is off there. The stored flat order does not change, so a row that stops waiting goes back to its place. A **context row** is a thread row in a section whose status is not one of the section's statuses, or that is settled. A section header counts the threads that match the section, subthreads included, settled threads left out. A context row shows muted title text. In a PR stack, a row folds when it and all its subthreads are context rows. The rail header then shows a "+N other threads" button that shows and hides them. The open state is not saved. Saved tree folds stay unchanged.

**Open next** opens in T3 the thread that has waited longest. The page owns the target and the skip memory; the button, the key `n` and the menu-bar item share them.

- **Target.** The queue holds all threads of the server's tree, subthreads included, with status `needs-input`, `plan-ready` or `your-turn`, not settled. The filter, "Show settled", folds, layout and sort do not change it. The queue sorts by `since`, oldest first, no `since` last. Ties keep the server's tree order, not a saved manual order.
- **Skip memory.** The page keeps, in memory, the threads it opened, keyed by thread id plus `since`. The target is the first thread of the queue that is not in the memory. A new Wait of a thread (a new `since`) makes it a target again. When all threads were opened, the target is the top thread, and the memory starts again with that thread only.
- **Button.** It sits after the filter, with an icon and "Open next". At phone width it shows the icon only, with an `aria-label`. The tooltip is "<phrase> · <title> · <Wait>"; the Wait part is left out when `since` is null. With no target, the button is disabled and the tooltip is "Nothing waits".
- **Key `n`.** It is a page key (see **Page keys**). It does nothing with no target.
- **Opens.** It goes to `t3code://threads/<environmentId>/<threadId>`, the same URL as the row link. It writes nothing to T3.

**Focus list.** A "Focus" button after "Open next" shows the count (`2/3`) and shows or hides the strip. The strip is hidden by default. The page keeps this choice under `thread-tree:focus-show` (`"1"` or `"0"`) and the entry ids under `thread-tree:focus` (a JSON list of at most three thread ids). The strip sits above the tree, under the brief panel. Its heading reads `Focus N of 3`, with `· full, remove one to add another` at 3 of 3. It has three fixed slots; the filled slots come first, and a remove closes the gap. At phone width (720px and less), the slots stack and the empty slots after the first one hide. A card shows the status icon, the phrase (with the Wait for a thread that needs the user), a remove button, the title, an **Open** link and **Show in tree**. A slot whose thread is not in the loaded tree shows "Not loaded" with a remove button; it counts toward the three.

- **Prune.** An entry leaves the list when its thread is settled or no longer in the tree. Only a tree with connection `up` prunes, so a down or loading tree never clears the list.
- **Add.** A crosshair button in each thread row (not in a settled row) adds the thread; it stays visible and pressed on a listed row and removes it. The brief adds a live linked thread of an Action: one thread adds it, more than one open a menu in which a listed thread is checked and disabled. At 3 of 3 the add buttons are disabled with the tooltip "Focus is full (3 of 3). Remove one first."
- **Drag.** A thread row dragged by its handle onto the strip adds the thread on an empty slot. On a filled card, the card asks "Replace with <title>?" with Replace and Cancel; Escape and a click outside cancel. A thread that is in the list already changes nothing. A drop on the strip does not reorder the tree; the page remounts the tree list after such a drop. A row drags only where its handle shows: "Manual" sort, a list of two or more units, not on a PR stack rail, and not in the waiting sections of the grouped flat view. The crosshair button covers the other rows.
- **Show in tree.** It first unfolds the path to the row and stores the folds: in the tree, the project, the groups and the PR stack on the path; in the flat view with "Group by Status", the shut section that holds the thread. It then scrolls to the row (instant with reduced motion), and the row flashes for about 1.5 s. When the row is still not visible (the "Needs you" filter, hidden snoozed threads, or a row behind the "+N other threads" button of a flat PR stack, whose open state is local and not saved), the button reads "Hidden in the tree" for a few seconds.
- **Row buttons.** All row buttons show a pointer cursor; a disabled one keeps the default cursor.

**Find.** The key Cmd+K (Ctrl+K off macOS) opens a dialog: a search input on top, the results below. It is full screen at phone width. It is a shadcn `Command` (`cmdk`) in the `Dialog`, with `shouldFilter={false}`: the match decides the results. Escape or a pick closes it, and the query clears.

- **Set.** Every thread of the loaded tree, subthreads included. The filter, the folds and hidden snoozed threads do not limit it. Settled threads come in only through the settled search.
- **Match.** `find` in `src/shared/find.ts`, shared by the page and the server. It is case-insensitive. The query splits on spaces, and every word must be a substring of one field: title, issue key, project label, `detail.branch`, or the PR numbers written as `#123 #456` (so `123`, `#123` and `12` match PR 123). A word scores 0 when it is in the issue key or starts the title or a title word, else 1. The order is the sum of the scores, then tree order. An empty query matches nothing. There is no fuzzy match.
- **Row.** The status icon, the full title (it wraps), and at the right the Wait text as in the tree (`phrase · age` for a thread that needs the user, the phrase only with no `since` or for a failed thread), else the age of `updatedAt`. A muted second line shows project, issue key and branch, and "in <parent title>" for a subthread. There are no PR badges. A settled result has a muted title.
- **Actions.** Enter or a click opens the thread in T3, like the row link, and closes the dialog. **Show in tree**, a row button and Shift+Enter, closes the dialog, then runs the Show in tree of the Focus list (unfold the path, store the folds, scroll, flash). A result that a view setting hides ("Needs you" filter, hidden snoozed) and a settled result have no Show in tree. Find never changes a view setting.
- **Settled search.** With a query, the last row is "Search settled threads". A pick calls `GET /find?q=<query>`. The server runs `find` over the settled threads of the settled tree and returns `{ t, project, parent }` rows, with `t.children` empty. The rows show in a "Settled" group below the active ones. For the rest of the dialog session, a change of the query fetches the group again after 200 ms, and a newer query cancels the older request. On close, Find goes back to active threads only. A missing or blank `q` gives `[]`.
- **Empty and no match.** An empty input lists the Focus threads, then the most recently updated threads, up to 8 in all ("Recent"). With none, an icon state reads "Find by title, issue key, project, branch or #PR". With no match, an icon state reads "No thread matches", plus the "Search settled threads" row when it applies.

**Page keys.** One `keydown` handler holds all page keys (`pageKey` in `src/page/keys.ts` decides). A plain key does nothing with a modifier, on key repeat (except `j`, `k`, ↑ and ↓), when the event is handled, while focus is in an input, a textarea or a contenteditable element, while the Settings panel is open, and while Find, a dialog, an alert dialog, a menu or a listbox is open.

**Row keys.** A stop is an element with `data-stop`: the title link of each visible thread row, and the fold button of each project, group, PR stack and flat section. Focus is real DOM focus, and the tab order does not change. The stop list is the stops in DOM order inside the list. It skips an inert row, a row in a closed fold and a hidden row. `j` and `k` focus the next or previous stop, and do nothing at the ends. With no stop focused, the first one focuses the first stop that lies inside the list view. ↑ and ↓ do the same only when a stop has focus, and call `preventDefault` only when they move, so the page scrolls otherwise. A move scrolls the stop into view only as needed. On a thread stop, Enter opens the thread (the link), and `s` clicks its Send button when the button shows and is not disabled. On a header, Enter folds or unfolds, and `s` does nothing. `o` toggles the details of a thread or the fold of a header, `l` opens them and `h` closes them, as in vim. `l` on an open fold and `h` on a closed fold do nothing. The drag handle is not a stop. While a stop has focus, the page keeps its id and index. When a render moves the row and focus is lost, focus returns to the row. When the row leaves, focus goes to the stop at the old index, or to the page when no stop is left. When a fold closes with focus inside it, focus goes to its header. The focus ring is an inset outline on the row or header, not only on the link or button.

- **`n`.** Open next.
- **`1` to `3`.** Open in T3, like its card, the thread of that Focus slot. An empty slot, or a thread that is not loaded, does nothing.
- **Cmd+K (Ctrl+K off macOS).** Opens Find, also from a text field. It calls `preventDefault`. It does nothing while another dialog or a menu is open. In the open Find dialog it closes Find.
- **`/`.** Not a page key.

The header has a System / Light / Dark choice. The full design is in [DESIGN-SPEC.md](DESIGN-SPEC.md).

## Live updates

1. The backend keeps the thread map from the stream.
2. On each change, it builds the whole tree again, after a short debounce.
3. It pushes the tree as JSON on `GET /events`. The tree has no settled threads. It carries a `settled` signature: the count, the newest settle and the newest update of the settled threads. When the signature changes, the page fetches its loaded Settled rows again. `GET /settled?after=&limit=` returns `{ items, next, total }`: the settled threads, newest settle first, each with its project. `after` is the `next` of the previous page. `limit` defaults to 50 and clamps to 1..1000. `next` is null on the last page.
4. The page renders each tree it gets. It does not apply diffs.
5. `Bun.serve` closes a connection after 10 s with no bytes. Call `server.timeout(req, 0)` on the SSE request.
6. Stop the push timer when the client disconnects.
7. The page also sends `nest=1` (launch nesting) and `labels=<names>` (the Watched labels, see "Label pills"). The backend builds one tree for each set of parameters and sends it to all connections with that set.

## Label pills

Source: map [pr-label-pill](.wayfinder/pr-label-pill/map.md), tickets [Where do PR labels come from, and how fresh are they?](.wayfinder/pr-label-pill/tickets/001-label-data-source.md) (research on branch `research/pr-label-source`), [How does a Label pill read in the row?](.wayfinder/pr-label-pill/tickets/002-label-pill-look.md) (prototype on branch `prototype/label-pill-look`), [How does the Watched labels section in Settings work?](.wayfinder/pr-label-pill/tickets/003-watched-labels-setting.md).

A Tree or Flat row shows a **Label pill** when one of its PRs has a **Watched label**. The user sets the Watched labels in Settings. The list is empty by default, so no pill shows until the user adds a name.

### Watched labels setting

- **Fold.** Settings › Setup, after "Linear links", before "Status icons". Label: "Watched labels". State text: the names joined by ", ", green. With an empty list: "None", neutral tone, not a warning.
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

- **Threads:** the visible top-level threads of the active tree (launched threads included). No subthreads. The code removes the threads that are `working`, `starting`, `waiting` or `snoozed`: they need no action.
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
- `POST /brief/run` with `{ cli }`: starts a run. 409 when a run is active, 400 for a CLI that is not offered.
- `POST /brief/cancel`: sends SIGTERM to the active run.
- `GET /events` also sends the brief state as a named SSE event `brief`: once when the connection opens, and again at each change. The page does not poll.
- **Error text:** the CLI error message (Claude `result`, Codex `turn.failed` message), or "timed out" or the parse error. `stderrTail` is the last 2 KB of stderr.

`bun run demo` uses a stub runner. `BRIEF=failed`, `BRIEF=empty` and `BRIEF=rules` pick the failed, empty and rules-only states. It returns a sample of the model part after a short delay; code makes the other actions from the demo tree, so the page works with no CLI.

### Page

The full look is in ticket 04. In short:

- **Controls:** in the header, after the filter, a split control: a primary "What's next" button (Sparkles icon) joined to a model `Select`. The choice is saved in `localStorage`. With no CLI offered, the button is disabled with a tooltip. The button is disabled while a run is active. At phone width the button shows its icon only, with an `aria-label`, and the model `Select` and the model name are hidden.
- **Panel:** an inline card between the header and the tree. It shows only after the first click, or when the brief state is not `idle` at load. The head has "Next steps", a mono stamp "generated HH:MM · <label>" ("generated HH:MM · rules only" when the model did not run), and a close button that hides the panel.
- **States:** loading ("Reading N threads…" with the letter wave, and "Cancel"); error (alert, "The brief failed.", "Retry", the stderr tail); empty ("Nothing needs you right now."); the ranked actions. In `running`, the code actions show at once as rows above the loading line. In `failed`, they show above the error. In `done`, all rows run in one rank order.
- **Action row:** rank, kind chip, title with the reason, thread links, and a copy icon for `prompt` (none when `prompt` is `null`).
- **Kind chips:** answer = `needs-input`, merge = `done`, unblock = `plan`, fix = `failed`, review = `working`, clean-up = `idle`.
- **Thread links:** each link shows the live `StatusIcon` and title from the current tree, and opens the thread in T3. A thread that is not in the live tree shows its saved title struck through. The brief text does not change.

## Send message

Source: map [send-message](.wayfinder/send-message/map.md), decisions at charting and grilling.

The user can send a message to one thread, and start a thread in a project, from the page. Each action opens a dialog, and nothing goes to T3 until the user confirms.

### Transport

The server runs the T3 CLI as a child process (`Bun.spawn`), like the brief runner. It uses T3's own login. The token needs the `orchestration:operate` scope for settle. The database stays read-only.

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

Ids go in the JSON body, not in the path, because ids hold `:` and `%`. The read-only `GET /t3/last-message` takes the id as a query value. The module `src/server/send.ts` exports a service with `routes`, as `briefService` does. The response types live in `src/shared/send.ts`.

| Route                      | Body                                                    | Success                                                                          |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /t3/cli`              | none                                                    | `200 { available: boolean, path: string }`                                       |
| `POST /t3/send`            | `{ threadId: string, message: string }`                 | `200 { delivery: "started" \| "queued" \| "steered" \| "restarted" }`            |
| `GET /t3/last-message?id=` | none                                                    | `200 { text: string \| null }`. `400` without `id`. `404` for an unknown thread. |
| `POST /t3/start`           | `{ projectId: string, title: string, message: string }` | `200 { threadId: string }`                                                       |

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

### Settle icon

A thread row, top-level or subthread, in the tree and in the flat list, has a settle icon at its end, just before the send icon. It does not depend on the `t3` CLI.

- **Icon:** `CircleCheckBig` with the label "Settle thread". On a settled row (in the Settled list): `Undo2` with the label "Unsettle thread". The tooltip shows the label.
- **Reveal:** like the send icon. It shows on hover and on keyboard focus within the row, and always on `(hover: none)`.
- **Click:** one click, with no dialog. The icon stops propagation, so it does not open the thread and does not start a drag. It is disabled while the request runs.
- **Request:** `POST /t3/settle` with `{ threadId, settled }` and a JSON content type. The server sends `thread.settle` or `thread.unsettle` to T3 over the stream socket. This needs the `orchestration:operate` scope.
- **Result:** the row changes through the stream: it leaves the live list. With "Show settled threads" on, it shows in the Settled list with the "Settled" chip after the next fetch.
- **Failure:** the icon turns red and stays visible. The tooltip shows the error until the next click. A token without the `orchestration:operate` scope gives the error "The T3 token cannot settle. Issue a new token with the command in Settings."

### Send dialog

One reusable component on the shadcn Dialog (Radix).

- **Opens from:**
  - A "What's next" step that has a `prompt`: a send icon next to the copy icon. The copy icon stays.
  - A thread row, top-level or subthread: a send icon at the row end, next to the details chevron, after the settle icon (see "Settle icon"). Its tooltip says "Send message". It shows on hover and on keyboard focus within the row. On touch devices (`(hover: none)`), at every width, it always shows. The icon stops propagation, so it does not open the thread and does not start a drag.
- **Target, from a step:** a picker (shadcn Select) with the threads of the step. Each option shows the live `StatusIcon` and the title. A thread that is not in the current tree shows its saved title struck through and is disabled. The first enabled thread is selected at open. With no enabled thread, Confirm send is disabled.
- **Target, from a row:** fixed. The dialog shows the icon and title of the row, with no picker.
- **Message:** a textarea, editable. From a step, it starts with the step prompt. From a row, it is empty. Confirm send is disabled while the message is empty after trim.
- **Busy note:** when the target status is `working`, `starting` or `waiting`, a muted line under the target says "This thread is working. The message waits for its next turn." Other statuses show no note.
- **Last message:** a muted box above the textarea, with the label "Last message". It shows the end of the last message of the target thread, in a box of at most 10 rem with scroll. It loads when the dialog opens and again when the target changes. It shows nothing while it loads or when the thread has no message.
- **Approval note:** when the target status is `needs-input` and its phrase is "Approval", a muted line says "This thread waits for an approval. A message does not approve the request. Approve it in T3."
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

The **Needs you** set is the visible top-level threads with status `needs-input` or `plan-ready`. Settled threads do not count. The page computes it from each tree it gets (the same count as the Needs-you badge in the header) and calls `setNeedsYou`. `since` is the start of the wait, for the menu order: the request time for `needs-input`, and `latestRunCompletedAt` for `plan-ready`.

### Up next window

The **Up next window** is a small always-on-top window with the **Open next queue**: one row for each thread, with its Wait, and an "Open next" button. Its title, its top bar and both menu items say "Up next".

- **Page:** `/up-next` on the same server, with its own preload (`up-next-preload.ts`, `window.upNextBridge`). It has no SSE stream, no tree logic and no skip memory.
- **Data path:** the main page owns the queue, the target and the skip memory. It sends them to main with `setUpNext({ rows, targetId })`. A row holds the id, title, status, phrase, raw status, `since`, project label, issue key and Linear URL. Main checks the payload by hand, stores the last one and sends it to the Up next window. When the window loads, it asks main for the stored list, so it never opens empty while threads wait.
- **IPC:** main takes `setUpNext` from the main window only. It takes `upNext`, `upNextOpenNext`, `upNextOpenThread` and `upNextOpenLinear` from the Up next window only.
- **Open next:** the button sends `openNext` to the main page, as the menu-bar item does.
- **Row click:** main sends `openThread(id)` to the main page. The page adds the thread to the skip memory and opens it, so Open next then goes to the next row. The main window does not come forward. Tree rows and menu-bar rows do not change.
- **Key click:** a linked issue key opens Linear with `shell.openExternal`, only for an `https://linear.app/` URL. It does not touch the skip memory.
- **Toggle:** the check item "Up next" in the Window menu and after "Open tree" in the menu-bar menu, and the shortcut ⌥⌘U. The shortcut uses `globalShortcut`, so it works in any app. When it cannot register, main logs it and the menu items still work. The window is created at its first show, hidden at start and not restored at restart.
- **On top:** `type: "panel"`, the floating level, on all Spaces and over full-screen apps. It has no Dock or Cmd-Tab entry, and it does not take focus when it shows.
- **Size and place:** 360×360 at first, resizable, at least 280×160. Main saves them in `up-next.json` and restores them with the same off-screen check as `window.json`. With no saved place, the window sits at the top right of the work area of the screen that holds the cursor.
- **Close:** the close button hides the window and clears the check in both menus. Cmd-Q quits the app.
- **Look:** a top bar with "Up next", the count and an "Open next" button (disabled with no target), then one 28 px row for each thread: status icon, project icon, issue key, title and Wait. The target row has an amber left mark and a tint. With no thread, the list shows "Nothing waits" and "Threads that need you show here." The theme follows the app theme.

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
  1. "Open next · <title>" and a separator, only when the page has an Open next target. A click asks the page to open that target, so the item and the page button open the same thread. The page sends the title with `setOpenNext`; `null` hides the item.
  2. Up to 10 Needs-you threads, the longest wait first (oldest `since`; `null` last). Each item shows the status and the title. A click opens the thread in T3 Code.
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
- Whether `codex exec --ignore-user-config` skips a global `~/.codex/AGENTS.md`. If not, the brief run sees it.
- Whether a `bun-darwin-arm64` cross-compile on ubuntu runs on a Mac, and whether Bun's compiled binary loads `.env` from its working folder.
- Label pills: that the token scope `orchestration:read` covers `pullRequests.detail`. The research saw `Success` but read the scope from T3 source only.
- Label pills: whether a GitLab label change moves the merge request `updated_at`. If not, a GitLab pill changes only on the next other change.
- Label pills: the label-change-to-pill time was taken from T3 sync code, not timed live.
