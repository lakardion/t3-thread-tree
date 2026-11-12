# Design proposal A: thread tree (Claude Opus)

Mockup: [02-opus-mockup.html](02-opus-mockup.html). It shows the same demo threads as `scripts/demo.ts`, in light and dark mode, side by side.

## Summary

The page must answer two questions fast: "what needs me?" and "what is still working?". This proposal does four things to answer them:

- It adds an **attention summary** to the header: counts for "need you", "working", "your turn" and "stopped", and a "Needs you" filter.
- It gives each thread row a **second line**: a status phrase with detail ("Approval · command · 3m", "Working 12m") and the last message of the thread.
- It gives each status its own **shape and motion**, not only a color. Only "working" and "needs input" move.
- It puts each project in a **card** with a gradient header, and it puts PR stacks on a **stack rail**.

The tree rules in `SPEC.md` do not change. One UI rule changes: a key group with one thread folds into one row (see [Layout](#5-layout-and-density)).

## 1. Information inventory

Source: `OrchestrationV2ThreadShell` in `~/repos/t3code/packages/contracts/src/orchestrationV2.ts`, `ThreadPullRequestLink` in `threadPullRequest.ts`, and `OrchestrationProjectShell` in `orchestrationProject.ts`. "Decoded" means that `src/server/t3.ts` reads the field now.

Legend: **Now** = the page shows it now. **Should** = this proposal shows it. **⚑** marks a challenge to a "not shown" choice of ticket 005.

### Thread fields

| Field | Decoded | Now | Should | Where and why |
|---|---|---|---|---|
| `id` | yes | link only | link only | Deep link. |
| `projectId` | yes | yes (placement) | yes | Placement. |
| `title` | yes | yes | yes | Row line 1. Inside a key group, strip the leading key and separator (`SHOP-412 · `), because the key is already on the row. |
| `status` | yes | dot | dot + phrase | See [§4](#4-in-progress-indicators). Map `waiting` to "working", as T3 does. |
| `activityRunStatus` | no | no | yes | Splits `running` into "working" and "starting". T3's own sidebar uses it. |
| `activityRunStartedAt`, `latestRunStartedAt` | no | no | yes | Elapsed time in the phrase: "Working 12m". This tells a stuck run from a fresh one. |
| `latestRunCompletedAt` | no | no | yes | Age of "your turn" and "done" when it is later than `updatedAt`. |
| `latestRunRequestedAt` | no | no | no | `activityRunStartedAt` is enough. |
| `latestRunStopRequested` | no | no | yes | Phrase "Stopping…" on a working row. |
| `blockedOnThreadWait` | no | no | yes | Phrase "Waiting on N threads". A running thread that waits on others is not "working". T3 shows this as "Waiting". |
| `pendingBackgroundTasks` | no | no | yes ⚑ | Count of `kind: subagent` items as a flag "⛬ 2 subagents". Count of `command`/`monitor` as "⌁ 1 command". No subagent rows. This challenges "no subagent counts or signals": a count tells the user why a thread waits, and it costs one small flag. |
| `pendingRuntimeRequest.kind` | yes | tooltip | yes | Phrase: "Approval · command", "Approval · file change", "Question" (`user_input`), "Sign in" (`auth_refresh`). |
| `pendingRuntimeRequest.createdAt` | no | no | yes | "· 3m" in the phrase: how long the thread has waited for the user. |
| `pendingRuntimeRequest.blocking` | no | no | yes | `false`: the run keeps working. Show "working" with a small "? question" flag, not "needs input". |
| `pendingGuestMessageCount` | no | no | yes | Treat as "needs input" with phrase "Guest message", as T3 does. |
| `hasActionableProposedPlan` + `interactionMode` | no | no | yes | New status "plan ready" (violet). T3 shows "Plan Ready". It is a "your turn" case that needs a decision. |
| `latestVisibleMessage` | no | no | yes ⚑ | Row line 2, one line, truncated. `role` sets a prefix: "›" for the agent, "you:" for the user. This challenges "no last message": it tells the user what the thread does without opening it. Full text goes in the hover card (first 400 characters). |
| `latestUserMessageAt`, `latestUserAuthoredMessageAt` | no | no | no | `updatedAt` is enough for the age. |
| `lastVisitedAt` | no | no | yes | "Unseen" when `latestRunCompletedAt > lastVisitedAt`: the title is bold. This is T3's "unseen completion". |
| `lastError`, `lastErrorClass`, `lastErrorCode` | no | no | yes | Phrase of a failed row: "Usage limit", "Provider error". Full `lastError` in the hover card. |
| `usageLimitResetAt`, `limitRecovery` | no | no | yes | "· resets 14:00". Flag "↻ auto-resume" when `limitRecovery.autoResume`. |
| `updatedAt` | yes | sort only | yes ⚑ | Relative age at the right edge ("3m", "2h"), in mono. This challenges "no age". It is the cheapest signal of staleness. |
| `createdAt` | no | no | hover card | "Created 2d ago". |
| `settledAt`, `settledOverride` | yes | filter | yes | With "show settled" on, settled rows show at 60 % opacity with a "settled" flag. |
| `unsettledAt`, `autoSettleDisabledAt` | no | no | no | T3 housekeeping. |
| `snoozedUntil` | yes | badge | phrase | "Snoozed until Fri 10:42" moves to line 2. |
| `snoozedAt` | no | no | no | |
| `createdBy`, `creationSource` | no | no | yes ⚑ | Hover card "Started by: agent via launch" and a small "↗" flag on a launched row that has no visible spawner. This challenges "no launched-by hints": a launched thread under "No issue key" has no clue about its origin now. |
| Spawner (from SQLite, `build-tree.ts`) | yes | nesting | yes ⚑ | When the thread is not nested under its spawner (other key, other project, spawner settled), the hover card says "from “<spawner title>”". |
| `forkedFrom` | no | no | hover card | "Fork of <title>". |
| `delegatedFrom` | no | no | hover card | "Delegated from <title> on another machine". |
| `linkOrigin.label` | no | no | hover card | "via <label>" for work from a linked environment. |
| `lineage.parentThreadId`, `relationshipToParent`, `sideChat` | yes | filter | filter | Subagents and side chats stay out of the tree. |
| `lineage.rootThreadId` | no | no | no | |
| `modelSelection.model` | no | no | yes | Small mono chip: "opus", "sonnet", "codex". Use a short name map; show the raw id in the hover card. It tells which agent runs a thread. |
| `providerInstanceId`, `providerInstanceHistory` | no | no | no | The model chip is enough. |
| `runtimeMode` | no | no | no | |
| `interactionMode` | no | no | hover card | "plan mode". Also feeds "plan ready". |
| `branch` | no | no | hover card | Mono. |
| `worktreePath` | no | no | hover card | Mono, home folder as `~`. |
| `goal` | no | no | hover card | Objective and status. Phrase "Goal blocked" when `goal.status` is `blocked`, `usage_limited` or `budget_limited`. |
| `tags` | no | no | yes | Small outline chips after the title, when present. |
| `pinnedAt` | no | no | yes | "📌" flag. The sort does not change. |
| `titleRegeneration` | no | no | yes | Title shimmer while T3 makes a new title. |
| `itemCount`, `visibleItemCount` | no | no | no | |
| `activeRunId`, `latestRunId`, `activeProviderThreadId`, `historyOrigin`, `pinOrderKey`, `activeOrderKey`, `opens` | no | no | no | Internal. |
| `archivedAt`, `deletedAt` | yes | filter | filter | Never shown. |
| `linkedPullRequest`, `branchPullRequest` | no | no | no | `pullRequests` holds the same PRs. |

### PR fields (`pullRequests[]`)

| Field | Decoded | Now | Should | Where and why |
|---|---|---|---|---|
| `number`, `url` | yes | yes | yes | PR chip. |
| `source` | yes | filter, stack | same | |
| `snapshot.state` | yes | text | yes | Chip style: open (solid), merged (violet), closed (struck through). |
| `snapshot.isDraft` | no | no | yes | Dashed chip border. |
| `snapshot.checksState` | no | no | yes | Dot in the chip: green passing, red failing, amber ring pending. |
| `snapshot.reviewDecision` | no | no | yes | "✓" approved, "✕" changes requested, in the chip. |
| `snapshot.mergeability` | no | no | yes | "⚠" in the chip when `conflicting`. |
| `snapshot.title`, `headBranch`, `baseBranch`, `additions`, `deletions`, `changedFiles`, `author`, `updatedAt` | no | no | hover card | PR line in the hover card: "open · checks passing · +212 −40 · 9 files". |
| `stack.layers`, `stack.base` | no | no | yes | Stack rail label: "PR stack · 4 PRs · base main". Use `layers` order when present; keep the `build-tree.ts` order as fallback. |
| `watch` | no | no | yes | "👁" in the chip: an agent watches this PR. |
| `repositoryWebUrl`, `linkedAt`, `endedWatch`, `host`, `repository` | no | no | no | |

### Project fields

| Field | Decoded | Now | Should | Where and why |
|---|---|---|---|---|
| `id`, `title` | yes | yes | yes | Card header. |
| `repositoryIdentity` | no | no | yes | Mono `owner/repo` after the name. |
| `workspaceRoot` | no | no | tooltip | On the project name. |
| `projectIcon`, `faviconPath` | no | no | later | The monogram is enough for now. The backend must serve the file to use it. |
| `pinnedAt`, `archivedAt`, `scripts`, `defaultModelSelection`, `defaultThreadEnvMode`, `autoPull`, `createdAt`, `updatedAt` | no | no | no | `updatedAt` of threads already sorts projects. |

The build keys must extend `decodeThread` and `ThreadNode` for the "Should" rows. All new fields are optional in the shell schema, so decode each one leniently.

## 2. Color palette: "Harbor"

Cool slate neutrals (hue 250–262) with one blue brand color. Six status colors. Each status has a **dot** color (non-text, needs ≥ 3:1) and a **text** color for the phrase (needs ≥ 4.5:1). Contrast is WCAG 2 against the page background and against the card.

```css
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
  --border: oklch(0.915 0.01 255);
  --input: oklch(0.915 0.01 255);
  --ring: oklch(0.5 0.17 262 / 50%);
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

@media (prefers-color-scheme: dark) {
  :root {
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
    --border: oklch(1 0 0 / 9%);
    --input: oklch(1 0 0 / 14%);
    --ring: oklch(0.72 0.14 262 / 50%);

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
}
```

Register each `--status-*` in `@theme inline` as `--color-status-*`, as `index.css` does now.

### Contrast

| Token | Light hex | vs bg | vs card | Dark hex | vs bg | vs card |
|---|---|---|---|---|---|---|
| foreground | #161b24 | 16.6 | 17.3 | #ebeff4 | 16.5 | 15.5 |
| muted-foreground | #5c646f | 5.7 | 6.0 | #979fab | 7.2 | 6.7 |
| primary | #285cc2 | 5.9 | 6.2 | #73a3fc | 7.6 | 7.2 |
| needs-input (dot) | #e06d00 | 3.2 | 3.3 | #faab3f | 10.0 | 9.4 |
| needs-input (text) | #a74a04 | 5.6 | 5.8 | #fbb961 | 11.1 | 10.4 |
| working (dot) | #008dcc | 3.5 | 3.7 | #51bfee | 9.1 | 8.6 |
| working (text) | #006aa5 | 5.6 | 5.8 | #75caf2 | 10.5 | 9.8 |
| done (dot) | #0fa05c | 3.3 | 3.4 | #53cf95 | 9.8 | 9.2 |
| done (text) | #037441 | 5.7 | 5.9 | #71d6a3 | 10.8 | 10.1 |
| failed (dot) | #e54151 | 3.9 | 4.0 | #f56b76 | 6.6 | 6.2 |
| failed (text) | #be2132 | 5.8 | 6.1 | #fd8a8f | 8.4 | 7.9 |
| plan (dot) | #8b61e3 | 4.1 | 4.3 | #ac8ff8 | 7.3 | 6.9 |
| plan (text) | #6f41c1 | 6.3 | 6.6 | #bda8fc | 9.2 | 8.7 |
| idle (dot) | #848a92 | 3.4 | 3.5 | #6a727e | 3.9 | 3.7 |
| merged (text) | #763ebd | 6.3 | 6.6 | #be9df7 | 8.5 | 8.0 |

Light bg is #f8fafd, light card #ffffff. Dark bg is #0c0f16, dark card #13171f. All text passes AA (≥ 4.5). All dots pass the non-text minimum (≥ 3). The light dots are darker than the text-on-white "pretty" values on purpose: a 9 px dot below 3:1 is hard to see.

Color is never the only signal. Each status also has a shape (§4) and a word in line 2.

## 3. Gradients

Gradients mark structure and state. They stay at low strength (`--wash`, 11 % light, 14 % dark), so text contrast does not change.

1. **Project header band.** It gives each project an identity and splits the cards when the user scrolls. Each project gets two hues from a hash of its id (`--p1`, `--p2`, second hue = first + 40°).

   ```css
   .project-head {
     background: linear-gradient(100deg,
       color-mix(in oklch, var(--p1) var(--wash), transparent) 0%,
       color-mix(in oklch, var(--p2) calc(var(--wash) / 2), transparent) 45%,
       transparent 75%);
   }
   .project-mark { background: linear-gradient(135deg, var(--p1), var(--p2)); color: white; }
   ```

   Hue from id: `p1 = oklch(0.62 0.16 (hash(id) % 360))`. Skip hues 40–80 (too close to "needs input").

2. **Needs-input row wash.** A warm wash from the left edge. The eye finds these rows first when it scans.

   ```css
   .row[data-status="needs-input"] {
     background: linear-gradient(90deg, color-mix(in oklch, var(--status-needs-input) var(--wash), transparent), transparent 45%);
   }
   ```

3. **Working row wash and edge sweep.** A weaker blue wash, plus a light that moves down the 2 px left edge (§4).

   ```css
   .row[data-status="working"] {
     background: linear-gradient(90deg, color-mix(in oklch, var(--status-working) calc(var(--wash) * .6), transparent), transparent 35%);
   }
   .row[data-status="working"]::before {
     background: linear-gradient(180deg, transparent, var(--status-working), transparent) 0 0 / 100% 200%;
     animation: sweep 1.6s linear infinite;
   }
   @keyframes sweep { from { background-position: 0 100%; } to { background-position: 0 -100%; } }
   ```

4. **Stack rail.** A 3 px rail from blue (base of the stack) to violet (top). The color shows the direction of the stack.

   ```css
   .stack::before { background: linear-gradient(180deg, var(--primary), color-mix(in oklch, var(--status-plan) 80%, transparent)); }
   ```

5. **Stack position chip.** A faint diagonal fill, so the chip reads as "part of the rail".

   ```css
   .chip-stack { background: linear-gradient(135deg, color-mix(in oklch, var(--primary) 10%, var(--card)), var(--card)); }
   ```

No gradient on text, on the page background, or on idle, done or snoozed rows. Calm rows stay flat, so the gradients keep their meaning.

## 4. In-progress indicators

T3's run status and request fields map to these display states. The first match wins.

| State | When | Dot | Motion | Phrase (line 2) |
|---|---|---|---|---|
| needs input | `pendingRuntimeRequest` with `blocking !== false`, or `pendingGuestMessageCount > 0` | amber diamond (rotated square) | left edge bar breathes, 2.4 s | "Approval · command · 3m", "Question · 6m", "Sign in", "Guest message" |
| working | `running` not `blockedOnThreadWait`, or `waiting` | blue dot | ring pings out, 1.8 s; edge sweep | "Working 12m", "Stopping…" |
| starting | `queued`, `preparing`, `starting` | blue dashed ring | ring turns, 2.4 s | "Queued", "Starting" |
| waiting | `running` and `blockedOnThreadWait`, or background work holds the run | blue hollow ring | none | "Waiting on 2 threads" |
| plan ready | `interactionMode: plan`, run settled, `hasActionableProposedPlan` | violet dot | none | "Plan ready" |
| your turn | `completed` | green dot; bold title when unseen | none | "Your turn" (unseen) or "Done" |
| failed | `failed` | red dot | none | "Failed", "Usage limit · resets 14:00" |
| interrupted | `interrupted`, `cancelled`, `rolled_back` | red hollow ring | none | "Interrupted", "Cancelled" |
| snoozed | `snoozedUntil` in the future | grey hollow ring; muted title | none | "Snoozed until Fri 10:42" |
| idle | `idle` | grey dot | none | "Idle" |

Rules:

- Only two states move: working and needs input. Starting moves a little. Everything else is still. So motion always means "alive" or "waiting for you".
- The **elapsed time** ("12m", "3m") is the main progress signal. It updates once a minute on the page. It needs no new push.
- "Needs input" does not pulse the dot. It breathes the edge bar. A pulsing dot reads as "busy", not "your move".
- A closed group or a closed project shows one small dot per thread, with the same shapes.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .row::before, .dot, .dot::after { animation: none; }
  .row[data-status="working"] .dot::after { transform: scale(1.7); opacity: .35; } /* static halo */
  .row[data-status="working"]::before { background: var(--status-working); }      /* solid edge */
}
```

With reduced motion, "working" keeps a static halo and a solid edge bar. "Starting" keeps its dashed ring. Shape and words still tell each state apart.

### Motion CSS

```css
.dot-working::after { content: ""; position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid var(--status-working); animation: ping 1.8s cubic-bezier(0, 0, .2, 1) infinite; }
@keyframes ping { 0% { transform: scale(1); opacity: .65; } 80%, 100% { transform: scale(2.4); opacity: 0; } }
.dot-starting { border: 2px dashed var(--status-working); animation: spin 2.4s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.row[data-status="needs-input"]::before { background: var(--status-needs-input); animation: breathe 2.4s ease-in-out infinite; }
@keyframes breathe { 50% { opacity: .45; } }
```

## 5. Layout and density

### Page

1. **Header** (one line, wraps on narrow screens): title, attention summary chips, a "All / Needs you" filter, and the "show settled" switch.
   - Summary chips: "N need you" (amber, only when N > 0), "N working", "N your turn", "N stopped". Each count is over the visible threads.
   - "Needs you" filter: shows only needs-input, plan-ready and unseen your-turn threads, with their groups and projects. It is a view filter on the page. The tree from the backend does not change. Save the choice in `localStorage`.
2. **Banner** (as now) under the header.
3. **Project cards**, one per project, 12 px apart.

### Project card

- Header: disclosure chevron, gradient monogram (first letter), project name (14 px, semibold), `owner/repo` (mono, muted), and at the right a count per state: "◆ 1 ● 4 ● 4".
- Body: the groups, 6 px padding.

### Group rows

- Key group with **more than one** thread: a small header row, key in mono 12 px semibold, then the threads, indented 16 px.
- Key group with **one** thread: no header row. The thread row shows the key as a mono chip before the title, and the title loses its key prefix. This is a change to `SPEC.md` › UI. It removes about one row in three on a typical screen. The tree from the backend does not change; the page folds the row.
- "Reviews" and "No issue key": a muted header row (12 px, semibold).
- Closed group: the header row plus one dot per thread.

### Thread row (two lines, about 44 px)

```
[ind] [KEY] Title ......................................  [flags] [⧉ 2/4] [● #2102 ✓] [opus] [3m]
      Phrase · detail   › last message, one line, truncated ....................................
```

- Column 1, 16 px: the status indicator, aligned with line 1.
- Line 1: key chip (mono 11 px, muted, only for folded groups), title (13 px, weight 500; 650 when unseen). The title is the T3 link.
- Right of line 1: flags (subagents, auto-resume, pin), stack chip, PR chips, model chip, age. Gap 5 px. Age is mono 11 px.
- Line 2 (12 px, muted): the status phrase in the status text color, weight 500. Then the last message. It truncates with an ellipsis.
- Snoozed rows and settled rows show line 2 too, in muted color.
- Left edge: a 2 px bar, 6 px from the top and bottom, only for working and needs input.
- Hover: `--accent` background on the row. Hover on the title opens the **hover card** after 300 ms.
- Nested launched threads: indent 16 px, as now.

### Hover card

Opens on the title. It holds what does not fit the row: full phrase with the request detail (the command or question), model id and mode, branch, worktree, "started by", spawner or fork origin, run start time, each PR with checks, review, and +/− counts, the goal, and the full last message. See the mockup.

### PRs and stacks

- Groups in one stack sit together (rule 8 of `SPEC.md`). This proposal draws a **stack rail** around them: a label row "⧉ PR stack · 4 PRs · base main", then the threads, with the gradient rail at the left.
- The stack chip "⧉ 2/4" stays on each row, so the position is still clear when the rail is off screen.
- PR chips carry checks, review and conflict marks (§1). A draft has a dashed border. A merged PR is violet. A closed PR is struck through.

### Typography and spacing

- Sans: `Inter` when installed, else `system-ui`. Mono: `ui-monospace, "SF Mono", Menlo`. Mono for keys, PR numbers, ages, model names, repo names and paths. Use `tabular-nums`.
- Sizes: page title 15 px; project name 14 px; row title 13 px; line 2 and group headers 12 px; chips and age 11 px.
- Base line height 1.45. Row padding 5 px top, 6 px bottom. Radius: card 12 px, row 8 px, chip 6 px.
- Page side padding 16 px. The layout has no fixed width. At phone width, the right meta wraps under line 1 with the chips first and the model chip hidden.

## 6. Components

| Part | shadcn component | Note |
|---|---|---|
| Header filter "All / Needs you" | `ToggleGroup` (new) | `type="single"`. |
| "show settled" | `Switch` + `Label` | As now. |
| Attention summary | `Badge` (`variant="outline"`) | The "need you" chip gets the amber wash. |
| Banner | `Alert` | As now. |
| Project card | `Card` (new) with `CardHeader`, `CardContent` | Wrap in `Collapsible`. |
| Disclosure | `Collapsible` | As now. Chevron from `lucide-react` (`ChevronRight`, rotated when open). |
| Status dot | `Tooltip` | Tooltip shows the raw status, as now. |
| Thread detail | `HoverCard` (new) | On the title. 300 ms open delay. |
| PR, stack, model, flag chips | `Badge` | Use `asChild` with `<a>` for PR chips. |
| Icons | `lucide-react` | `ShieldQuestion` (approval), `MessageCircleQuestion` (question), `Workflow` (subagents), `RotateCw` (auto-resume), `Pin`, `Eye` (watched PR), `Layers` (stack), `Check`, `X`, `TriangleAlert`. They replace the text glyphs in the mockup. |
| First load | `Skeleton` (new) | Three row skeletons before the first push. |
| Stack rail, row wash, dots | none | Plain Tailwind classes and the CSS above. |

New components to add with the shadcn CLI: `card`, `hover-card`, `toggle-group`, `skeleton`.

## Open points for the synthesis

- The "Needs you" filter and the header counts are page-side. They need no backend change, but they need the new status fields in `ThreadNode`.
- Folding single-thread key groups changes `SPEC.md` › UI. The tree rules stay.
- `pendingBackgroundTasks` and the subagent count change the "no subagent signals" rule. Only counts, never rows.
- `blocking: false` requests: confirm on a real stream that T3 sends the field.
