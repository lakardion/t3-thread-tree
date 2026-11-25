# T3 thread tree: design spec

This spec defines the visual design of the thread tree page: the tokens, the status model, the row anatomy, the layout, the components, and the data that the backend must add to the tree. Where it differs from [SPEC.md](SPEC.md) › UI, this spec wins. The tree rules, the data source and the runtime in `SPEC.md` do not change. Terms are defined in [GLOSSARY.md](GLOSSARY.md).

The design merges two proposals: [A, "Harbor"](.wayfinder/design-overhaul/research/02-opus-proposal.md) and [B, "Slate signal"](.wayfinder/design-overhaul/research/03-sol-proposal.md). The mockups in the same folder show the two starting points, not this result.

## Choices

Each row gives the choice and its one reason.

| Part            | Choice                                                                                                                                                                                                            | Reason                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Palette         | Harbor (A), with the stronger borders of B and no lowered text opacity (B)                                                                                                                                        | Only Harbor has a dot token and a text token for each status.              |
| Row             | One line of 36 px with a status column: icon, phrase and elapsed time (merge)                                                                                                                                     | The tree stays dense and the phrase is in view.                            |
| Details         | An inline details block below the row, opened by a button (B)                                                                                                                                                     | It works with keyboard and touch, and it stays open during stream updates. |
| Details content | The curated set of A: no ids, no housekeeping fields                                                                                                                                                              | Each line helps a decision, and the decoder stays small.                   |
| Motion          | Working: the ring turns (B). Needs input: the left edge breathes (A). All other states are still. A live change fades in and flashes the row once.                                                                | Motion then means "alive" or "waiting for you".                            |
| Projects        | One shared card. Each project is a block with a one-line header (T3 monogram and name) and a left edge in the project color                                                                                       | All projects show in less height, and the user finds a project by color.   |
| Gradients       | Color gradients for state and for the stack only (A, reduced)                                                                                                                                                     | Calm rows stay flat, so a gradient keeps its meaning.                      |
| Layout          | Fold single-thread key groups (A), stack rail (A), centered column of 1200 px maximum (B), one status shape per thread on closed rows, status counts on a closed project or tree group with 5 or more threads (A) | Fewer rows, a visible stack, and no wide gap between title and chips.      |
| Header          | Header counts (A), "Needs you" filter (A), theme choice (B), first-load skeleton (A)                                                                                                                              | They answer "what needs me?" before the user reads the tree.               |
| Inventory       | Row: status phrase, elapsed time, age, PR marks. All other useful fields: details.                                                                                                                                | The row holds only what the user scans.                                    |

Rejected from both proposals: subagent and background task counts, in any place; a model chip, tags, pin, limit and stop flags on the row (they are in details); exhaustive details with ids (B); a hover card (A); a popover for extra PR links (B).

### Changes to the "not shown" rules

| Rule from the rough tree UI                       | Result                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| No update age                                     | Overturned. The row shows the age.                                                                            |
| No launched-by hint                               | Overturned. Details show "Launched by" when the thread does not nest under its spawner.                       |
| No last message                                   | Overturned for the details block and the send dialog. They load it on demand. The row still shows no message. |
| No subagent rows, counts or signals (tree rule 2) | Kept. The page does not read `pendingBackgroundTasks`.                                                        |

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
- Statuses share tokens: `working`, `starting` and `blocked` use `working`. `your-turn` and `done` use `done`. `failed` and `interrupted` use `failed`. `plan-ready` uses `plan`. `snoozed` and `idle` use `--status-idle` for the shape and `--muted-foreground` for the text.
- Do not lower the opacity of text. A muted row uses `--muted-foreground`.

### Theme

The page header has a System / Light / Dark choice. The page stores it in `localStorage` under `thread-tree:theme`. An inline script in `index.html` sets the `dark` class on `<html>` before the first paint: for Dark, or for System when `prefers-color-scheme: dark` matches. With System, the page follows a change of the system theme.

### Contrast

WCAG 2 contrast ratios, computed from the token values above. Text needs 4.5:1 or more. Shapes need 3:1 or more.

| Token                        | Light: page | Light: card | Dark: page | Dark: card |
| ---------------------------- | ----------: | ----------: | ---------: | ---------: |
| `foreground`                 |       16.59 |       17.32 |      16.53 |      15.49 |
| `muted-foreground`           |        5.74 |        6.00 |       7.16 |       6.71 |
| `primary`                    |        5.92 |        6.18 |       7.63 |       7.15 |
| `status-needs-input` (shape) |        3.16 |        3.30 |       9.98 |       9.35 |
| `status-needs-input-fg`      |        5.58 |        5.83 |      11.11 |      10.41 |
| `status-working` (shape)     |        3.54 |        3.70 |       9.13 |       8.56 |
| `status-working-fg`          |        5.57 |        5.81 |      10.46 |       9.80 |
| `status-done` (shape)        |        3.26 |        3.40 |       9.78 |       9.17 |
| `status-done-fg`             |        5.66 |        5.91 |      10.75 |      10.07 |
| `status-failed` (shape)      |        3.86 |        4.02 |       6.62 |       6.20 |
| `status-failed-fg`           |        5.84 |        6.09 |       8.38 |       7.85 |
| `status-plan` (shape)        |        4.09 |        4.27 |       7.34 |       6.88 |
| `status-plan-fg`             |        6.29 |        6.56 |       9.23 |       8.65 |
| `status-idle` (shape)        |        3.35 |        3.50 |       3.94 |       3.70 |
| `pr-merged` (text)           |        6.32 |        6.59 |       8.54 |       8.00 |

Thread rows sit on the card. On `--muted`, the light `status-needs-input` shape is 2.98:1, so do not put a status shape on a `--muted` surface. The border is decoration (1.48:1 light, 2.12:1 dark on the card) and never the only sign of a state.

## Status model

`ThreadNode.status` has eleven values. The backend applies the first rule that matches.

| Order | Status        | When                                                                                                           |
| ----- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | `needs-input` | `pendingRuntimeRequest` is set and its `blocking` is not `false`, or `pendingGuestMessageCount` is more than 0 |
| 2     | `snoozed`     | `snoozedUntil` is in the future                                                                                |
| 3     | `blocked`     | The run status is `running` or `waiting`, and `blockedOnThreadWait` is true                                    |
| 4     | `working`     | The run status is `running` or `waiting`                                                                       |
| 5     | `starting`    | The run status is `queued`, `preparing` or `starting`                                                          |
| 6     | `plan-ready`  | `completed`, `interactionMode` is `plan`, and `hasActionableProposedPlan` is true                              |
| 7     | `your-turn`   | `completed`, and the completion is unseen                                                                      |
| 8     | `done`        | `completed`                                                                                                    |
| 9     | `failed`      | `failed`                                                                                                       |
| 10    | `interrupted` | `interrupted`, `cancelled` or `rolled_back`                                                                    |
| 11    | `idle`        | All other cases                                                                                                |

- The run status is `activityRunStatus` when it is not null, and `status` in all other cases.
- A completion is unseen when `latestRunCompletedAt` is set, and `lastVisitedAt` is absent or earlier than `latestRunCompletedAt`.
- A request with `blocking: false` does not change the status. The row shows an "Input" chip (see [Thread row](#thread-row)).

### Phrase, shape and motion

The backend sends `phrase` and `since`. The page adds the elapsed time from `since` to the phrase, and updates it once each minute.

| Status        | Icon (`lucide-react`) | Phrase                                        | `since`                                           | Motion                 |
| ------------- | --------------------- | --------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `needs-input` | `Diamond`, filled     | See the request table                         | `pendingRuntimeRequest.createdAt`                 | The left edge breathes |
| `working`     | `LoaderCircle`        | "Working"                                     | `activityRunStartedAt`, else `latestRunStartedAt` | The icon turns         |
| `starting`    | `CircleDashed`        | "Queued" for `queued`, else "Starting"        | none                                              | none                   |
| `blocked`     | `CirclePause`         | "Waiting"                                     | none                                              | none                   |
| `plan-ready`  | `ListChecks`          | "Plan ready"                                  | `latestRunCompletedAt`                            | none                   |
| `your-turn`   | `CircleCheck`         | "Your turn"                                   | `latestRunCompletedAt`                            | none                   |
| `done`        | `Check`               | "Done"                                        | none                                              | none                   |
| `failed`      | `CircleX`             | "Failed"                                      | none                                              | none                   |
| `interrupted` | `Square`              | "Interrupted", or "Cancelled" for `cancelled` | none                                              | none                   |
| `snoozed`     | `Moon`                | "Snoozed"                                     | none                                              | none                   |
| `idle`        | `Circle`              | "Idle"                                        | none                                              | none                   |

Request phrase, from `pendingRuntimeRequest.kind`:

| Kind                                                                     | Phrase          |
| ------------------------------------------------------------------------ | --------------- |
| `command`, `file-read`, `file-change`, `permission`, `dynamic_tool_call` | "Approval"      |
| `user_input`, `mcp-elicitation`                                          | "Question"      |
| `auth_refresh`                                                           | "Sign in"       |
| No request, guest messages only                                          | "Guest message" |
| Any other kind                                                           | "Input"         |

Elapsed time and age use one format: "now" below 1 minute, then "12m", "3h", "2d". The phrase with time reads "Working 12m" and "Approval · 3m".

Icons are 12 px. If an icon name is not in the installed `lucide-react`, use the nearest shape and keep each status distinct. Color is never the only signal: each status has a shape and a phrase.

### Motion CSS

```css
.thread-row[data-status="working"] .status-icon {
  animation: work-turn 1.4s linear infinite;
}
@keyframes work-turn {
  to {
    transform: rotate(360deg);
  }
}

.thread-row[data-status="needs-input"]::before {
  animation: breathe 2.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thread-row .status-icon,
  .thread-row::before {
    animation: none;
  }
}
[data-conn="down"] .thread-row .status-icon,
[data-conn="down"] .thread-row::before {
  animation: none;
}
```

With reduced motion, the shape, the phrase and the static edge still tell each status apart.

### Change motion

A component animates a value change only while it is mounted. A first load and a group that opens do not animate. After T3 comes back, the rows stay mounted, so each row that changed during the outage animates once. A tick of elapsed time does not animate, because the phrase key leaves out the time.

- The status icon, the phrase and each PR mark (checks, review, conflict, number with state and draft) crossfade. The new content fades in over 200 ms with ease-out. The old content fades out over 150 ms with ease-in.
- The new status icon also scales from 0.5 to 1 in 200 ms with a small overshoot. Its color and the phrase color change in 300 ms.
- The row flashes once in the new status color. The flash goes from 2 × `--wash` to 0 over 1 s with ease-out.
- With reduced motion, none of this runs. The new value shows at once.

A change of the row order animates with the View Transitions API. Each thread row and each PR stack has a `view-transition-name`. The rows slide in 250 ms to their new place when the sort changes, or when a push changes the row order. A push that keeps the order starts no transition. No transition runs during a drag, with the page hidden, or with reduced motion (`animation: none` on the transition pseudo-elements). A leaving row, and each named row inside it, has the name `none`, so no two elements share a name. The row gets its names back if it returns before it has gone.

A project card, a group or a thread row that a push adds or removes also moves.

- A new row grows from 0 to its full height in 200 ms with ease-out. Its opacity, margins and padding go from 0 to their values in the same time.
- A removed row stays in its place and collapses to 0 height in 200 ms with ease-out, with the same fade. Then it leaves the page. A row inside a removed row leaves with it.
- A removed row that comes back before it has gone grows in again from 0.
- A group that folds into one row, or one row that unfolds into a group, changes at once. The thread that the fold adds or removes does not move.
- A change that arrives during a drag applies at once, in every list. The drag source and the rows around the drop never move. This holds until the drop animation ends.
- With reduced motion, rows appear and disappear at once.
- A first load and a group that opens do not animate.

```css
.swap-in {
  animation: swap-in 200ms ease-out;
}
.swap-scale {
  animation:
    swap-in 200ms ease-out,
    swap-scale 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.swap-out {
  animation: swap-out 150ms ease-in forwards;
}
.row-pulse {
  animation: row-pulse 1s ease-out;
}
```

## Gradients

Four gradients, all static. No gradient on text, on the page background, or on a row with another status.

```css
/* Project card header: neutral. */
.project-head {
  background: linear-gradient(100deg, var(--muted), var(--card) 75%);
}

/* Needs input: warm wash and a 2 px left edge. */
.thread-row[data-status="needs-input"] {
  background: linear-gradient(
    90deg,
    color-mix(in oklch, var(--status-needs-input) var(--wash), transparent),
    transparent 45%
  );
}
.thread-row[data-status="needs-input"]::before,
[data-waiting]::before {
  background: var(--status-needs-input);
}

/* A closed row that hides a waiting thread. `background-image` keeps the row's own background color. */
[data-waiting] {
  background-image: linear-gradient(
    90deg,
    color-mix(in oklch, var(--status-needs-input) var(--wash), transparent),
    transparent 45%
  );
}

/* The edge. */
.thread-row {
  position: relative;
}
.thread-row[data-status="needs-input"]::before,
[data-waiting]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 1px;
}

/* Stack position chip. */
.chip-stack {
  background: linear-gradient(135deg, color-mix(in oklch, var(--primary) 10%, var(--card)), var(--card));
}
```

The hover background of a row is `--accent`. It replaces the wash while the pointer is on the row.

## Layout

### Page

- One centered column: `max-width: 1200px`, 16 px side padding.
- Header, one line that wraps: the title "Thread tree" (15 px, semibold), the header counts, the "All / Needs you" filter, then at the right the "Reset order" button, the "show settled" switch and the theme choice. "Reset order" is a ghost `sm` button. It shows only when the user has a stored order. A click clears the stored order.
- The banner is below the header, as now.
- The Catch-up fold sits in Settings › Setup, before "Local model". It uses the fold row of the other Setup folds: the label at the left, the value at the right (green with a label, neutral for "Off", yellow with a warning sign for "No model"). Its body has a switch row and a radio group of the Model picks, each with its provider icon, 14 px, and its label (13 px).
- One card with all projects follows.

**Header counts.** Count chips over the visible threads, nested threads included:

| Chip         | Counts                                   | Style                                                         |
| ------------ | ---------------------------------------- | ------------------------------------------------------------- |
| "N need you" | `needs-input`, `plan-ready`, `your-turn` | Amber wash and `--status-needs-input-fg`. Hidden when N is 0. |
| "N working"  | `working`, `starting`, `blocked`         | Outline                                                       |
| "N stopped"  | `failed`, `interrupted`                  | Outline                                                       |

**"Needs you" filter.** It keeps the threads with status `needs-input`, `plan-ready` or `your-turn`, and the groups and projects that hold them. A thread that matches keeps its place under a spawner that does not match; that spawner row stays, in muted color. The chip shows the needs-you count as a badge, your-turn threads included. The badge shows only when above 0. The tooltip reads "N need you (M your turn)", and drops the part in parentheses when M is 0. It sits inside the item, so the item keeps its `data-state`. The filter runs on the page. The backend tree does not change. The page stores the choice in `localStorage` under `thread-tree:filter`.

**States of the page:**

- Before the first push: three row skeletons in one card.
- No visible thread: the text "No active threads."
- T3 down or token rejected: the banner as in `SPEC.md`, and `data-conn="down"` on the tree. The tree gets `filter: grayscale(1)` and no lowered opacity. The motion stops. The banner has `role="status"`.

### Project block

- All projects are in one `Card`, radius 12 px. A 1 px border separates two projects.
- Each project is a block with a header row of 32 px above its groups: handle, disclosure chevron, monogram, project name (13 px, semibold). The name stays on one line and truncates. The repository `owner/name` is the name tooltip.
- The monogram and the project color come from the T3 Code rule, so a project looks the same as in T3: two letters on a 16 px rounded square, in the project color on a 14% wash of it. The color is one of 18 Tailwind hues, from a hash of the project name.
- The block has a 3 px left edge in the project color. The project color is never on a row, so color on a row still means status.
- A closed project or tree group with 5 or more threads shows a count for each status section in the header row: the status icon and the number, in section order, with no empty section. Subthreads count. The tooltip and the `aria-label` give the same counts in words, for example "3 needs input, 1 plan ready". A closed project or tree group with fewer threads shows one status icon for each thread, in tree order. Closed PR stacks keep their stack header.
- Below the header: the groups, 4 px padding.

### Groups

- A key group with two or more top-level threads has a header row: 28 px high, chevron, key in mono 12 px semibold. Its threads indent 10 px.
- A key group with one top-level thread folds: it has no header row. The thread row shows the key as a chip, and the title loses its key prefix (the key and the separators after it: spaces, `·`, `:`, `-`). This also applies to a key group inside Reviews. The fold runs on the page; the backend tree does not change.
- "Reviews" and "No issue key" have a muted header row (12 px, semibold) and do not fold.
- A closed group shows one status icon for each thread.
- Nested launched threads indent 10 px for each level.

### Stack rail

Key groups of one project that share a PR stack sit together (tree rule 8). The page wraps them in one block with a dashed border.

- **Header.** A fold trigger (chevron and `Layers` icon, label "PR stack · N PRs"), then a metro line: the base in a `code` pill, then one stop for each PR from the bottom of the stack to the top. A stop reads "2 · #2102", links to the PR, and has a dashed border for a draft. The base shows only when T3 sends it. The header stays when the block is closed.
- **Body.** One row for each top-level thread of the groups, with no group headers and the issue key as the row chip. The rows sit 12 px in, on a vertical line. The first row of each group has a filled node with the stack position; other rows have a hollow node. Thread rows in the block have no stack chip.
- **Color.** Stops, nodes and line segments take the color of their PR: `--status-failed-fg` when checks fail, the PR conflicts or a review asks for changes; `--status-done-fg` when approved; `--muted-foreground` for a draft; `--status-working-fg` otherwise. These tokens keep 4.5:1 contrast with the `--background` number text in both themes.
- **Fold.** The open or closed state is saved with the other folds.
- **Other threads.** In a status section of the flat view, a row folds when it and all its subthreads are context rows. The header then has a dashed pill button, "+N other threads" (11 px, muted, `relative z-10`, 44 px high under 720 px). It shows the folded rows, muted, and then reads "Hide N other threads". Its state is not saved. The rail numbers follow the shown rows.

### Thread row

One line when the title fits, `min-height: 36px`, radius 8 px, 13 px text with a 20 px line height.

```
[icon] [phrase + Wait] [KEY] Title ...............  [Input] [until] [stack] [#PR] [#PR] [+N] [age] [details]
 12px   needs-you rows  chip  flex, wraps            right group, gap 6px
```

| Part               | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon               | 12 px, in `--status-<name>`. A tooltip shows the raw T3 status.                                                                                                                                                                                                                                                                                                                                                                                         |
| Phrase             | Only on rows that wait on the user (`needs-input`, `plan-ready`, `your-turn`) and on `failed` rows. It sits beside the icon, 12 px, weight 500, in the status color, with no fixed column, and does not wrap. The Wait follows it in mono, `tabular-nums`: the time since `since`. `failed` rows and guest messages show the phrase only. Other rows show no text. This reverses `d602e6e` (#18), which removed the phrase column, for these rows only. |
| Key chip           | Only on a folded group. Mono 11 px, muted, outline.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Title              | The link to T3. Weight 500; weight 650 when the status is `your-turn`. `--muted-foreground` when the status is `snoozed` or the thread is settled, and for a context row (a row in a status section with another status, or a settled row). It wraps and is never cut.                                                                                                                                                                                  |
| "Input" chip       | Outline. Only when a request with `blocking: false` is pending.                                                                                                                                                                                                                                                                                                                                                                                         |
| "until" note       | "until Fri 10:42" in an outline chip, when `snoozedUntil` is in the future. It also shows on a `needs-input` row of a snoozed thread.                                                                                                                                                                                                                                                                                                                   |
| "Settled" chip     | Outline, muted. On the rows of the Settled list.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Stack chip         | `.chip-stack`, the `Layers` icon and "2/4", or the icon alone when the thread created no PR in the stack, with the tooltip and accessible name "PR stack · 4 PRs · no PR from this thread". Not shown on rows in a stack block.                                                                                                                                                                                                                         |
| Label pill         | One pill, before the PR chips. Only when an open PR of the row has a Watched label. A `Badge` with the `Tag` icon and the initials of the first matching name (mono, 11 px), filled with the label color; black or white text by luminance. "+N" shows the other matching names. The tooltip lists each match as "name: #PR".                                                                                                                           |
| PR chips           | The first two PRs, then a "+N" button that opens the details block.                                                                                                                                                                                                                                                                                                                                                                                     |
| Age                | Relative age of `updatedAt`, mono 11 px, muted, `tabular-nums`. The tooltip shows "Updated" and the exact time.                                                                                                                                                                                                                                                                                                                                         |
| Row actions button | Ghost icon button with `Ellipsis` at the end of the row. It morphs to `X` (`MorphIcon`) while its toolbar is open. The toolbar is a popover in a portal, with a border, `bg-popover` and `shadow-md`.                                                                                                                                                                                                                                                   |
| Settle button      | Ghost icon button with `CircleCheckBig`, or `Undo2` on a settled row, just before the send icon, in the row toolbar. It turns `text-destructive` after a failure.                                                                                                                                                                                                                                                                                       |
| Map thread button  | Ghost `xs` text button "Mark as map thread" or "Unmark map thread", muted text, with the amber `Map` icon (14 px) before the label and `pt-2` above it. It is the last line of the details block and spans both columns. It shows only on thread rows that are not step threads. After a failure it turns `text-destructive` and a tooltip shows the error.                                                                                             |
| Marked map icon    | The amber map icon of a marked map group head is a button, same size and place. On hover and focus-visible it morphs to the `X` icon (`MorphIcon`). The tooltip and label are "Unmark map thread". After a failure it turns `text-destructive` and the tooltip shows the error.                                                                                                                                                                         |
| Details button     | Ghost icon button with `ChevronDown`, `aria-expanded`, label "Details".                                                                                                                                                                                                                                                                                                                                                                                 |
| Handle             | Ghost icon button with `GripVertical`, the first item of the row. See "Drag to reorder".                                                                                                                                                                                                                                                                                                                                                                |

**PR chip.** "#2102" in mono 11 px, a link to the PR, with these marks:

| Mark                         | When                                    |
| ---------------------------- | --------------------------------------- |
| Dot, `--status-done`         | `checksState` is `passing`              |
| Dot, `--status-failed`       | `checksState` is `failing`              |
| Ring, `--status-needs-input` | `checksState` is `pending`              |
| `Check` icon                 | `reviewDecision` is `approved`          |
| `X` icon                     | `reviewDecision` is `changes-requested` |
| `TriangleAlert` icon         | `mergeability` is `conflicting`         |
| Dashed border                | `isDraft` is true                       |
| Text in `--pr-merged`        | `state` is `merged`                     |
| Text struck through, muted   | `state` is `closed`                     |

An absent value shows no mark. Each mark has a `title` with its meaning.

**Narrow screens.** Below 720 px, the title goes on its own line below the status, and the right group wraps to a line below the title. The title wraps to as many lines as it needs. The page never scrolls sideways. On a touch screen, buttons have a 44 px target.

### Sort

A ghost `icon-sm` button with the `ArrowDownUp` icon, before fold all. Its label is "Sort" and its tooltip is "Sort: Manual" or "Sort: Last updated". It opens a dropdown menu with a radio group: "Manual" and "Last updated". The choice is in `localStorage` under `thread-tree:sort`.

- "Last updated" sorts by `lastRun`, newest first. A thread with no `lastRun` is last. A thread counts its subthreads. A group or PR stack counts its newest thread.
- Projects keep their order. Reviews stays first and No issue key stays last. A PR stack moves as one block and keeps its inner order. Subthreads keep their order. Ties keep the manual order.
- Drag is off: no row has a handle, and the empty handle space stays so rows line up. This holds in the flat view too.

### Flat view

The Tree / Flat switch is a `ToggleGroup` of two icons (`ListTree`, `List`) with tooltips, built like the theme choice. Fold all and "Group by" share one header button. In the tree, it is fold all. In flat, it opens the "Group by" menu (None, Status), with the `Rows3` icon. On a view switch, the button stays and its icon morphs between the fold arrows and `Rows3`. The page shows one card with one list. Drag works with "Manual" sort and follows "Drag to reorder". With "Group by Status", drag is off in Needs input, Plan ready and Your turn. The flat list has its own stored order (list key `flat`).

- **Thread row.** The status icon comes first. The Project column follows: the project icon and name (`w-32`, truncated). Under 720 px, only the icon shows. Then the issue key chip (a Linear link when set), then the teal `Eye` for a review thread (`text-review`), then the title. The Label pill, the PR chips, the details chevron, the settle icon and the send icon stay as in the tree. The handle sits first, as in the tree.
- **Subthreads.** They sit under the parent, indented, always open, in base order, with no Project column.
- **Stack block.** One block with the rail header and numbered rows. The header has the `Layers` icon with no chevron, then the Project column, then the stops. It is always open.
- **Section headers.** With "Group by Status", a fold button of 28 px with a chevron, as in a tree fold header: the label (12 px, semibold, muted) and the count of matching threads, subthreads included, settled threads left out. Order: Needs input, Plan ready, Your turn, Failed, Working, Idle and snoozed, Done. Empty sections are hidden. "Idle and snoozed" and "Done" start closed.
- **Motion.** One `Presence` holds headers and rows, so a row that changes section slides. Each header has a `view-transition-name`. A switch between Tree and Flat cross-fades the headers, chevrons and fold buttons, and the Project column and key chips. The old and new snapshots keep their own size (`height: 100%; width: auto`), so a row does not stretch.

### Settled list

With "Show settled threads" on, a card below the tree or flat list holds the Settled list. Its header reads "Settled" and the count (12 px, semibold, muted), with no fold. The rows are thread rows with the "Settled" chip, with no drag handle. While a page loads, five skeleton rows show after the rows, with `aria-busy` on the list.

### Drag to reorder

The user reorders projects, key groups (a stack run is one block), review groups and top-level threads. A list with fewer than two visible items has no handle. Subthreads, groups inside a stack rail, Reviews and No issue key have no handle. No drag crosses lists. The flat list is one list, or one list for each status section when grouped; a row drags only inside its section, and all sections share one stored order. Needs input, Plan ready and Your turn have no drag.

- **Handle.** A ghost icon `Button` with the `GripVertical` icon, `cursor-grab`, label "Move <name>". It sits at the start of the row: before the status icon on a thread row, and before the chevron or icon on a group header, a stack rail label row and a project. It keeps its space, so nothing shifts on hover. A row with no handle keeps an empty space of the same size, so the status icons and titles line up.
- **Visibility.** The handle is hidden until the pointer is over its own row, or the handle has focus. It always shows on a touch screen. A hover on a parent does not show the handles of child rows.
- **Click.** A title link, a chevron and a chip are not handles. A click on a title still opens the thread.
- **Keyboard.** Tab reaches the handle. Space lifts the row, the arrow keys move it, Space drops it, Escape cancels.
- **Announcements.** "Picked up <name>. Position 2 of 5." while the user moves: "<name> is at position 3 of 5." On drop: "<name> dropped at position 3 of 5." On cancel: "Move canceled. <name> is back at position 2 of 5."
- **Swap point.** A row moves when the leading edge of the dragged row enters it by 12 px, or by half its height when it is lower than 24 px. A tall row thus moves as early as a short one. A row that is behind the center of the dragged row does not move, so a swap does not bounce back.
- **Motion.** Rows slide to make room. With reduced motion, the slide does not run.
- **Drag layer.** The dragged item has the card background and the page radius.

### Details block

The details button opens a block below the row, inside the same list item, indented to the title. It is a `Collapsible`. The page keeps the ids of open blocks in one Set outside the pushed tree, in memory only.

The block is a two-column list of label and value, 12 px. It shows a line only when the value is present. Paths, branches and ids of models are in mono.

| Line         | Value                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request      | The raw request kind and its age: "command · 3m".                                                                                                             |
| Error        | `lastErrorClass`, `lastErrorCode`, then `lastError` as plain text.                                                                                            |
| Last message | The end of the newest complete assistant message, in a scroll box. It loads when the block opens.                                                             |
| Limit        | "resets 14:00" from `usageLimitResetAt` or `limitRecovery.resetAt`, and "auto-resume" when `limitRecovery.autoResume` is true.                                |
| Run          | "Stop requested" when `latestRunStopRequested` is true.                                                                                                       |
| Model        | `modelSelection.model`, and "plan mode" when `interactionMode` is `plan`.                                                                                     |
| Branch       | `branch`.                                                                                                                                                     |
| Worktree     | `worktreePath`, with the home folder as `~`.                                                                                                                  |
| Launched by  | The title of the spawner, as a link to that thread in T3. Only when the thread has a spawner and does not nest under it.                                      |
| Origin       | "Fork of `<title>`" from `forkedFrom` when the source thread is known, "Delegated from `<title>`" from `delegatedFrom`, or "via `<label>`" from `linkOrigin`. |
| Started by   | `createdBy` and `creationSource`: "agent via mcp".                                                                                                            |
| Updated      | Relative age of `updatedAt`, the same as the row end.                                                                                                         |
| Created      | Relative age of `createdAt`.                                                                                                                                  |
| Goal         | `goal.objective` and `goal.status`.                                                                                                                           |
| Tags         | `tags` as plain text. "Pinned" when `pinnedAt` is set.                                                                                                        |
| PRs          | One line for each PR, all PRs of the row: number, title, state, checks, review, "+212 -40 · 9 files".                                                         |

### Catch-up row line

A thread row with a Catch-up has a line under the title. The title keeps its place, and the line sits in the same column. The line has `text-xs`, `leading-[18px]` and `--muted-foreground`, and it truncates to one line. Under 720 px, the line takes the full width with `pl-5`, like the title.

- **Ask:** the `did` text, "Asks:" in semibold in the status color, the ask in `--foreground`, then each option as an outline chip (`h-[18px]`, `text-[11px]`).
- **Loading:** a skeleton bar, `h-3 w-56`. It does not pulse with reduced motion.
- **No clear ask or failed call:** a dashed tag (`text-[10px]`, uppercase, `border-dashed`, no status color), then the first line of the raw question in italic and quotes.
- **Tooltip:** the line shows the last message of the thread. Like the "Updated" tooltip of the row, it does not open on touch.
- **No Catch-up:** one line, as before.

### Triage card

The card sits at the top of the list, inside the list scroller, before the tree. It is `sticky top-0 z-30 mb-3` on the page background, so it stays over the project headers. It has `rounded-lg border bg-card p-3 shadow-sm`.

- **Head row:** the status icon, the status title in the status color and semibold, the phrase, the Wait in the status color, then "N of M" (and "+K new" in the needs-input color) and a close button on the right.
- **Title:** a link, semibold, with the issue key in mono before it.
- **Catch-up:** as in the row line, without the options. A skeleton shows while it runs.
- **Chips:** outline `xs` buttons. Their number key is a key hint.
- **Reply:** a textarea with the Send button at its end.
- **Action row:** ghost `xs` buttons. Their keys are key hints: they show only while the user holds Alt/Option. "Skip" sits at the end.
- **Next line:** one truncated line under a top border.
- **End:** a centered check icon, "Nothing waits", the counts, and the buttons.
- **390 px:** the rows wrap and the card keeps its width. The tree row that the card shows stays visible under it.

### Up next second line

A row of the Up next window with a Catch-up has a second line under the top line. The top line stays 28 px. The second line has `pl-[20px]`, `text-[11px]` and `--muted-foreground`, and it truncates to one line.

- **Ask:** "Asks: <ask>", with the options as "A or B?". With no ask, what the thread did.
- **Loading:** a skeleton bar, `h-2.5 w-40`.
- **No clear ask or failed call:** a dashed tag, "No clear ask" or "Catch-up failed" (`text-[10px]`, uppercase, `border-dashed`, no status color), then the raw question in italic and quotes. With no raw question, what the thread did, else the thread title.
- **No Catch-up:** one line, as before.

### Typography and focus

- Sans: `Inter` when installed, else `system-ui`. Mono: `ui-monospace, "SF Mono", Menlo`.
- Sizes: page title 15 px; project name 14 px; row title 13 px; phrase, group headers and details 12 px; chips and age 11 px.
- Radius: card 12 px, row 8 px, chip 6 px.
- Keep the nested `<ul>` lists. Do not add ARIA tree roles.
- Each link and button shows a 2 px `--ring` focus ring with a 2 px gap. A tooltip is never the only source of a label.

## Components

| Page part                                            | shadcn component               | State     |
| ---------------------------------------------------- | ------------------------------ | --------- |
| Project card                                         | `Card`                         | Add       |
| Project and group disclosure, details block          | `Collapsible`                  | Installed |
| Details button, "+N" button, map thread button       | `Button`                       | Add       |
| Filter "All / Needs you"                             | `ToggleGroup`, `type="single"` | Add       |
| Theme choice                                         | `Select`                       | Add       |
| First load                                           | `Skeleton`                     | Add       |
| "show settled"                                       | `Switch`, `Label`              | Installed |
| Summary chips, key chip, stack chip, PR chips, notes | `Badge`                        | Installed |
| Raw status, exact time                               | `Tooltip`                      | Installed |
| Banner                                               | `Alert`                        | Installed |
| Key cap (Keys legend, key hints)                     | `Kbd`                          | Installed |

Add components with the shadcn CLI. Status icons, washes, edges and the stack rail are plain Tailwind classes and the CSS in this spec.

**Key hints.** A key hint is a small, muted `Kbd`: `h-4 min-w-4`, 10 px text, `text-muted-foreground`. It floats over the corner of its control, with a 1 px border, the popover background and a small shadow. The Find bar and the row pill use the same border, background and shadow. A hint takes no space. The rules are in [SPEC.md](SPEC.md) › UI › Key hints.

## Data

All new stream fields are optional or nullable in the T3 shell schema (`OrchestrationV2ThreadShell` in `packages/contracts/src/orchestrationV2.ts` of T3 Code). Decode each one leniently: an absent value is null, not zero or false.

### New fields to decode from the stream

| For          | Thread fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status       | `activityRunStatus`, `blockedOnThreadWait`, `pendingRuntimeRequest.createdAt`, `pendingRuntimeRequest.blocking`, `pendingGuestMessageCount`, `hasActionableProposedPlan`, `interactionMode`, `latestRunCompletedAt`, `lastVisitedAt`                                                                                                                                                                                                                                                                                  |
| Elapsed time | `activityRunStartedAt`, `latestRunStartedAt`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PR marks     | `pullRequests[].snapshot`: `isDraft`, `checksState`, `reviewDecision`, `mergeability`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Stack rail   | `pullRequests[].stack.base`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Details      | The newest complete assistant message (loaded when the block opens), `lastError`, `lastErrorClass`, `lastErrorCode`, `usageLimitResetAt`, `limitRecovery.resetAt`, `limitRecovery.autoResume`, `latestRunStopRequested`, `modelSelection.model`, `branch`, `worktreePath`, `forkedFrom`, `delegatedFrom.title`, `linkOrigin.label`, `createdBy`, `creationSource`, `createdAt`, `goal.objective`, `goal.status`, `tags`, `pinnedAt`, and `pullRequests[].snapshot`: `title`, `additions`, `deletions`, `changedFiles` |
| Project card | `repositoryIdentity.owner` and `repositoryIdentity.name` of the project                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### Tree type

`src/shared/tree.ts` changes to this shape. Times are ISO strings; the page formats them.

```ts
export type Status =
  | "needs-input"
  | "working"
  | "starting"
  | "blocked"
  | "plan-ready"
  | "your-turn"
  | "done"
  | "failed"
  | "interrupted"
  | "snoozed"
  | "idle";

export type Label = { name: string; color: string | null };

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
  /** Only the labels the connection watches. */
  labels: Label[];
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

/** The Linear project and milestone of one issue. Null means the issue has none. */
export type LinearIssue = {
  project: { id: string; name: string; url: string } | null;
  milestone: { id: string; name: string; targetDate: string | null } | null;
};

export type ThreadNode = {
  id: string;
  href: string;
  title: string;
  /** The issue key of the title, for the fold. */
  key: string | null;
  /** Linear data of `key`. Null with no key, no answer yet, or no `linear=1`. */
  linear: LinearIssue | null;
  status: Status;
  phrase: string;
  /** Start of the elapsed time in the phrase. */
  since: string | null;
  /** Raw T3 status, for the icon tooltip. */
  raw: string;
  updatedAt: string;
  /** Newest of the working run start, the latest run start and the latest run end. Not `updatedAt`, which ticks while a thread works. */
  lastRun: string | null;
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

`Conn` does not change. `Tree` gains `linearKey: "ok" | "no-key" | "rejected"`, the state of the Linear API key. No new push is necessary: the page computes elapsed time, age, the fold, the filter and the summary from the tree.

## Checks for each build key

- `bun test` and `bun run typecheck` pass.
- `bun run demo` in light and dark mode, at 1400 px and at 390 px wide. `scripts/demo.ts` has a thread for each status that the key draws.
- Keyboard: Tab reaches each link and button, and the focus ring is visible.
- Drag at each level (project, group, stack rail, review group, thread), by pointer and by keyboard. The order holds after a reload.
- Reduced motion: no animation runs.
- `PUSH=1 bun run demo` shows each change transition.
- A thread with absent optional fields shows no empty line, chip or mark.
- Triage card: it is sticky over the project headers, wraps at 390 px, and shows the same in light and dark mode.
