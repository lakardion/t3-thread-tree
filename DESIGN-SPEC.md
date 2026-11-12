# T3 thread tree: design spec

This spec defines the visual design of the thread tree page: the tokens, the status model, the row anatomy, the layout, the components, and the data that the backend must add to the tree. Where it differs from [SPEC.md](SPEC.md) › UI, this spec wins. The tree rules, the data source and the runtime in `SPEC.md` do not change. Terms are defined in [CONTEXT.md](CONTEXT.md).

The design merges two proposals: [A, "Harbor"](.wayfinder/design-overhaul/research/02-opus-proposal.md) and [B, "Slate signal"](.wayfinder/design-overhaul/research/03-sol-proposal.md). The mockups in the same folder show the two starting points, not this result.

## Choices

Each row gives the choice and its one reason.

| Part | Choice | Reason |
|---|---|---|
| Palette | Harbor (A), with the stronger borders of B and no lowered text opacity (B) | Only Harbor has a dot token and a text token for each status. |
| Row | One line of 36 px with a status column: icon, phrase and elapsed time (merge) | The tree stays dense and the phrase is in view. |
| Details | An inline details block below the row, opened by a button (B) | It works with keyboard and touch, and it stays open during stream updates. |
| Details content | The curated set of A: no ids, no housekeeping fields | Each line helps a decision, and the decoder stays small. |
| Motion | Working: the ring turns (B). Needs input: the left edge breathes (A). All other states are still. | Motion then means "alive" or "waiting for you". |
| Projects | Cards (A) with a neutral header gradient (B) | Color then always means status. |
| Gradients | Color gradients for state and for the stack only (A, reduced) | Calm rows stay flat, so a gradient keeps its meaning. |
| Layout | Fold single-thread key groups (A), stack rail (A), centered column of 1200 px maximum (B), one status shape per thread on closed rows (A) | Fewer rows, a visible stack, and no wide gap between title and chips. |
| Header | Attention summary (A), "Needs you" filter (A), theme choice (B), first-load skeleton (A) | They answer "what needs me?" before the user reads the tree. |
| Inventory | Row: status phrase, elapsed time, age, PR marks. All other useful fields: details. | The row holds only what the user scans. |

Rejected from both proposals: the last message of a thread, in any place; subagent and background task counts, in any place; a model chip, tags, pin, limit and stop flags on the row (they are in details); hashed project hues (A); exhaustive details with ids (B); a hover card (A); a popover for extra PR links (B).

### Changes to the "not shown" rules

| Rule from the rough tree UI | Result |
|---|---|
| No update age | Overturned. The row shows the age. |
| No launched-by hint | Overturned. Details show "Launched by" when the thread does not nest under its spawner. |
| No last message | Kept. |
| No subagent rows, counts or signals (tree rule 2) | Kept. The page does not read `pendingBackgroundTasks`. |

### Correction to SPEC.md › UI

A pending request wins over snooze. `statusOf` in `src/server/build-tree.ts` already does this; the status table in `SPEC.md` › UI says the opposite and is wrong. A blocking request stops the agent, and a muted row would hide it.

## Tokens

Put these tokens in `src/page/index.css`. They replace the neutral shadcn values and the six `--color-status-*` values in `@theme`.

```css
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: oklch(0.985 0.004 250);
  --foreground: oklch(0.22 0.02 262);
  --card: oklch(1 0 0);
  --card-foreground: var(--foreground);
  --popover: oklch(1 0 0);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.5 0.17 262);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.965 0.006 250);
  --secondary-foreground: var(--foreground);
  --muted: oklch(0.965 0.006 250);
  --muted-foreground: oklch(0.5 0.02 258);
  --accent: oklch(0.955 0.012 255);
  --accent-foreground: var(--foreground);
  --destructive: oklch(0.52 0.19 22);
  --border: oklch(0.869 0.022 253);
  --input: oklch(0.869 0.022 253);
  --ring: oklch(0.5 0.17 262);
  --radius: 0.625rem;

  --status-needs-input: oklch(0.66 0.17 52);
  --status-needs-input-fg: oklch(0.52 0.14 48);
  --status-working: oklch(0.61 0.14 238);
  --status-working-fg: oklch(0.5 0.13 240);
  --status-done: oklch(0.62 0.15 155);
  --status-done-fg: oklch(0.49 0.12 155);
  --status-failed: oklch(0.62 0.2 20);
  --status-failed-fg: oklch(0.52 0.19 22);
  --status-plan: oklch(0.6 0.19 295);
  --status-plan-fg: oklch(0.5 0.19 295);
  --status-idle: oklch(0.63 0.015 258);
  --pr-merged: oklch(0.5 0.19 300);
  --wash: 11%;
}

.dark {
  --background: oklch(0.17 0.015 262);
  --foreground: oklch(0.95 0.008 255);
  --card: oklch(0.205 0.017 262);
  --popover: oklch(0.23 0.018 262);
  --primary: oklch(0.72 0.14 262);
  --primary-foreground: oklch(0.17 0.015 262);
  --secondary: oklch(0.25 0.018 262);
  --muted: oklch(0.25 0.018 262);
  --muted-foreground: oklch(0.7 0.02 258);
  --accent: oklch(0.26 0.022 262);
  --destructive: oklch(0.76 0.14 18);
  --border: oklch(0.42 0.03 257);
  --input: oklch(0.42 0.03 257);
  --ring: oklch(0.72 0.14 262);

  --status-needs-input: oklch(0.8 0.15 70);
  --status-needs-input-fg: oklch(0.83 0.13 72);
  --status-working: oklch(0.76 0.12 230);
  --status-working-fg: oklch(0.8 0.1 230);
  --status-done: oklch(0.77 0.14 160);
  --status-done-fg: oklch(0.8 0.12 160);
  --status-failed: oklch(0.7 0.17 18);
  --status-failed-fg: oklch(0.76 0.14 18);
  --status-plan: oklch(0.72 0.15 295);
  --status-plan-fg: oklch(0.78 0.12 295);
  --status-idle: oklch(0.55 0.02 258);
  --pr-merged: oklch(0.76 0.13 300);
  --wash: 14%;
}
```

In `@theme inline`, register each `--status-*` token as `--color-status-*` and `--pr-merged` as `--color-pr-merged`. Keep the existing shadcn registrations.

Token use:

- `--status-<name>` is for shapes: icons, edges, washes. `--status-<name>-fg` is for text.
- Statuses share tokens: `working`, `starting` and `waiting` use `working`. `your-turn` and `done` use `done`. `failed` and `interrupted` use `failed`. `plan-ready` uses `plan`. `snoozed` and `idle` use `--status-idle` for the shape and `--muted-foreground` for the text.
- Do not lower the opacity of text. A muted row uses `--muted-foreground`.

### Theme

The page header has a System / Light / Dark choice. The page stores it in `localStorage` under `thread-tree:theme`. An inline script in `index.html` sets the `dark` class on `<html>` before the first paint: for Dark, or for System when `prefers-color-scheme: dark` matches. With System, the page follows a change of the system theme.

### Contrast

WCAG 2 contrast ratios, computed from the token values above. Text needs 4.5:1 or more. Shapes need 3:1 or more.

| Token | Light: page | Light: card | Dark: page | Dark: card |
|---|---:|---:|---:|---:|
| `foreground` | 16.59 | 17.32 | 16.53 | 15.49 |
| `muted-foreground` | 5.74 | 6.00 | 7.16 | 6.71 |
| `primary` | 5.92 | 6.18 | 7.63 | 7.15 |
| `status-needs-input` (shape) | 3.16 | 3.30 | 9.98 | 9.35 |
| `status-needs-input-fg` | 5.58 | 5.83 | 11.11 | 10.41 |
| `status-working` (shape) | 3.54 | 3.70 | 9.13 | 8.56 |
| `status-working-fg` | 5.57 | 5.81 | 10.46 | 9.80 |
| `status-done` (shape) | 3.26 | 3.40 | 9.78 | 9.17 |
| `status-done-fg` | 5.66 | 5.91 | 10.75 | 10.07 |
| `status-failed` (shape) | 3.86 | 4.02 | 6.62 | 6.20 |
| `status-failed-fg` | 5.84 | 6.09 | 8.38 | 7.85 |
| `status-plan` (shape) | 4.09 | 4.27 | 7.34 | 6.88 |
| `status-plan-fg` | 6.29 | 6.56 | 9.23 | 8.65 |
| `status-idle` (shape) | 3.35 | 3.50 | 3.94 | 3.70 |
| `pr-merged` (text) | 6.32 | 6.59 | 8.54 | 8.00 |

Thread rows sit on the card. On `--muted`, the light `status-needs-input` shape is 2.98:1, so do not put a status shape on a `--muted` surface. The border is decoration (1.48:1 light, 2.12:1 dark on the card) and never the only sign of a state.

## Status model

`ThreadNode.status` has eleven values. The backend applies the first rule that matches.

| Order | Status | When |
|---|---|---|
| 1 | `needs-input` | `pendingRuntimeRequest` is set and its `blocking` is not `false`, or `pendingGuestMessageCount` is more than 0 |
| 2 | `snoozed` | `snoozedUntil` is in the future |
| 3 | `waiting` | The run status is `running` or `waiting`, and `blockedOnThreadWait` is true |
| 4 | `working` | The run status is `running` or `waiting` |
| 5 | `starting` | The run status is `queued`, `preparing` or `starting` |
| 6 | `plan-ready` | `completed`, `interactionMode` is `plan`, and `hasActionableProposedPlan` is true |
| 7 | `your-turn` | `completed`, and the completion is unseen |
| 8 | `done` | `completed` |
| 9 | `failed` | `failed` |
| 10 | `interrupted` | `interrupted`, `cancelled` or `rolled_back` |
| 11 | `idle` | All other cases |

- The run status is `activityRunStatus` when it is not null, and `status` in all other cases.
- A completion is unseen when `latestRunCompletedAt` is set, and `lastVisitedAt` is absent or earlier than `latestRunCompletedAt`.
- A request with `blocking: false` does not change the status. The row shows an "Input" chip (see [Thread row](#thread-row)).

### Phrase, shape and motion

The backend sends `phrase` and `since`. The page adds the elapsed time from `since` to the phrase, and updates it once each minute.

| Status | Icon (`lucide-react`) | Phrase | `since` | Motion |
|---|---|---|---|---|
| `needs-input` | `Diamond`, filled | See the request table | `pendingRuntimeRequest.createdAt` | The left edge breathes |
| `working` | `LoaderCircle` | "Working" | `activityRunStartedAt`, else `latestRunStartedAt` | The icon turns |
| `starting` | `CircleDashed` | "Queued" for `queued`, else "Starting" | none | none |
| `waiting` | `CirclePause` | "Waiting" | none | none |
| `plan-ready` | `ListChecks` | "Plan ready" | none | none |
| `your-turn` | `CircleCheck` | "Your turn" | none | none |
| `done` | `Check` | "Done" | none | none |
| `failed` | `CircleX` | "Failed" | none | none |
| `interrupted` | `Square` | "Interrupted", or "Cancelled" for `cancelled` | none | none |
| `snoozed` | `Moon` | "Snoozed" | none | none |
| `idle` | `Circle` | "Idle" | none | none |

Request phrase, from `pendingRuntimeRequest.kind`:

| Kind | Phrase |
|---|---|
| `command`, `file-read`, `file-change`, `permission`, `dynamic_tool_call` | "Approval" |
| `user_input`, `mcp-elicitation` | "Question" |
| `auth_refresh` | "Sign in" |
| No request, guest messages only | "Guest message" |
| Any other kind | "Input" |

Elapsed time and age use one format: "now" below 1 minute, then "12m", "3h", "2d". The phrase with time reads "Working 12m" and "Approval · 3m".

Icons are 12 px. If an icon name is not in the installed `lucide-react`, use the nearest shape and keep each status distinct. Color is never the only signal: each status has a shape and a phrase.

### Motion CSS

```css
.thread-row[data-status="working"] .status-icon { animation: work-turn 1.4s linear infinite; }
@keyframes work-turn { to { transform: rotate(360deg); } }

.thread-row[data-status="needs-input"]::before { animation: breathe 2.4s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: 0.45; } }

@media (prefers-reduced-motion: reduce) {
  .thread-row .status-icon, .thread-row::before { animation: none; }
}
[data-conn="down"] .thread-row .status-icon, [data-conn="down"] .thread-row::before { animation: none; }
```

With reduced motion, the shape, the phrase and the static edge still tell each status apart.

## Gradients

Five gradients, all static. No gradient on text, on the page background, or on a row with another status.

```css
/* Project card header: neutral. */
.project-head { background: linear-gradient(100deg, var(--muted), var(--card) 75%); }

/* Needs input: warm wash and a 2 px left edge. */
.thread-row[data-status="needs-input"] {
  background: linear-gradient(90deg, color-mix(in oklch, var(--status-needs-input) var(--wash), transparent), transparent 45%);
}
.thread-row[data-status="needs-input"]::before { background: var(--status-needs-input); }

/* Working: weaker wash and a 2 px left edge. */
.thread-row[data-status="working"] {
  background: linear-gradient(90deg, color-mix(in oklch, var(--status-working) calc(var(--wash) * 0.6), transparent), transparent 35%);
}
.thread-row[data-status="working"]::before { background: var(--status-working); }

/* The edge. */
.thread-row { position: relative; }
.thread-row[data-status="needs-input"]::before,
.thread-row[data-status="working"]::before {
  content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; border-radius: 1px;
}

/* Stack rail: from the base of the stack (blue) to its top (violet). */
.stack-rail { position: relative; padding-left: 10px; }
.stack-rail::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 2px;
  background: linear-gradient(180deg, var(--primary), var(--status-plan));
}

/* Stack position chip. */
.chip-stack { background: linear-gradient(135deg, color-mix(in oklch, var(--primary) 10%, var(--card)), var(--card)); }
```

The hover background of a row is `--accent`. It replaces the wash while the pointer is on the row.

## Layout

### Page

- One centered column: `max-width: 1200px`, 16 px side padding.
- Header, one line that wraps: the title "Thread tree" (15 px, semibold), the attention summary, the "All / Needs you" filter, then at the right the "show settled" switch and the theme choice.
- The banner is below the header, as now.
- Project cards follow, 12 px apart.

**Attention summary.** Four count chips over the visible threads, nested threads included:

| Chip | Counts | Style |
|---|---|---|
| "N need you" | `needs-input`, `plan-ready` | Amber wash and `--status-needs-input-fg`. Hidden when N is 0. |
| "N working" | `working`, `starting`, `waiting` | Outline |
| "N your turn" | `your-turn` | Outline |
| "N stopped" | `failed`, `interrupted` | Outline |

**"Needs you" filter.** It keeps the threads with status `needs-input`, `plan-ready` or `your-turn`, and the groups and projects that hold them. A thread that matches keeps its place under a spawner that does not match; that spawner row stays, in muted color. The filter runs on the page. The backend tree does not change. The page stores the choice in `localStorage` under `thread-tree:filter`.

**States of the page:**

- Before the first push: three row skeletons in one card.
- No visible thread: the text "No active threads."
- T3 down or token rejected: the banner as in `SPEC.md`, and `data-conn="down"` on the tree. The tree gets `filter: grayscale(1)` and no lowered opacity. The motion stops. The banner has `role="status"`.

### Project card

- One `Card` for each project, radius 12 px.
- Header, 40 px high, with the neutral gradient: disclosure chevron, monogram (first letter of the name, 20 px square, `--muted` background, `--muted-foreground` text), project name (14 px, semibold), then the repository as `owner/name` (12 px, mono, muted) when T3 sends it.
- A closed project shows one status icon for each thread after the name, in tree order.
- Body: the groups, 6 px padding.

### Groups

- A key group with two or more top-level threads has a header row: 28 px high, chevron, key in mono 12 px semibold. Its threads indent 16 px.
- A key group with one top-level thread folds: it has no header row. The thread row shows the key as a chip, and the title loses its key prefix (the key and the separators after it: spaces, `·`, `:`, `-`). This also applies to a key group inside Reviews. The fold runs on the page; the backend tree does not change.
- "Reviews" and "No issue key" have a muted header row (12 px, semibold) and do not fold.
- A closed group shows one status icon for each thread.
- Nested launched threads indent 16 px for each level.

### Stack rail

Key groups of one project that share a PR stack sit together (tree rule 8). The page wraps them in one `.stack-rail` block with a label row above the first group: the `Layers` icon, then "PR stack · N PRs · base `<base>`" in 12 px muted text. The base part shows only when T3 sends it. The stack chip stays on each thread row.

### Thread row

One line, `min-height: 36px`, radius 8 px, 13 px text with a 20 px line height.

```
[icon] [phrase + time  ] [KEY] Title ...............  [Input] [until] [stack] [#PR] [#PR] [+N] [age] [details]
 12px   120px column      chip  flex, truncates        right group, gap 6px
```

| Part | Rule |
|---|---|
| Icon | 12 px, in `--status-<name>`. A tooltip shows the raw T3 status. |
| Phrase | 12 px, weight 500, in the status text color. The column is 120 px wide and does not wrap. |
| Key chip | Only on a folded group. Mono 11 px, muted, outline. |
| Title | The link to T3. Weight 500; weight 650 when the status is `your-turn`. `--muted-foreground` when the status is `snoozed` or the thread is settled. It truncates with an ellipsis. |
| "Input" chip | Outline. Only when a request with `blocking: false` is pending. |
| "until" note | "until Fri 10:42" in an outline chip, when `snoozedUntil` is in the future. It also shows on a `needs-input` row of a snoozed thread. |
| "Settled" chip | Outline, muted. Only with "show settled" on, on a settled thread. |
| Stack chip | `.chip-stack`, the `Layers` icon and "2/4", or "base · 4" when the thread created no PR in the stack. |
| PR chips | The first two PRs, then a "+N" button that opens the details block. |
| Age | Relative age of `updatedAt`, mono 11 px, muted, `tabular-nums`. The tooltip shows "Updated" and the exact time. |
| Details button | Ghost icon button with `ChevronDown`, `aria-expanded`, label "Details". |

**PR chip.** "#2102" in mono 11 px, a link to the PR, with these marks:

| Mark | When |
|---|---|
| Dot, `--status-done` | `checksState` is `passing` |
| Dot, `--status-failed` | `checksState` is `failing` |
| Ring, `--status-needs-input` | `checksState` is `pending` |
| `Check` icon | `reviewDecision` is `approved` |
| `X` icon | `reviewDecision` is `changes-requested` |
| `TriangleAlert` icon | `mergeability` is `conflicting` |
| Dashed border | `isDraft` is true |
| Text in `--pr-merged` | `state` is `merged` |
| Text struck through, muted | `state` is `closed` |

An absent value shows no mark. Each mark has a `title` with its meaning.

**Narrow screens.** Below 720 px, the right group wraps to a second line below the title, and the title can wrap to two lines. The page never scrolls sideways. On a touch screen, buttons have a 44 px target.

### Details block

The details button opens a block below the row, inside the same list item, indented to the title. It is a `Collapsible`. The page keeps the ids of open blocks in one Set outside the pushed tree, in memory only.

The block is a two-column list of label and value, 12 px. It shows a line only when the value is present. Paths, branches and ids of models are in mono.

| Line | Value |
|---|---|
| Request | The raw request kind and its age: "command · 3m". |
| Error | `lastErrorClass`, `lastErrorCode`, then `lastError` as plain text. |
| Limit | "resets 14:00" from `usageLimitResetAt` or `limitRecovery.resetAt`, and "auto-resume" when `limitRecovery.autoResume` is true. |
| Run | "Stop requested" when `latestRunStopRequested` is true. |
| Model | `modelSelection.model`, and "plan mode" when `interactionMode` is `plan`. |
| Branch | `branch`. |
| Worktree | `worktreePath`, with the home folder as `~`. |
| Launched by | The title of the spawner, as a link to that thread in T3. Only when the thread has a spawner and does not nest under it. |
| Origin | "Fork of `<title>`" from `forkedFrom` when the source thread is known, "Delegated from `<title>`" from `delegatedFrom`, or "via `<label>`" from `linkOrigin`. |
| Started by | `createdBy` and `creationSource`: "agent via mcp". |
| Created | Relative age of `createdAt`. |
| Goal | `goal.objective` and `goal.status`. |
| Tags | `tags` as plain text. "Pinned" when `pinnedAt` is set. |
| PRs | One line for each PR, all PRs of the row: number, title, state, checks, review, "+212 -40 · 9 files". |

### Typography and focus

- Sans: `Inter` when installed, else `system-ui`. Mono: `ui-monospace, "SF Mono", Menlo`.
- Sizes: page title 15 px; project name 14 px; row title 13 px; phrase, group headers and details 12 px; chips and age 11 px.
- Radius: card 12 px, row 8 px, chip 6 px.
- Keep the nested `<ul>` lists. Do not add ARIA tree roles.
- Each link and button shows a 2 px `--ring` focus ring with a 2 px gap. A tooltip is never the only source of a label.

## Components

| Page part | shadcn component | State |
|---|---|---|
| Project card | `Card` | Add |
| Project and group disclosure, details block | `Collapsible` | Installed |
| Details button, "+N" button | `Button` | Add |
| Filter "All / Needs you" | `ToggleGroup`, `type="single"` | Add |
| Theme choice | `Select` | Add |
| First load | `Skeleton` | Add |
| "show settled" | `Switch`, `Label` | Installed |
| Summary chips, key chip, stack chip, PR chips, notes | `Badge` | Installed |
| Raw status, exact time | `Tooltip` | Installed |
| Banner | `Alert` | Installed |

Add components with the shadcn CLI. Status icons, washes, edges and the stack rail are plain Tailwind classes and the CSS in this spec.

## Data

All new stream fields are optional or nullable in the T3 shell schema (`OrchestrationV2ThreadShell` in `packages/contracts/src/orchestrationV2.ts` of T3 Code). Decode each one leniently: an absent value is null, not zero or false.

### New fields to decode from the stream

| For | Thread fields |
|---|---|
| Status | `activityRunStatus`, `blockedOnThreadWait`, `pendingRuntimeRequest.createdAt`, `pendingRuntimeRequest.blocking`, `pendingGuestMessageCount`, `hasActionableProposedPlan`, `interactionMode`, `latestRunCompletedAt`, `lastVisitedAt` |
| Elapsed time | `activityRunStartedAt`, `latestRunStartedAt` |
| PR marks | `pullRequests[].snapshot`: `isDraft`, `checksState`, `reviewDecision`, `mergeability` |
| Stack rail | `pullRequests[].stack.base` |
| Details | `lastError`, `lastErrorClass`, `lastErrorCode`, `usageLimitResetAt`, `limitRecovery.resetAt`, `limitRecovery.autoResume`, `latestRunStopRequested`, `modelSelection.model`, `branch`, `worktreePath`, `forkedFrom`, `delegatedFrom.title`, `linkOrigin.label`, `createdBy`, `creationSource`, `createdAt`, `goal.objective`, `goal.status`, `tags`, `pinnedAt`, and `pullRequests[].snapshot`: `title`, `additions`, `deletions`, `changedFiles` |
| Project card | `repositoryIdentity.owner` and `repositoryIdentity.name` of the project |

### Tree type

`src/shared/tree.ts` changes to this shape. Times are ISO strings; the page formats them.

```ts
export type Status =
  | "needs-input" | "working" | "starting" | "waiting" | "plan-ready"
  | "your-turn" | "done" | "failed" | "interrupted" | "snoozed" | "idle";

export type PrNode = {
  n: number;
  url: string;
  state: string;
  draft: boolean;
  checks: "passing" | "failing" | "pending" | null;
  review: "approved" | "changes-requested" | "review-required" | null;
  conflicting: boolean;
  title: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
};

export type Detail = {
  request: string | null;
  error: { class: string | null; code: string | null; text: string | null } | null;
  limitResetAt: string | null;
  autoResume: boolean;
  stopRequested: boolean;
  model: string | null;
  planMode: boolean;
  branch: string | null;
  worktreePath: string | null;
  launchedBy: { title: string; href: string } | null;
  origin: string | null;
  startedBy: string | null;
  createdAt: string | null;
  goal: { objective: string; status: string } | null;
  tags: string[];
  pinned: boolean;
};

export type ThreadNode = {
  id: string;
  href: string;
  title: string;
  /** The issue key of the title, for the fold. */
  key: string | null;
  status: Status;
  phrase: string;
  /** Start of the elapsed time in the phrase. */
  since: string | null;
  /** Raw T3 status, for the icon tooltip. */
  raw: string;
  updatedAt: string;
  settled: boolean;
  /** A request with `blocking: false` is pending. */
  input: boolean;
  snoozedUntil: string | null;
  stack: { pos: number | null; total: number } | null;
  prs: PrNode[];
  detail: Detail;
  children: ThreadNode[];
};

export type Branch = {
  id: string;
  label: string;
  /** Project branches only: `owner/name`. */
  repo?: string;
  /** Key groups in a PR stack. Adjacent groups with the same `id` share one rail. */
  stack?: { id: string; total: number; base: string | null };
  branches: Branch[];
  threads: ThreadNode[];
};
```

`Conn` and `Tree` do not change. No new endpoint and no new push are necessary: the page computes elapsed time, age, the fold, the filter and the summary from the tree.

## Checks for each build key

- `bun test` and `bun run typecheck` pass.
- `bun run demo` in light and dark mode, at 1400 px and at 390 px wide. `scripts/demo.ts` has a thread for each status that the key draws.
- Keyboard: Tab reaches each link and button, and the focus ring is visible.
- Reduced motion: no animation runs.
- A thread with absent optional fields shows no empty line, chip or mark.
