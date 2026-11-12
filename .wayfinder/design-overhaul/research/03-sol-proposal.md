# Thread tree proposal: Slate signal

Use a compact outline with a fixed status column. Put the title, status, PR links and update age on one line. Let the user open details on a second line. Keep Project, issue key and spawn lineage as the tree levels.

This is a proposal. It does not change the app. The [static mockup](03-sol-mockup.html) shows the proposed light and dark modes with made-up data.

## Evidence and limits

The current page has small status dots and PR links at the far right. The demo confirms this layout at 1402 pixels wide. A wide gap separates each title from its PR links.

Sources read on 2026-11-12:

- [Terms](../../../CONTEXT.md) and [tree rules](../../../SPEC.md).
- [Stream decoder](../../../src/server/t3.ts), [page tree type](../../../src/shared/tree.ts), and [page](../../../src/page/app.tsx).
- T3 Code checkout `b054400645f921db8843b8d4fc4ff787f7b1bfa7`, file `packages/contracts/src/orchestrationV2.ts`, lines 2053-2151. This schema is the inventory source.
- The same checkout, `packages/contracts/src/orchestrationProject.ts`, `threadPullRequest.ts`, `modelSelection.ts`, `environment.ts` and `project.ts`. These files define nested values.

The inventory describes the local source contract. Optional fields can be absent on an older server. No live token or private thread content was read. The decoder discards most fields before it builds the page tree. Each proposed detail needs a decoder and shared-type change.

## Information inventory

"Now" describes the page or its tree builder. "Details" means content the user opens with a separate button. "Omit" means the page does not display the field. Preserve absent values as unknown. Do not show an absent value as zero or false.

### Thread fields

| Field | Now | Proposal |
|---|---|---|
| `id` | Link; title fallback | Keep link; show ID in details. |
| `projectId` | Placement | Keep placement; show project name in details. |
| `title` | Row | Keep the full title link. |
| `createdBy` | No | Details. Do not infer a spawner from these fields. |
| `creationSource` | No | Details. Do not infer a spawner from these fields. |
| `providerInstanceId` | No | Details. Show model and instance; show options as text. |
| `modelSelection` | No | Details. Show model and instance; show options as text. |
| `runtimeMode` | No | Details. Show the raw mode names. |
| `interactionMode` | No | Details. Show the raw mode names. |
| `branch` | No | Details. Show branch below the title when details are open. |
| `worktreePath` | No | Details. Show branch below the title when details are open. |
| `linkedPullRequest` | No | Details as fallback links when pullRequests is absent. Remove duplicate PRs. |
| `branchPullRequest` | No | Details as fallback links when pullRequests is absent. Remove duplicate PRs. |
| `pullRequests` | Number, URL, state; source filters; derived stack position | Keep row links. Add checks and review state in PR details. See nested inventory. |
| `lineage` | Parent and sideChat filter | Keep placement. Show relation and root in details. Keep subagent rows hidden. |
| `forkedFrom` | No | Details. Show source type and IDs. Do not treat a fork as spawn lineage. |
| `activeProviderThreadId` | No | Details for source diagnosis. |
| `historyOrigin` | No | Details for source diagnosis. |
| `linkOrigin` | No | Details. Show origin label or external parent title. Never add remote threads. |
| `delegatedFrom` | No | Details. Show origin label or external parent title. Never add remote threads. |
| `latestRunId` | No | Details. Use IDs to match timing to a run. |
| `activeRunId` | No | Details. Use IDs to match timing to a run. |
| `latestRunRequestedAt` | No | Row elapsed time for the current run; all exact times in details. |
| `latestRunStartedAt` | No | Row elapsed time for the current run; all exact times in details. |
| `latestRunCompletedAt` | No | Row elapsed time for the current run; all exact times in details. |
| `activityRunStartedAt` | No | Row elapsed time for the current run; all exact times in details. |
| `latestRunStopRequested` | No | Row label Stopping when true. |
| `activityRunStatus` | No | Row label Working or Waiting for thread. Preserve raw values in details. |
| `blockedOnThreadWait` | No | Row label Working or Waiting for thread. Preserve raw values in details. |
| `status` | Dot and tooltip; several values share one color | Visible text plus shape and color. Keep raw value in details. |
| `lastError` | No | Details. Show error text as plain text. Row label Failed when status fails. |
| `lastErrorClass` | No | Details. Show error text as plain text. Row label Failed when status fails. |
| `lastErrorCode` | No | Details. Show error text as plain text. Row label Failed when status fails. |
| `usageLimitResetAt` | No | Row label Limit until time. Show recovery settings in details. |
| `limitRecovery` | No | Row label Limit until time. Show recovery settings in details. |
| `pendingRuntimeRequest` | Dot from presence; kind decoded but not shown | Row label Approval or Input; details include blocking state and request time. |
| `pendingGuestMessageCount` | No | Small row badge when positive. No send or dismiss action. |
| `latestVisibleMessage` | No | Details as plain text, with role and exact time. Challenge below. |
| `latestUserMessageAt` | No | Details. Keep the two labels distinct. |
| `latestUserAuthoredMessageAt` | No | Details. Keep the two labels distinct. |
| `hasActionableProposedPlan` | No | Row badge Plan ready when true. Open T3 to act. |
| `pendingBackgroundTasks` | No | Details by kind and description. No subagent count on the row. |
| `providerInstanceHistory` | No | Details. Use raw instance IDs if names are unavailable. |
| `goal` | No | Details. Show objective, status and available budget values; no percent without a budget. |
| `itemCount` | No | Omit from the page. Counts do not describe work progress. |
| `visibleItemCount` | No | Omit from the page. Counts do not describe work progress. |
| `createdAt` | No | Details with an exact date. |
| `updatedAt` | Sort only | Row age, with exact time in details. Challenge below. |
| `archivedAt` | Exclusion | Keep exclusion; no archive view. |
| `deletedAt` | Exclusion | Keep exclusion; no archive view. |
| `settledOverride` | No | Details. Do not change the settled filter. |
| `unsettledAt` | No | Details. Do not change the settled filter. |
| `settledAt` | Filter | Keep filter; show time in details. |
| `snoozedUntil` | Badge and status | Keep time and explicit Snoozed label. Keep text contrast. |
| `snoozedAt` | No | Details. |
| `pinnedAt` | No | Details. Do not change sort order. |
| `autoSettleDisabledAt` | No | Details. Do not change sort order. |
| `pinOrderKey` | No | Omit. Keep the specified tree order. |
| `activeOrderKey` | No | Omit. Keep the specified tree order. |
| `tags` | No | Details. Show plain tag text. |
| `lastVisitedAt` | No | Omit. Do not copy T3 search ranking into this tree. |
| `opens` | No | Omit. Do not copy T3 search ranking into this tree. |
| `titleRegeneration` | No | Details label Title update pending; no animation on the title. |

### Nested thread fields

The following list covers the contents of the structured fields above. The current page shows only the PR number, URL and state. It uses the PR source for filters. Other nested values have no direct display.

| Field contents | Proposal |
|---|---|
| `modelSelection.instanceId, model, options` | Details with option names and values. |
| `lineage.parentThreadId, relationshipToParent, rootThreadId, sideChat` | Internal placement and exclusion; relation and IDs in details. |
| `forkedFrom.type, threadId, runId, nodeId, providerThreadId, providerTurnId` | Details for the applicable source type. |
| `linkOrigin.sessionId, label, access` | Show label and access in details; omit session ID. |
| `delegatedFrom.environmentId, threadId, title` | Details as a source reference. |
| `pendingRuntimeRequest.id, kind, createdAt, blocking` | Show kind, age and blocking state; keep ID internal. |
| `latestVisibleMessage.id, role, text, updatedAt` | Details with role, plain text and time; keep ID internal. |
| `pendingBackgroundTasks[].taskId, description, parentTaskId, awaited, kind, providerInstanceId, childThreadId` | Details with kind, description and awaited state. Use IDs for links only. |
| `goal.objective, status, tokensUsed, tokenBudget, timeUsedSeconds, checks, lastCheck` | Details with explicit units. A missing token budget has no progress bar. |
| `limitRecovery.requestId, runId, resetAt, autoResume, snooze` | Details with reset time and recovery flags. Keep IDs internal. |
| `titleRegeneration.requestId, startedAt` | Details with start time; omit request ID. |
| `opens.openedAt, score, picks[].query, picks[].at` | Omit. These values support T3 search ranking. |
| `tags[]` | Details as text. |
| `providerInstanceHistory[]` | Details as instance IDs. |

### PR fields

| Field | Now | Proposal |
|---|---|---|
| `host, repository, number, url` | Number and URL | Keep links; add repository in details. Use host and repository to prevent number collisions. |
| `repositoryWebUrl, source, linkedAt` | Source used for filters | Details. Preserve source filters for row links. |
| `snapshot.state` | State | Keep. A missing snapshot means Unknown, even if the current stack code assumes open. |
| `snapshot.title, headBranch, baseBranch, isDraft` | No | PR details. |
| `snapshot.updatedAt, syncedAt, closedAt, mergedAt` | No | PR details with exact times. Label syncedAt as Last checked. |
| `snapshot.author` | No | PR details with `login`, `name`, `avatarUrl` and `isBot` when present. |
| `snapshot.additions, deletions, changedFiles` | No | PR details with units. |
| `snapshot.reviewDecision, checksState, mergeability` | No | PR details; row warning badge for failed checks or conflicts. Unknown stays unknown. |
| `stack.kind, id, number, url, base` | Derived stack badge only | Keep derived position. Show native stack link and base in PR details. |
| `stack.layers[].number, headBranch, state` | No | Ordered links in PR details. Do not add a tree level. |
| `watch.startedAt, headSha, failedChecks, passed, passedChecks, owedChecks, remarksThrough, remarkIds, conflicting, wakes, checksAwaitedSince` | No | Details show Watching, start time, head SHA, check names and conflict state. Omit remark IDs, wake count and remark cursor. |
| `endedWatch` with the same fields as `watch` | No | Omit. It is a notification cursor after a watch ends. |
| `linkedPullRequest` and `branchPullRequest`: `projectId, repository, number, url` | No | Fallback links in details. Never replace an explicit PR link. |

### Project fields

| Field | Now | Proposal |
|---|---|---|
| `id` | Placement | Keep internal. |
| `title` | Project row | Keep. |
| `workspaceRoot` | No | Project details. |
| `repositoryIdentity` | No | Project details with repository link. |
| `defaultModelSelection` | No | Project details. |
| `defaultThreadEnvMode` | No | Project details. |
| `autoPull` | No | Omit; this page cannot change it. |
| `faviconPath` | No | Omit local file loading. |
| `projectIcon` | No | Use known icon types; fall back to a monogram. |
| `scripts` | No | Omit; the page cannot run scripts. |
| `pinnedAt` | No | Project details; keep tree order. |
| `archivedAt` | No | Project details; do not add an archive filter. |
| `createdAt` | No | Project details. |
| `updatedAt` | No, project order comes from threads | Project details; keep thread-based order. |

For `repositoryIdentity`, show `displayName`, `webUrl`, `provider`, `owner`, `name` and `rootPath` in project details when present. Keep `canonicalKey`, `locator` and `origin` internal. They identify the repository, not its progress.

For `projectIcon`, use `kind` and its `name`, `emoji` or `text`, plus `color`. Accept legacy monogram fields through the T3 decoder. Unknown types use a monogram.

Omit all script fields: `id`, `name`, `command`, `icon`, `runOnWorktreeCreate`, `runOnSettle`, `async`, `previewUrl` and `autoOpenPreview`.

The stream also sends snapshot metadata and event sequence values. Keep `schemaVersion`, `snapshotSequence`, event `sequence`, `resolvedRepositoryIdentityRoots` and `olderSettled` internal. Keep archived thread arrays excluded. They are not row content.

### Challenges to the rough tree UI choices

- Challenge: show update age on the row. Use `updatedAt` and label it Updated. It is not the time since the user last replied.
- Challenge: show the latest message in details. Limit the preview to 600 characters. The T3 link opens the full content. Do not render message HTML.
- Challenge: show a Launched by link in details when the existing SQLite lookup finds a spawner. Keep placement unchanged. If no spawner is known, omit the link.
- Keep subagent rows, counts and signals hidden. The pending work list is available only in details. This retains the tree rule but permits source diagnosis.

## Color palette

Use Slate signal. Blue means work is in progress. Amber means the user has input to give. Green means a run is complete. Rose means a run stopped with an error or cancellation. The visible label gives the exact meaning.

Set these shadcn variables. Use `.dark` for an explicit theme choice. Follow the system theme on first load.

```css
:root, .light {
  --background: #f8fafc;
  --foreground: #172033;
  --card: #ffffff;
  --muted: #eef2f7;
  --muted-foreground: #475569;
  --primary: #1d4ed8;
  --primary-foreground: #ffffff;
  --border: #cbd5e1;
  --status-running: #1d4ed8;
  --status-needs-input: #92400e;
  --status-completed: #166534;
  --status-cancelled: #9f1239;
  --status-idle: #475569;
  --status-snoozed: #475569;
  --card-foreground: #172033;
  --popover: #ffffff;
  --popover-foreground: #172033;
  --secondary: #eef2f7;
  --secondary-foreground: #172033;
  --accent: #eef2f7;
  --accent-foreground: #172033;
  --input: #cbd5e1;
  --ring: #1d4ed8;
  --destructive: #9f1239;
  --radius: 0.5rem;
}
.dark {
  --background: #101827;
  --foreground: #e5edf7;
  --card: #172033;
  --muted: #223047;
  --muted-foreground: #a8b8cc;
  --primary: #93c5fd;
  --primary-foreground: #101827;
  --border: #52647c;
  --status-running: #93c5fd;
  --status-needs-input: #fcd34d;
  --status-completed: #86efac;
  --status-cancelled: #fda4af;
  --status-idle: #a8b8cc;
  --status-snoozed: #a8b8cc;
  --card-foreground: #e5edf7;
  --popover: #172033;
  --popover-foreground: #e5edf7;
  --secondary: #223047;
  --secondary-foreground: #e5edf7;
  --accent: #223047;
  --accent-foreground: #e5edf7;
  --input: #52647c;
  --ring: #93c5fd;
  --destructive: #fda4af;
  --radius: 0.5rem;
}
```

### Contrast

The table gives the lowest contrast against background, card and muted colors. Use the same status foreground on row tints. Each tint stays between card and muted. Do not lower text opacity for snoozed or disconnected threads.

| Text token | Light minimum | Dark minimum |
|---|---:|---:|
| `foreground` | 14.47:1 | 11.25:1 |
| `muted-foreground` | 6.74:1 | 6.57:1 |
| `running` | 5.96:1 | 7.36:1 |
| `needs-input` | 6.31:1 | 9.21:1 |
| `completed` | 6.34:1 | 9.46:1 |
| `cancelled` | 7.13:1 | 7.02:1 |
| `idle` | 6.74:1 | 6.57:1 |
| `snoozed` | 6.74:1 | 6.57:1 |

Ratios use sRGB relative luminance and `(Llighter + 0.05) / (Ldarker + 0.05)`. The values are calculated from the hex values above. All listed text pairs exceed 4.5:1. Use no text over a gradient with a darker endpoint. The focus ring uses primary on card. PR badges use card backgrounds and status text.

## Gradients

Keep gradients static and limited to small areas. A project header tint separates projects. A running row tint marks active work. A stack stripe joins related PR badges without adding hierarchy.

```css
.project-heading {
  background: linear-gradient(100deg, var(--muted), var(--card) 75%);
}
.thread-running {
  background: linear-gradient(90deg, var(--muted), var(--card) 65%);
  border-inline-start: 2px solid var(--status-running);
}
.stack-badge {
  background: var(--card);
  border-inline-start: 3px solid var(--status-running);
  border-image: linear-gradient(var(--status-running), var(--status-completed)) 1;
}
```

Do not use a gradient as a progress meter. The stream has no work completion percentage.

## In-progress indicators

Show a 12-pixel icon and a text label in a 120-pixel status column. Color supplements the label.

| State | Shape and text | Motion | Reduced motion |
|---|---|---|---|
| running | Open ring, Working | Rotate ring in 1.4 s | Static ring and label |
| queued | Clock, Queued | None | Same |
| preparing | Hollow square, Preparing | None | Same |
| starting | Open ring, Starting | Rotate ring in 1.4 s | Static ring and label |
| needs input | Diamond, Input or Approval | None | Same |
| completed | Check, Done, your turn | None | Same |
| failed | Cross, Failed | None | Same |
| interrupted or cancelled | Stop square, Interrupted or Cancelled | None | Same |
| idle | Small circle, Idle | None | Same |
| waiting | Pause, Waiting | None | Same |
| snoozed | Moon, Snoozed until time | None | Same |

Keep pending input visible even when the thread is snoozed. The current builder already gives pending input priority over snooze. Keep that behavior. The UI table in SPEC.md states a different precedence. If `blocking` is false, show Input available and retain the Working indicator. If `blocking` is absent, show Input and do not assert that the run has stopped.

Use this order for the main label: pending blocking or unknown input, snoozed, stopping, limit recovery, activity status, raw status. Show nonblocking input as a second badge. `blockedOnThreadWait` changes Waiting to Waiting for thread. Do not describe every waiting thread as waiting for the user.

```css
.work-ring { animation: work-turn 1.4s linear infinite; }
@keyframes work-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .work-ring { animation: none; }
}
```

On disconnect, stop motion and show a persistent stale-data banner with the last update time. Keep text readable. Announce the connection change once with `role="status"`. Do not announce each timer update.

## Layout and density

Use a centered content area with a maximum width of 1200 pixels. Use 16-pixel page padding and a 24-pixel indent per tree level. Project headers are 40 pixels high. Group headers are 28 pixels high. Thread rows have a minimum height of 36 pixels. Use 13-pixel system text with a 20-pixel line height. Use 12-pixel metadata and tabular time digits.

The row order is disclosure space, status, title, PR links, age, then the details button. Give the title the remaining width. Keep the PR links next to the title area. Show at most two PR links, then a button labelled with the remaining count. This button opens all PR links in details. Keep the title link separate from all buttons.

At widths below 720 pixels, wrap PR links and age onto a second line. Keep status text visible. Let the title wrap to two lines. Details contain the full title. Do not require horizontal scrolling. Use 44-pixel button targets on touch screens.

Keep all groups open on first load. Preserve disclosure state across stream updates and reloads. Closed groups show status counts with text, such as 2 working and 1 input. Keep the specified group and PR stack order. Do not move a row when its status changes.

Use nested lists and named disclosure buttons. Do not apply ARIA tree roles unless the full tree keyboard behavior is implemented. Tab reaches links and buttons. Enter opens links. Space toggles buttons. Show a 2-pixel focus ring with a 2-pixel gap. A tooltip cannot be the only source of a label.

Put the settled switch and a system/light/dark choice in the page header. Keep summary counts within each project. Counts describe visible top-level threads only. When settled threads are visible, label them Settled. An empty page says No active threads and offers the settled switch. Loading says Connecting to T3. A rejected token keeps the existing command banner.

## Components

| Page part | shadcn component | Use |
|---|---|---|
| Project and group disclosure | Collapsible, Button | Named trigger; keep nested lists. |
| Thread status and PR stack | Badge | Visible text with a small icon. |
| Details | Collapsible | Separate button beside the title link. |
| Extra PR links | Popover | Ordered links; return focus to its trigger. |
| Exact times and raw status | Tooltip | Supplement details; support focus and hover. |
| Theme choice | Select | System, Light, Dark. |
| Settled choice | Switch, Label | Keep stored choice. |
| Connection or token error | Alert, AlertDescription | Keep visible until recovery. |
| Detail sections | Separator | Separate run, PR and source data. |

Do not add a card around every thread. Do not add a sidebar. Those choices use space without adding a tree relation.

## Cost and checks for the design spec

The largest cost is the data path. Extend the decoder and shared tree type before adding details. Keep optional values optional. Keep PR state separate from thread status. PR checks can fail while the thread is still working.

The static mockup does not implement live updates, disclosure persistence, theme storage or T3 navigation. It shows the six requested design areas. The design spec should require checks for keyboard focus, narrow widths, reduced motion, stale data, missing fields and long titles. Check light and dark mode for each build key.

## Verification

The demo ran with `PORT=4776 bun run demo`. The page loaded in the shared browser. The proposed static mockup was rendered at widths of 728 and 390 pixels. Both color modes fit without horizontal scroll. The mockup has no external assets or scripts.

`bun test` passed all 18 tests. `bun run typecheck` passed. These checks cover the existing app. They do not prove the proposed data additions. No app source files changed.
