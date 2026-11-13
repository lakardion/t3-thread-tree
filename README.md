# T3 thread tree

A live, read-only map of your [T3 Code](https://github.com/pingdotgg/t3code) threads.

T3 Code shows threads as a flat list. When agents launch threads, review PRs and work through PR stacks, a flat list does not tell you how the work fits together. This app shows the active threads as one tree, **Project › issue key › thread**, with a status and the PR marks on each row. Click a thread to open it in T3 Code.

![The thread tree in light mode](docs/tree-light.png)

![The thread tree in dark mode, with one project closed and one details block open](docs/tree-dark.png)

_Screenshots use made-up data from `bun run demo`._

## What you get

- **One card for each project.** The card header shows the repository (`owner/name`). Threads group by the first issue key in the title (`SHOP-412`, `API-81`, …). A key group with one thread folds into its row, which shows the key as a chip. Review threads (`Review #…`) go in their own Reviews group.
- **Launch lineage.** A thread that an agent launched, with no issue key, nests under the thread that launched it. T3 does not store this link, so the app reads it from T3's local database.
- **PR stacks.** Issue groups that share a stack sit next to each other, in stack order, on one rail with the label "PR stack · N PRs · base `main`". Each thread in a stack shows its position, for example `2/4`.
- **PR marks.** Each row shows its first two PRs. A PR chip shows checks (dot or ring), review (check or cross), conflicts (warning), draft (dashed border), merged (violet) and closed (struck through).
- **Stable order.** Rows keep their place while threads update. A new thread, group or project shows at the bottom of its list.
- **Status at a glance.** Each row starts with an icon, a phrase and the elapsed time, for example "Working 12m" or "Approval · 3m". Color is never the only sign.

  | Color                | Statuses                                                            |
  | -------------------- | ------------------------------------------------------------------- |
  | amber, edge breathes | needs input: approval, question, sign-in or guest message           |
  | blue                 | working (icon turns), starting or queued, waiting on another thread |
  | violet               | plan ready                                                          |
  | green                | your turn (bold title), done                                        |
  | red                  | failed, interrupted or cancelled                                    |
  | grey                 | idle, or snoozed (title muted, with the wake time)                  |

- **What needs you.** The header counts the threads that need you, are working, are your turn, or stopped. The "Needs you" filter keeps only the threads with needs input, plan ready or your turn.
- **Details on demand.** The chevron at the end of a row opens a details block: request, error, usage limit, model, branch, worktree, launched by, goal, tags and all PRs with their checks and size.
- **Linear links.** When you configure Linear (see [Setup](#setup)), issue keys of your Linear teams link to the issue.
- **Live.** Changes arrive as T3 streams them. No polling, no reload.
- **The page remembers your choices.** Closed projects and groups (they show one status icon per thread), the filter, "show settled" and the theme (System, Light or Dark) stay after a reload.
- **Settled threads on demand.** The "show settled" switch adds them. Archived threads never show.
- **What's next.** A click on "What's next" shows a ranked list of next steps over the active threads, each with links to its threads. Code makes the obvious steps at once: answer a waiting agent, fix a PR with failing checks, conflicts or requested changes, and merge an approved PR. A local `claude` or `codex` CLI on a cheap model ranks the rest, and it does not run when nothing is left. A step can have a prompt that you copy with one click. The dropdown next to the button selects the CLI. A thread that is no longer active shows struck through.

## Requirements

- [Bun](https://bun.sh) 1.3 or later
- T3 Code running on the same machine (the app reads `~/.t3/userdata`)
- Optional, for "What's next": the `claude` or `codex` CLI, logged in

## Setup

```sh
bun install
```

Issue a read-only token once, and put it in `.env` (gitignored):

```sh
echo "T3_TOKEN=$(~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only)" > .env
```

Optional: link Linear issue keys. Add these to `.env`:

```sh
LINEAR_WORKSPACE=join-com   # the slug in linear.app/<workspace>
LINEAR_TEAMS=JED,ENG,MOR    # team keys that are Linear keys
```

## Run

```sh
bun start
```

Open <http://127.0.0.1:4773>.

- The page is served at once. It shows "Connecting to T3…" until the first tree is ready.
- The app starts even when T3 is not running. It retries every 3 s. Until T3 is back, the page shows the last tree, greyed, with the time of the last update.
- If T3 rejects the token, the page shows the command to issue a new one.

To see the UI without T3, run `bun run demo` and open <http://127.0.0.1:4774>. The demo uses a stub brief runner: set `BRIEF=failed`, `BRIEF=empty` or `BRIEF=rules` to see the other outcomes, and `CLIS=0` to offer no CLI.

## How it works

```
T3 Code ──WebSocket (orchestration.subscribeShell)──▶ Bun server ──SSE (/events)──▶ React page
statev2.sqlite (read-only) ──launch lineage──────────▶
```

- `src/server/t3.ts` holds the T3 stream: a small hand-written Effect RPC client with JSON frames, and a lenient decoder. T3's protocol is internal, so all protocol code stays in this one module.
- `src/server/lineage.ts` finds the spawner of a launched thread from the launch tool calls in `statev2.sqlite`, opened read-only. It also reads the last assistant message of each thread for the brief.
- `src/server/brief.ts` makes the next-step brief: the code-ranked steps, a compact text digest for the model, and the CLI run with its tools off. It serves `/brief/clis`, `/brief/run` and `/brief/cancel`, and pushes the brief state as the SSE `brief` event. `src/server/next-step-prompt.md` is the ranking guide for the model.
- `src/server/build-tree.ts` applies the tree rules: visibility, placement, stack order and the eleven statuses. It is a pure function, and `bun test` covers it.
- `src/server.ts` keeps the thread map. It builds the whole tree again on each change, and pushes it as JSON over Server-Sent Events.
- `src/page/` is a React, Tailwind and shadcn page, bundled by Bun's HTML imports (Tailwind runs through `bunfig.toml`). There is no Vite and no build step. The fold, the filter, the attention counts and the elapsed times run on the page (`attention.ts`, `format.ts`).
- [DESIGN-SPEC.md](DESIGN-SPEC.md) defines the visual design. [SPEC.md](SPEC.md) defines the tree rules, and [CONTEXT.md](CONTEXT.md) defines the terms.
- `src/shared/tree.ts` holds the `Tree` type that the server and the page share.

The app never writes to T3. It uses a token with the `orchestration:read` scope only, and it opens the database read-only.

## Develop

```sh
bun test           # tree rules, brief, lineage, attention counts, formats
bun run typecheck  # types
bun run lint       # oxlint
bun run fmt        # oxfmt, writes fixes
bun run check      # all of the above, as CI runs it
```

CI runs `bun run check` on every pull request. A pull request merges only when it passes.

## Status

It shows the threads of the local T3 environment only, and it has no write actions (settle, snooze, send).
