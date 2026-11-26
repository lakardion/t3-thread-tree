<p align="center"><img src="assets/icon.svg" alt="T3 thread tree app icon" width="128" height="128"></p>

# T3 thread tree

A live map of your [T3 Code](https://github.com/pingdotgg/t3code) threads.

T3 Code shows threads as a flat list. When agents launch threads, review PRs and work through PR stacks, a flat list does not show how the work fits together. This app shows the active threads as one tree, **Project › issue key › thread**, with a status and PR marks on each row. Click a thread to open it in T3 Code.

Use it as a Mac app or in a browser. The Mac app adds a Dock badge, notifications, a menu-bar entry and a small Up next window.

![The thread tree: projects, issue keys and threads, with status, PR marks and a PR stack](docs/hero.png)

## What you get

### See all your work in one tree

- **One tree for all projects.** Threads group by project, then by the first issue key in the title. Review threads go in a Reviews group. A thread with no group sits directly in its project. You can drag every group, the Reviews group and every loose thread, and "Last updated" sorts them together.
- **Status at a glance.** Each row starts with a status icon. Rows that wait for you show the wait time and a phrase, such as "Approval" or "Your turn".
- **PR marks and stacks.** Each row shows its PRs with checks, review, conflicts and merge marks. Threads in one PR stack sit in one block, with numbered stops from the base branch to the top PR. A thread with a merged PR stays at its place in the stack, with a purple dot that has no number. In a long stack the stops overlap. They spread out when you point at them or move focus to them. The block shows the GitHub stack number at the far right. Click it to copy the number.
- **Workflow runs.** An active T3 workflow run shows as a row with step pills. A rail under it lists each step with its thread.
- **Map groups.** Threads that work on one Wayfinder map sit in one group, under an amber rail. The group has the map thread as its head, or a Map header when that thread is settled. A count shows the members. Fold the group to hide them. Mark any thread as a map thread from its Details, for a map that has no map file. The marks are in `~/.config/t3-thread-tree/map-threads` (env `MAP_THREADS_FILE`).
- **PR graph.** The branch button on a map head, or the key `g`, opens a graph of the map's PRs from `main`, with lanes, gh stacks and marks for problems such as conflicts. Each PR links to GitHub and to its thread.
- **One time on each row.** The age on a row is its Last run. "Last updated" sorts by the same time. A parent or a group takes the Last run of its newest thread that counts. Settled threads count only when all threads of the block are settled. Snoozed threads count only while "Show snoozed threads" is on. Point at the age to see which thread gives the time. A header shows no age, but its hover shows the same time.
- **Choose how threads group.** Settings › Grouping lists the placement rules. Switch each rule on or off. Drag Reviews, PR stack and Issue key to reorder them. A line under the list tells what changes from the default placement. Changes apply at once.
- **Pins.** Pin a thread, group, PR stack, Reviews or project, so that it stays at the top of its list in every sort. Use the pin button on the row, or press `p` on the focused row. A drag works inside the pinned part or inside the unpinned part. Unpin an item and it goes back to its old place. The browser saves the pins.
- **Live.** Changes arrive as T3 streams them. No polling, no reload.
- **Row toolbar.** Each row has a `⋯` button. Point at it, or click it, to open a toolbar with Settle, Send and Workflow. The row does not move when the toolbar opens.
- **Stream recovery.** When live updates stop, a banner tells you that the rows can be out of date and shows the time of the last update. The page reconnects by itself. Click **Reconnect now** to try at once.

### Know what needs you

![The Needs you filter in dark mode, with Catch-up lines under the waiting rows](docs/needs-you.png)

- **Catch-up line.** Under each waiting or failed row, a model writes what the thread did and what it asks, with the answer options as chips.
- **Last message preview.** Put the pointer over a Catch-up line to see the end of the last message with Markdown formatting.
- **Needs you.** One filter keeps only the threads that wait for you: needs input, plan ready and your turn. The browser tab title, the Dock badge and the menu-bar list show the count. A your-turn thread counts, but it sends no notification.
- **Empty list.** When a filter hides every thread, the list says why and gives a button to show them again.
- **Open next.** The key `n` opens the thread that has waited longest.
- **Run questions and Paused runs.** A question from a T3 workflow, and a run that a failed step paused, also count as Needs you.
- **Triage mode.** The key `t` shows one card at a time for the waiting threads and runs. Reply, pick a chip, settle or snooze, each with one key. Answer a Run question, or resume or cancel a Paused run, from the same card.

![Triage mode in dark mode, with a question and two answer chips](docs/triage.png)

- **Set up the Local model with an agent.** In Settings › Local model, the button "Set up with an agent" starts a T3 thread that installs Ollama and the model for you, and saves the config.

### Also

- **Mac app:** Dock badge, notifications, a menu-bar entry and an Up next window (⌥⌘U) that stays on top.
- **Start a workflow:** type `>` in Cmd+K, or use the workflow button on a row, a PR stack or the Looks done list.
- **Suggested replies:** the send dialog offers reply chips, such as `commit push`, from the last agent message.
- **Looks done:** finds threads that look finished and settles them in one step, with undo. The eye button on a row shows the last message of the thread in the same dialog, with Markdown formatting, so you can examine the thread before you settle it.
- **Views:** Tree or Flat, group by T3 project, Linear project or status, and drag rows into your own order.
- **Find and keys:** Cmd+K searches all threads. Hold Alt/Option to see the keys next to the controls. Settings lists all keys.

[SPEC.md](SPEC.md) gives the full rules for each feature.

## Getting started

### 1. Check what you need

- A Mac with Apple Silicon.
- [T3 Code](https://github.com/pingdotgg/t3code), installed and running on the same Mac. The app reads `~/.t3/userdata` and sends messages with the `t3` CLI in `~/.t3/bin/t3`.

### 2. Install the app

Download the `.dmg` of the latest release from the [Releases page](https://github.com/lakardion/t3-thread-tree/releases/latest). Open it and drag **T3 Thread Tree** to `/Applications`.

### 3. Open the app the first time

The app is not notarized by Apple. It has an ad-hoc signature, not a Developer ID signature. Thus macOS blocks it at the first open and says that it cannot check the app. To open it:

1. Open the app one time, and close the warning.
2. Open System Settings › Privacy & Security.
3. Scroll to "T3 Thread Tree was blocked" and click **Open Anyway**. Confirm with your password or Touch ID.

Or remove the quarantine mark in Terminal, then open the app as usual:

```sh
xattr -dr com.apple.quarantine "/Applications/T3 Thread Tree.app"
```

Do this step again only when you install a new `.dmg` by hand. The app can also update itself in place (see [Updates](#updates)). An update from the app does not need this step again.

### 4. Connect the app to T3

The app needs a T3 token. Run this command in Terminal. It copies a new token to the clipboard:

```sh
~/.t3/bin/t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope filesystem:read --label thread-tree --ttl 52w --token-only | pbcopy
```

In the app, click the cog to open Settings. Open the **T3 token** fold, paste the token and save. The tree shows at once.

The scopes:

- `orchestration:read` shows the tree.
- `orchestration:operate` lets you settle and snooze threads.
- `filesystem:read` lets the app fill the fields when you start a workflow. Without it, the rest of the app works.

The token is valid for 52 weeks. When it expires, the app shows a banner. Issue a new token and paste it again.

### 5. Turn on the Catch-up (optional)

The Catch-up writes a short line under each waiting thread. A model writes it. Choose one:

- **Claude or Codex:** install the `claude` or `codex` CLI and log in. The app finds it.
- **A local model**, such as Ollama. See [Local model setup](docs/local-model.md).
- **The Apple model**, on macOS 26.4 or later. See [Apple model setup](docs/apple-model.md).

Then open Settings › **Catch-up**, turn on the switch and pick the model. The Apple model and a local model keep thread text on your Mac. Claude and Codex send it to their provider.

### 6. Link Linear (optional)

Issue keys can link to Linear, and the tree can group by Linear project and milestone. See [Linear setup](docs/linear.md).

### Updates

The app checks GitHub Releases. When a new version exists, the app menu, the menu-bar menu and Settings show **Update and restart**.

### Use it in a browser

The browser version runs from source and needs [Bun](https://bun.sh). See [Contributing](#contributing).

## Contributing

### Requirements

- [Bun](https://bun.sh) 1.3 or later.
- T3 Code running on the same machine.
- For the desktop app: macOS on Apple Silicon.
- To build the Apple model helper: Command Line Tools with the macOS 26.4 SDK or later.
- To run `bun run screenshots`: Google Chrome.

### Set up

```sh
bun install
```

Start the app with `bun start`, and paste a T3 token in Settings › T3 token, as in [Getting started](#4-connect-the-app-to-t3). The server keeps the token in `~/.config/t3-thread-tree/token`. The desktop app keeps its data in `~/Library/Application Support/T3 Thread Tree/`.

A `.env` file in the repo gives fallback values. A value saved in Settings wins.

| Variable                                             | Use                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `T3_TOKEN`                                           | The T3 token, when no token is saved.                          |
| `T3_BIN`                                             | The path of the `t3` CLI. The default is `~/.t3/bin/t3`.       |
| `LINEAR_WORKSPACE`, `LINEAR_TEAMS`, `LINEAR_API_KEY` | Linear links and grouping. See [Linear setup](docs/linear.md). |
| `PORT`                                               | The server port. The default is `4773`.                        |

### Run

```sh
bun start
```

Open <http://127.0.0.1:4773>. The app starts even when T3 is not running. Until T3 is back, the page shows the last tree, greyed.

- `bun run desktop` opens the desktop window from source.
- `bun run demo` serves made-up data at <http://127.0.0.1:4774>, with no T3. Set `CLIS=0` to offer no CLI model, `PUSH=1` to fake a live change every 3 seconds, `SEND=failed` to make a send fail, and `T3CLI=0` to show the `t3` CLI as missing. Set `GRAPH=fail` to make one PR key query of the map PR graph fail, and `GRAPH=down` to make the graph answer that T3 is down.
- `bun run desktop:demo` shows the demo in the desktop window.

### Commands

```sh
bun test                 # unit tests
bun run typecheck        # types
bun run lint             # oxlint
bun run fmt              # oxfmt, writes fixes
bun run check            # all of the above, as CI runs it
bun run build:sidecar    # compiles the server (macOS arm64)
bun run build:apple-helper  # compiles the Apple model helper (macOS 26.4 SDK)
bun run desktop:install  # builds and installs the app in /Applications
bun run desktop:dmg      # builds the .dmg in release/
bun run release          # builds the .dmg and .zip and creates the GitHub release
bun run screenshots      # writes the framed README screenshots in docs/ from the demo data (needs Google Chrome)
```

`bun run desktop:install` replaces the app in `/Applications`. Quit the app first.

CI runs `bun run check` and `bun run build:sidecar` on every pull request. A pull request merges only when it passes.

### Rules for a change

- [SPEC.md](SPEC.md) defines the behavior, [DESIGN-SPEC.md](DESIGN-SPEC.md) the visual design, and [GLOSSARY.md](GLOSSARY.md) the terms. Update them with the code.
- When a change adds or changes a feature that the user sees, update this README in the same change. Write in ASD-STE100 Simplified Technical English.
- When the UI changes, run `bun run screenshots` to make the screenshots again.

### How it works

```
T3 Code ──WebSocket (orchestration.subscribeShell)──▶ Bun server ──SSE (/events)──▶ React page
statev2.sqlite (read-only) ──launch lineage──────────▶
```

- `src/server/t3.ts` holds the T3 stream: a small Effect RPC client and a lenient decoder. T3's protocol is internal, so all protocol code stays in this one module.
- `src/server/lineage.ts` reads `statev2.sqlite`, read-only, for launch lineage and the last message of each thread.
- `src/server/model.ts` runs every model call, such as the Catch-up.
- `src/server/build-tree.ts` applies the tree rules. It is a pure function, and `bun test` covers it.
- `src/server.ts` builds the tree again on each change and pushes it over Server-Sent Events.
- `src/page/` is a React, Tailwind and shadcn page, bundled by Bun's HTML imports. There is no Vite and no build step.
- `src/shared/` holds the types and logic that the server and the page share.

The app writes to T3 in two ways. A send or a workflow start runs the `t3` CLI. Settle, unsettle and snooze go over the stream, with the `orchestration:operate` scope of the token.

The desktop app is Electron. `src/desktop/main.ts` starts the compiled server as a child process and loads the page in the window. electron-builder packages and signs the app ad-hoc.
