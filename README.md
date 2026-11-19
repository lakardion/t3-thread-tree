<p align="center"><img src="assets/icon.svg" alt="T3 thread tree app icon" width="128" height="128"></p>

# T3 thread tree

A live map of your [T3 Code](https://github.com/pingdotgg/t3code) threads.

T3 Code shows threads as a flat list. When agents launch threads, review PRs and work through PR stacks, a flat list does not tell you how the work fits together. This app shows the active threads as one tree, **Project › issue key › thread**, with a status and the PR marks on each row. Click a thread to open it in T3 Code.

Use it as a Mac app or in a browser. The Mac app adds a Dock badge, notifications, a menu-bar entry and a small Up next window for the threads that need you.

![The thread tree in light mode, with three threads in the Focus list](docs/tree-light.png)

![The thread tree in dark mode, with one project closed and one details block open](docs/tree-dark.png)

_Screenshots use made-up data from `bun run demo`._

## What you get

- **All projects in one list.** Each project is a block with its name on one header line above its threads, so you see all projects at once. Long thread titles wrap and are never cut, also on a phone. The project has the same icon and color as in T3 Code: two letters on a colored square, and the block has a left edge in that color. Hover the name to see the repository (`owner/name`). Threads group by the first issue key in the title (`SHOP-412`, `API-81`, …). A key group with one thread folds into its row, which shows the key as a chip. Review threads (`Review #…`) go in their own Reviews group. This group always sits at the top of the project, with an eye icon and a teal label, so you find it fast. A closed project or tree group with five or more threads shows a count for each status instead of one icon for each thread. Hover the counts to read them as words.
- **Header stays in view.** The header stays at the top of the window, and only the list below it scrolls. The header line of the project you scroll through stays at the top of the list.
- **Launch lineage.** The details block of a thread that an agent launched shows "Launched by" with a link to the thread that launched it. Turn on "Nest launched threads" in the Settings panel to show a launched thread with no issue key under that thread instead of in "No issue key". It is off by default. A thread in a PR stack stays in its stack. T3 does not store this link, so the app reads it from T3's local database.
- **PR stacks.** Issue groups that share a stack sit together in one block. Its header is a line from the base branch to the top PR, with one stop for each PR, for example `main ─ 1 · #2101 ─ 2 · #2102`. Click a stop to open the PR. Below the header, the threads sit on a numbered line, one number for each stack position. A red stop means failing checks, a conflict or requested changes, green means approved, grey means draft and blue means open. When the tree does not show all PRs of a stack, for example under a filter, each stop shows its position in the whole stack, such as `2 of 4 · #2102`. Click the chevron to fold the block to its header.
- **PR marks.** Each row shows its first two PRs. A PR chip shows checks (dot or ring), review (check or cross), conflicts (warning), draft (dashed border), merged (violet) and closed (struck through).
- **Your own order.** Drag the handle on the left edge of a project, group or thread row to move it in its list (only in "Manual" sort; the Flat view has its own order), or use Space and the arrow keys. The handle shows when the pointer is on the row. A row moves out of the way as soon as the dragged row enters it a little, also when the row is tall. A PR stack moves as one block. The order stays after a reload, and "Reset order" clears it.
- **Sort by last updated.** The sort button in the header opens a menu: "Manual" or "Last updated". "Last updated" puts the thread with the newest run start or run end first. Subthreads count for their parent. Projects keep their order. Reviews stays first and "No issue key" stays last. A PR stack moves as one block. Subthreads keep their order. Drag is off. When a run starts or ends, the rows slide to their new place. With reduced motion, they move at once. The choice stays after a reload.
- **Focus list.** The "Focus" button in the header shows or hides a strip of up to three threads above the tree. It shows how many threads are in the list, for example `2/3`. Add a thread with the crosshair button in its row or drag the row by its handle onto an empty slot. Drop a row on a filled card to replace it: the card asks first. Each card shows the status, the wait, the title, an "Open" link and "Show in tree", which scrolls to the row and flashes it. "Show in tree" opens the folds on the way to the row first. When the filter hides the row, the button says so. The list holds three threads, so at three the add buttons are disabled. A thread that settles or is deleted leaves the list. The list and the strip choice stay after a reload.
- **Find.** Cmd+K (Ctrl+K off macOS) opens a search for any loaded thread. Type words to match the title, the issue key, the project, the branch or a PR number. Every word must match. Matches in the issue key or at the start of the title come first. Press Enter or click a result to open the thread in T3 Code. Press Shift+Enter, or click the locate button in the row, to close the search, open the folds on the way and scroll to the row. A thread that the filter or the snooze setting hides has no locate button. With no query, the search lists your Focus threads and the latest updated threads. "Search settled threads" adds the settled threads that match. At phone width, the search fills the screen.
- **Keys.** `n` opens the next thread, `t` opens Triage mode, `1` to `3` open the thread in that Focus slot, and Cmd+K (Ctrl+K off macOS) opens Find. Cmd+K works in a field too. `j` and `k` move the focus to the next or previous thread row or fold header, and the arrow keys do the same when a row or header has focus. A ring shows the focused row. Enter opens a thread or folds a header, `o` opens or closes the details of a thread or the fold of a header, `l` opens them and `h` closes them, and `s` opens Send for a thread. The focus stays on its row while the list updates, and moves to the header when its fold closes. The other keys do nothing while you type in a field, or while a dialog, a menu or the Settings panel is open. The "Keys" fold in the Settings panel lists them.
- **Triage mode.** The "Triage" button in the header, or the key `t`, shows a card at the top of the list. The card walks the threads that wait for you, longest wait first, one at a time. It shows what the thread did and what it asks. You can reply with the field or with a quick answer, settle the thread, snooze it, add it to Focus, open it in T3 Code, or skip it. A thread that waits for an approval has no field: you approve it in T3. The card stays on its thread while the list changes. At the end it shows what you did.
- **Open next.** The "Open next" button in the header opens in T3 Code the thread that has waited longest: a thread that needs input, has a plan ready or waits for your turn, settled threads left out, subthreads included. Press it again to open the next thread. After all threads were opened, it starts again at the top. A thread that starts a new wait is a target again. The key `n` does the same. The tooltip shows the status, the title and the Wait of the target. When nothing waits, the button is disabled. At phone width, the button shows its icon only. In the Mac app, the menu-bar menu starts with "Open next · <title>", which opens the same thread.
- **Flat view.** The Tree and Flat buttons in the header switch the layout. Flat shows all threads of all projects in one list.
  - "Group by Status" sections fold. "Idle and snoozed" and "Done" start closed. A closed section keeps its count.
  - Drag works with "Manual" sort. The flat list has its own order, apart from the tree. With "Group by", a row moves only inside its group. In the Needs input, Plan ready and Your turn groups, rows do not drag.
  - Each row shows the project icon and name, and the issue key as a chip. On a phone, the project shows as an icon only. Each row and PR stack has a left edge in the project color, as in the tree.
  - A review thread has a teal eye before its title.
  - A subthread sits under its parent. A PR stack stays one block.
  - "Last updated" sorts across all projects. "Manual" starts as the tree order.
  - The "Needs you" filter and the Settled list work as in the tree.
  - The tree keeps its folds when you switch back.
  - The rows slide when the layout changes. The choice stays after a reload.
- **Group by Linear project.** In the tree, the "Group by" menu in the header has "T3 project" (the default) and "Linear project". The flat view has "Linear project" too. It makes one section per project and milestone, and the sections fold. "Linear project" groups threads by the Linear project of their issue key, then by milestone, with the target date on the milestone header. Each row shows its T3 project as a muted chip. A PR stack stays together in one project and milestone. Threads with no Linear project and review threads sit in groups at the end. Threads with no issue key come last, as plain rows with no group. You need a Linear API key in Settings. The choice stays after a reload, and the page saves this order apart from the T3 order.
- **Project icon and name.** A flat row and a Linear-group chip show the project icon and the project name. The "Show project names in rows" switch in the Settings panel hides the name and keeps the icon. The full name stays in the hover tip. Threads in the "No project" project show a ghost icon in place of the initials. The choice stays after a reload.
- **Catch-up line.** When the Catch-up is on, a row that waits for you or failed shows a line under its title. It shows what the thread did and what it asks, with the options as small chips. A thread with no clear ask, or a failed Catch-up, shows a dashed tag and the last question of the thread. Hover the line to read the last message of the thread.
- **Status text.** A row that waits for you or failed shows its status as text in a column after the icon, for example "Your turn". The "Show status text in rows" switch in the Settings panel hides this column. The icon and the wait time stay. Hover the icon to read the status. The choice stays after a reload.
- **Group by status.** In the flat view, the "Group by" button groups the list by status. Each group has a header with the count of its matching threads, subthreads included and settled threads left out. A thread that does not match its group shows muted. In a PR stack, those threads fold behind a "+N other threads" button. The order is: Needs input, Plan ready, Your turn, Failed, Working, "Idle and snoozed", Done. A group with no thread is hidden. A thread or a PR stack goes to the group of its most urgent thread, subthreads included, settled threads left out. Needs input, Plan ready and Your turn show the longest wait first. A thread slides to a new group when its status changes. The choice stays after a reload.
- **One menu on a phone.** On a narrow screen, one "Sort and layout" button in the header opens a menu with Sort, Layout, Group by, and Collapse/Expand all (tree).
- **Stable order.** Rows keep their place while threads update. A new thread, group or project shows at the bottom of its list.
- **Status changes move.** A new status icon or PR mark fades in. The row flashes once in the new status color. With reduced motion, changes show at once.
- **Rows come and go.** A new project, group or thread grows in. A removed one collapses out. A change that arrives during a drag shows at once. With reduced motion, rows appear and disappear at once.
- **Fold all at once.** In the tree, the button in the header closes or opens all projects, groups and PR stacks. A project or group row with groups or PR stacks in it has its own button at its end (shown on hover): it closes all rows in it, or opens the row and all rows in it. The icon morphs between the two arrow pairs.
- **Folds slide.** A project, group, PR stack or details panel slides open and shut, and its chevron turns. With reduced motion, it opens and shuts at once.
- **Status at a glance.** Each row starts with one status icon in a column of fixed width, so the project icon, issue key and title start at the same place on every row. Each kind of status has its own icon: for example, a shield for an approval, a question bubble for a question, and a chat bubble with a dot for "your turn" (a result you did not open yet). Rows that wait on you show the wait in small text under the icon, for example "12m", and the phrase in the next column, for example "Approval", "Plan ready" or "Your turn". A failed row shows "Failed". Hover the icon to see the phrase and the elapsed time, for example "Working 12m". The details show when the thread was last updated. The Settings panel has a legend of all icons. Color is never the only sign.

  | Color                | Statuses                                                            |
  | -------------------- | ------------------------------------------------------------------- |
  | amber, edge breathes | needs input: approval, question, sign-in or guest message           |
  | blue                 | working (icon turns), starting or queued, waiting on another thread |
  | violet               | plan ready                                                          |
  | green                | your turn (bold title), done                                        |
  | red                  | failed, interrupted or cancelled                                    |
  | grey                 | idle, or snoozed (title muted, with the wake time)                  |

- **What needs you.** The "Needs you" filter in the header shows how many threads need you. A muted number next to it counts the your-turn threads. A tooltip names both counts. "Needs you" keeps only the threads with needs input, plan ready or your turn. The browser tab title shows the count of threads with needs input or plan ready, for example "(5) Thread tree". Settled threads do not count, as with the Dock badge. When the count is not 0, the tab icon gets an amber dot.
- **Details on demand.** The chevron at the end of a row opens a details block: request, error, the end of the last message, usage limit, model, branch, worktree, launched by, goal, tags and all PRs with their checks and size.
- **Settings panel.** The cog in the header opens Settings on the right. The tree stays visible next to it, so you see each change at once. To close the panel, click outside it, click the close button, or press Escape. Each field tells you what to type and where to find it.
  - **Updates.** In the desktop app, this group comes first. It shows the app version and the update state. The panel checks for a new version each time it opens, but not more than once in 60 s. A button updates the app in place and shows the progress.
  - **View.** Rows that stay open: show settled threads, show snoozed threads, nest launched threads, reset the drag-and-drop order, and the theme (Light, System or Dark, as icons).
  - **Setup.** Folds that stay closed until you open them. Each fold shows its state at the right: green text when it is set, yellow text with a warning sign when it is not set.
    - **T3 token.** A password field for the token, with the command that issues one and copies it to the clipboard (macOS), and a button that copies the command. Paste a new token at any time to replace it. The app saves it and reconnects, with no restart. A bar shows while it connects, then a line tells you if T3 accepted the token. When the token is missing or T3 rejects it, a banner shows with a link that opens the panel with this fold open.
    - **Linear links.** Type your Linear workspace, and issue keys link to their issue. Add team keys to link only the keys of those teams. A second field takes a Linear API key, so the app can read the project and milestone of each issue. The fold shows if the key is set, not set or rejected.
    - **Catch-up.** A switch turns the Catch-up on or off. A radio group picks the model that runs it: Claude Haiku or Codex Luna when the `claude` or `codex` CLI is logged in, and your Local model. The radios are off while the switch is off. The fold shows the model name, "Off", or "No model" in yellow. With no model, a link opens the "Local model" fold.
    - **Local model.** Type the base URL and the name of a model that runs on this machine, for example with Ollama. The fold shows if it is ready, not reachable, the model is not found, or not set. After you save, the Catch-up fold shows the Local model last.
    - **Watched labels.** Type the PR label names to watch, separated by commas. Empty by default. With no names, the fold shows "None" in neutral text, not a warning.
    - **Status icons.** A legend of all icons, shown with a blue info icon.
    - **Keys.** A list of the page keys, shown with a blue info icon.
- **Label pills.** A row shows a small pill in its right group when one of its open PRs has a watched label. The pill has a tag icon and the initials of the label name, on the label color. Extra matching names show as "+N". Hover the pill to see each match as "name: #PR". Set the names in Settings, under Watched labels.
- **Live.** Changes arrive as T3 streams them. No polling, no reload.
- **The page remembers your choices.** Closed projects and groups (they show one status icon per thread, and an amber wash with a breathing edge when a hidden thread needs input or has a plan ready), the filter, "show settled", "show snoozed", the folds of the flat sections and the theme stay after a reload.
- **Settled threads on demand.** The "Show settled threads" switch in the Settings panel adds a "Settled" list below the threads, with the count. The newest settled thread comes first. The list loads more threads as you scroll, and shows placeholder rows while it loads. Settled threads are never in the tree or in the flat list. Archived threads never show.
- **Snoozed threads on demand.** The "Show snoozed threads" switch in the Settings panel hides snoozed threads. A snoozed thread with a visible subthread stays, muted. The Needs-you count does not change.
- **Settle from a row.** Each thread row has a settle icon, just before the send icon. On hover or focus, the settle, send and Focus icons slide out after the updated time and push the chips to the left. The chips and the time stay visible, and a long title is cut short until the pointer leaves. When the icons are hidden, they take no space. Touch screens always show them. A thread in the Focus list always shows its crosshair. One click settles the thread, with no dialog. A settled row, in the Settled list, has an unsettle icon instead. If T3 refuses, the icon turns red and its tooltip shows why. An older read-only token cannot settle: issue a new token with the command in Settings.
- **Send from a row.** Each thread row, top-level or subthread, has a send icon at its end. It slides out with the settle icon. It opens the same dialog with that thread as the fixed target and an empty message. The dialog shows the end of the last message of the target thread. When the thread waits for an approval, a note says that a message does not approve the request. The icon is off when no `t3` CLI is found. The row status changes when the thread takes the message.
- **Dock badge.** In the desktop app, the Dock icon shows how many threads need you (needs input or plan ready), the same count as the Needs-you badge in the header. Settled threads do not count. It updates with the window hidden, and it does not clear when you open the window.
- **Notifications.** In the desktop app, you get a notification when a thread starts to need input, has a plan ready or fails. When 3 or more threads change at once, you get one notification, "N threads need you". A click on a thread notification opens the thread in T3 Code. A click on the summary shows the window. When the Catch-up is on, a notification waits until the Catch-up is ready, 15 seconds at most. Its title then holds the thread title, and its body holds what the thread asks and what it did. When the thread has no clear ask, or the Catch-up failed, the body shows the last question of the thread. A new notification for a thread replaces the earlier one. Nothing is sent for the threads that already need you when the app starts, or for settled threads. "Mute Notifications" in the app menu turns them off. The badge stays on.
- **Menu-bar entry.** The menu-bar icon shows the Needs-you count, and shows no number at 0. Its menu starts with "Open next · <title>" when a thread waits, then lists up to 10 threads, longest wait first, each with what the thread asks when the Catch-up has it. A click on a thread opens it in T3 Code. "+N more…" and "Open tree" show the window. "Up next" shows or hides the Up next window. "Mute Notifications" is the same switch as in the app menu. When a newer release exists, "Update available: vX.Y.Z…" shows below it, and a click offers the update. The label shows the stage while an update installs. "Quit" quits the app.
- **Up next window.** In the desktop app, a small window lists the threads that "Open next" can open, longest wait first. Each row shows the status icon, the project icon, the issue key, the title and the Wait. With the Catch-up on, a second line under each row shows what the thread asks, or what it did. A thread with no clear ask, or a failed Catch-up, shows a dashed tag and the last question of the thread. The window is 360 by 480 at first. A saved size stays. The row that "Open next" opens has an amber mark. The "Open next" button at the top opens that thread. Click a row to open its thread in T3 Code, and the target moves to the next row. Click a linked issue key to open it in Linear. When nothing waits, the window says "Nothing waits". Press ⌥⌘U, or use "Up next" in the Window menu or the menu-bar menu, to show or hide it. The shortcut works while another app has focus. The window stays on top, on all Spaces and over full-screen apps. It keeps its size and place. The close button hides it. It starts hidden.
- **Desktop window.** The tree runs in its own macOS window, which you start from Spotlight or the Dock. The app starts the server for you. Closing the window hides it, and the tree keeps running. A click on the Dock icon shows it again, and Cmd-Q quits. The window opens at its last size and place. Links to T3 Code and to PRs open outside the window.
- **Updates.** The Mac app checks GitHub Releases at start and every 6 hours. When a newer release exists, the app menu and the menu-bar menu show "Update available: vX.Y.Z…", and the Settings cog has a dot. Until then, both menus show "Check for Updates…". A click on the menu item checks now and shows the result in a dialog. The Settings panel shows the same state and has an "Update and restart" button. The update downloads, unpacks and puts the new version in place of the installed app, then opens it. The panel shows each stage and the download percent. While it runs, the Settings cog shows a progress ring, the Dock icon shows a progress bar during the download, and the menus show the stage, for example "Downloading Update… 42%". The new version then shows a dialog with what changed, from the release notes, and a button that opens the release page. If the app cannot update itself (for example, when it does not run from the Applications folder), the panel and the dialog offer the release page. After a failed update, the menus show "Update Failed: Open Release Page…".

## Requirements

- [Bun](https://bun.sh) 1.3 or later
- T3 Code running on the same machine (the app reads `~/.t3/userdata`)
- Optional, for the desktop app: macOS on Apple Silicon
- Optional, for the Catch-up: the `claude` or `codex` CLI, logged in
- Optional, for the Catch-up on a local model: the Ollama app build (`brew install --cask ollama-app`)

## Setup

```sh
bun install
```

Start the app, click the cog to open the Settings panel, and paste a T3 token in the "T3 token" field. The panel shows the command that issues one and copies it to the clipboard (macOS). A button next to it copies the command. The token needs the `orchestration:read` and `orchestration:operate` scopes. With a read-only token the tree works, but Settle fails with a hint. The app keeps the token in `~/.config/t3-thread-tree/token`, and the desktop app in `~/Library/Application Support/T3 Thread Tree/token`. A `T3_TOKEN` in `.env` still works as the fallback when no token is saved.

Optional: link Linear issue keys. Set them in the page settings, or add these to `.env`. The page setting wins over `.env`.

```sh
LINEAR_WORKSPACE=join-com   # the slug in linear.app/<workspace>
LINEAR_TEAMS=JED,ENG,MOR    # optional: link only the keys of these teams
```

To read the Linear project and milestone of each issue, the app needs a personal API key. Make one at `linear.app/settings/account/security`. Paste it in the API key field of the "Linear links" fold. The app keeps it in `~/.config/t3-thread-tree/linear-key`, and the desktop app in `~/Library/Application Support/T3 Thread Tree/linear-key`. A `LINEAR_API_KEY` in `.env` works as the fallback when no key is saved.

Optional: run the Catch-up on a model on this machine. Install the Ollama app build with `brew install --cask ollama-app`. The Homebrew formula cannot return structured output. Pull a model, for example `ollama pull qwen3.5:4b-nvfp4`, and start Ollama. Open the "Local model" fold, type the base URL (`http://localhost:11434/v1`) and the model name, and save. The app keeps the config in `~/.config/t3-thread-tree/local-model`. Set `LOCAL_MODEL_FILE` to use another path.

Optional: set the path of the `t3` CLI, which the app runs to send messages and start threads. Add this to `.env`. The default is `~/.t3/bin/t3`:

```sh
T3_BIN=/path/to/t3
```

### Install

Choose one path.

- **`.dmg`:** download the `.dmg` from GitHub Releases and drag the app to `/Applications`. The app has an ad-hoc signature, not a Developer ID. At the first open, macOS blocks it. Open System Settings › Privacy & Security and click "Open Anyway". Or run this command:

  ```sh
  xattr -dr com.apple.quarantine "/Applications/T3 Thread Tree.app"
  ```

- **From source:** run `bun run desktop:install`. It builds the server, bundles the app, signs it and copies it to `/Applications/T3 Thread Tree.app`. Quit the app first, because the command replaces it. Run `bun run desktop:dmg` to write the `.dmg` to `release/` instead.
- **Browser:** run `bun start`. See [Run](#run).

## Run

```sh
bun start
```

Open <http://127.0.0.1:4773>.

- The page is served at once. It shows "Connecting to T3…" until the first tree is ready.
- The app starts even when T3 is not running. It retries every 3 s. Until T3 is back, the page shows the last tree, greyed, with the time of the last update.
- If no token is saved or T3 rejects it, a banner links to the "T3 token" field.

To use the desktop window, run `bun run desktop`. It takes the first free port from 4773. It keeps its own data, so it runs beside the installed app. Run `bun run desktop:demo` to see the demo in the window. Closing the window hides it. Cmd-Q quits.

To see the UI without T3, run `bun run demo` and open <http://127.0.0.1:4774>. The demo offers sample models: set `CLIS=0` to offer no CLI, `PUSH=1` to fake a live change every 3 seconds, `SEND=failed` to make a send fail, and `T3CLI=0` to show the `t3` CLI as missing.

## How it works

```
T3 Code ──WebSocket (orchestration.subscribeShell)──▶ Bun server ──SSE (/events)──▶ React page
statev2.sqlite (read-only) ──launch lineage──────────▶
```

- `src/server/t3.ts` holds the T3 stream: a small hand-written Effect RPC client with JSON frames, and a lenient decoder. T3's protocol is internal, so all protocol code stays in this one module.
- `src/server/lineage.ts` finds the spawner of a launched thread from the launch tool calls in `statev2.sqlite`, opened read-only. It also reads the last assistant message of each thread for the Catch-up.
- `src/server/model.ts` runs every Model pick: a feature gives its guide, input and JSON schema. `src/server/last-message.ts` makes the text of a thread that the model reads, and serves `GET /t3/last-message`.
- `src/server/build-tree.ts` applies the tree rules: visibility, placement, stack order and the eleven statuses. It is a pure function, and `bun test` covers it.
- `src/server.ts` keeps the thread map. It builds the whole tree again on each change, and pushes it as JSON over Server-Sent Events. The tree has no settled threads. `GET /settled` serves them one page at a time.
- `src/page/` is a React, Tailwind and shadcn page, bundled by Bun's HTML imports (Tailwind runs through `bunfig.toml`). There is no Vite and no build step. The fold, the filter, the attention counts and the elapsed times run on the page (`attention.ts`, `format.ts`).
- [DESIGN-SPEC.md](DESIGN-SPEC.md) defines the visual design. [SPEC.md](SPEC.md) defines the tree rules, and [CONTEXT.md](CONTEXT.md) defines the terms.
- `src/shared/tree.ts` holds the `Tree` type that the server and the page share. `src/shared/find.ts` holds the Find match, which the page and `GET /find` share.

The app writes to T3 in two ways. For a send, which you confirm in a dialog, it runs the `t3` CLI with the T3 login. For settle and unsettle, which one click does, it sends the command over the stream, with the `orchestration:operate` scope of the token. The app opens the database read-only.

The desktop app is Electron. `src/desktop/main.ts` is the main process. It starts the compiled server (the sidecar) as a child process, waits until it answers, and loads the page in the window. A preload bridge gives the page the badge, notifications, the menu-bar entry and the update check. electron-builder packages the app with the sidecar in `Resources/server`. It signs the app ad-hoc, with the JIT entitlements that the sidecar needs.

## Develop

```sh
bun test           # tree rules, catch-up, lineage, attention counts, formats
bun run typecheck  # types
bun run lint       # oxlint
bun run fmt        # oxfmt, writes fixes
bun run check      # all of the above, as CI runs it
bun run build:sidecar  # compiles the server into dist/sidecar/server (macOS arm64)
bun run desktop:install  # builds and installs the app in /Applications (macOS arm64)
bun run desktop:dmg    # builds the .dmg in release/
```

CI runs `bun run check` and `bun run build:sidecar` on every pull request. A pull request merges only when it passes.

## Status

It shows the threads of the local T3 environment only. Its write actions are send a message, and settle or unsettle a thread. It has no snooze or interrupt.

A macOS desktop app, with a Dock badge, notifications and a menu-bar entry, installs from source with one command, or builds as a `.dmg`. [SPEC.md](SPEC.md) › "Desktop app" defines it.
