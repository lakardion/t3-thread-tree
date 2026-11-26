/** Serves the page with made-up threads, run through the real tree rules. No T3 needed. */
import { dirname } from "node:path";

import index from "../src/page/index.html";
import upNext from "../src/page/up-next.html";
import { buildLinearTree, buildTree, defaultRules, parseRules } from "../src/server/build-tree.ts";
import { findRoutes } from "../src/server/find.ts";
import { lastMessageRoutes } from "../src/server/last-message.ts";
import { runItems } from "../src/server/runs.ts";
import { cliPath, type CliRun, projectChoices, sendService } from "../src/server/send.ts";
import { settleRoutes } from "../src/server/settle.ts";
import { settledPage, settledRoutes, settledSignature } from "../src/server/settled.ts";
import type { Pr, Project, RunsSnapshot, Thread } from "../src/server/t3.ts";
import { launchList, scanFields } from "../src/server/workflow-start.ts";
import { workflowRoutes } from "../src/server/workflows.ts";
import type { LocalConfig, LocalState, ModelPick } from "../src/shared/model.ts";
import type { RuleId } from "../src/shared/rules.ts";
import { type CatchUp, parseLabels, type LinearIssue } from "../src/shared/tree.ts";

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const later = (h: number) => new Date(now + h * 3_600_000).toISOString();
const gh = (n: number) => `https://github.com/acme/storefront/pull/${n}`;

let seq = 0;
function t(title: string, over: Partial<Thread> = {}): Thread {
  seq += 1;
  return {
    id: `demo-${seq}`,
    projectId: "storefront",
    title,
    status: "completed",
    parentThreadId: null,
    sideChat: false,
    pending: null,
    guestMessages: null,
    activityRunStatus: null,
    blockedOnThreadWait: false,
    hasPlan: false,
    interactionMode: null,
    latestRunCompletedAt: null,
    lastVisitedAt: null,
    activityRunStartedAt: null,
    latestRunStartedAt: null,
    settledAt: null,
    snoozedUntil: null,
    updatedAt: ago(seq * 7),
    gone: false,
    prs: [],
    lastError: null,
    lastErrorClass: null,
    lastErrorCode: null,
    limitResetAt: null,
    autoResume: false,
    stopRequested: false,
    model: null,
    branch: null,
    worktreePath: null,
    forkedFromThreadId: null,
    delegatedFromTitle: null,
    linkLabel: null,
    createdBy: null,
    creationSource: null,
    createdAt: ago(seq * 7 + 120),
    goal: null,
    tags: [],
    pinned: false,
    workflowRun: null,
    ...over,
  };
}

/** GitHub labels per PR. One very light and one very dark color, plus a label nobody watches. */
const RFR = { name: "ready-for-review", color: "0e8a16" };
const QA = { name: "needs-qa-on-staging-before-merge", color: "fef2c0" };
const DNM = { name: "do-not-merge", color: "1d1d1f" };
const SIZE = { name: "size:L", color: "ededed" };
const LABELS: Record<number, { name: string; color: string }[]> = {
  2102: [RFR, SIZE],
  2107: [RFR, QA],
  2104: [DNM],
  2088: [RFR],
  2095: [RFR],
  3002: [RFR],
  3003: [QA],
  3004: [RFR],
  3010: [RFR],
  4202: [RFR],
};

/** A four-PR stack spread over four issue keys. */
const STACK = [2101, 2102, 2104, 2107];
const pr = (n: number, source: string, state = "open", over: Partial<Pr> = {}): Pr => ({
  n,
  url: gh(n),
  host: "github.com",
  repository: "",
  updatedAt: "",
  syncedAt: "",
  source,
  state,
  draft: null,
  checks: null,
  review: null,
  mergeability: null,
  head: null,
  base: null,
  stackBase: null,
  stackNumber: null,
  stackLayers: null,
  stackSlots: null,
  title: null,
  additions: null,
  deletions: null,
  changedFiles: null,
  ...over,
});
const stacked = (own: number, over: Partial<Pr> = {}) => [
  pr(own, "created", "open", { stackBase: "main", stackNumber: 87, ...over }),
  ...STACK.filter((n) => n !== own).map((n) => pr(n, "stack")),
];
const request = (kind: string, blocking: boolean | null = null) => ({ kind, createdAt: ago(12), blocking });
const completed = { latestRunCompletedAt: ago(30) };

const threads: Thread[] = [
  t("SHOP-412 · Checkout: split the payment step into its own route", {
    status: "running",
    activityRunStartedAt: ago(9),
    model: "claude-opus-4-7",
    branch: "shop-412-payment-route",
    worktreePath: "~/.t3/worktrees/storefront/shop-412",
    createdBy: "agent",
    creationSource: "mcp",
    prs: stacked(2101, {
      checks: "pending",
      title: "Split the payment step",
      additions: 212,
      deletions: 40,
      changedFiles: 9,
    }),
  }),
  t("SHOP-413 · Saved cards list with default selection", {
    pending: request("user_input"),
    status: "running",
    stopRequested: true,
    model: "claude-sonnet-5-5",
    prs: stacked(2102, { checks: "passing", review: "approved" }),
  }),
  t("SHOP-415 · Apple Pay button behind a feature flag", {
    ...completed,
    lastVisitedAt: ago(5),
    prs: stacked(2104, { draft: true }),
  }),
  t("SHOP-418 · Order summary sidebar in the new design", {
    status: "interrupted",
    forkedFromThreadId: "demo-1",
    prs: stacked(2107, { checks: "failing", review: "changes-requested", mergeability: "conflicting" }),
  }),
  t("SHOP-410 · Move the cart totals into one helper", {
    prs: [pr(2099, "created", "merged", { stackBase: "main", stackNumber: 87 }), ...STACK.map((n) => pr(n, "stack"))],
  }),
  t("Review #2088 SHOP-398", { prs: [pr(2088, "agent")] }),
  t("Review #2093 SHOP-401", { status: "running", prs: [pr(2093, "agent")] }),
  t("Review #2095 SHOP-401", { latestRunCompletedAt: ago(120), prs: [pr(2095, "agent", "merged")] }),
  t("Design-system migration map", { id: "map", status: "idle" }),
  t("Migrate Button to the new tokens", { id: "m1", status: "running" }),
  t("Migrate Dialog to the new tokens", { id: "m2", ...completed }),
  t("Migrate Tooltip to the new tokens", { id: "m3", snoozedUntil: later(20) }),
  t("Migrate Popover to the new tokens", { id: "m4", status: "idle" }),
  t("Flaky e2e: cart badge count", {
    status: "failed",
    lastErrorClass: "provider",
    lastErrorCode: "rate_limited",
    lastError: "The provider closed the stream before the run finished.",
    limitResetAt: later(2),
    autoResume: true,
    tags: ["flaky", "e2e"],
    pinned: true,
  }),
  t("API-77 · Rate-limit the search endpoint per API key", { projectId: "api", status: "running" }),
  t("API-77 · Document the rate-limit headers", { projectId: "api" }),
  t("API-81 · Move webhook retries to a durable queue", { projectId: "api", pending: request("command") }),
  t("Investigate slow cold starts", {
    projectId: "api",
    goal: { objective: "Cut cold start below 400 ms", status: "active" },
    linkLabel: "Linear",
    snoozedUntil: later(14),
    status: "idle",
  }),
  t("DOC-12 · Getting-started guide for the CLI", { projectId: "docs", ...completed, latestRunCompletedAt: ago(90) }),
  t("API-90 · Queue the nightly export job", { projectId: "api", status: "queued" }),
  t("API-91 · Fan out the reindex across shards", { projectId: "api", status: "running", blockedOnThreadWait: true }),
  t("API-92 · Draft the pagination plan", {
    projectId: "api",
    ...completed,
    interactionMode: "plan",
    hasPlan: true,
    model: "claude-opus-4-7",
    delegatedFromTitle: "API-77 · Rate-limit the search endpoint per API key",
  }),
  t("API-93 · Confirm the retry policy", { projectId: "api", status: "running", pending: request("command", false) }),
  t("DOC-14 · Review the changelog wording", { projectId: "docs", guestMessages: 1 }),
  t("Fix broken anchors after the sidebar change", { projectId: "docs", status: "cancelled" }),
  t("DOC-15 · Link the four release PRs", {
    projectId: "docs",
    ...completed,
    prs: [
      pr(3001, "linked", "open", {
        checks: "passing",
        review: "approved",
        title: "Bump to 4.2",
        additions: 12,
        deletions: 3,
        changedFiles: 2,
      }),
      pr(3002, "linked", "merged", { title: "Changelog entry", additions: 40, deletions: 0, changedFiles: 1 }),
      pr(3003, "linked", "closed", { title: "Try the old layout", additions: 5, deletions: 90, changedFiles: 6 }),
      pr(3004, "linked", "open", {
        draft: true,
        title: "Docs for 4.2",
        additions: 300,
        deletions: 12,
        changedFiles: 14,
      }),
    ],
  }),
  t("API-94 · Approve the schema change, then sleep", {
    projectId: "api",
    status: "running",
    pending: request("command"),
    snoozedUntil: later(30),
  }),
  t("Rewrite the install page", { id: "launched", projectId: "docs" }),
  t("Docs sweep map", { id: "sweep", projectId: "docs", settledAt: ago(300), ...completed }),
  t("Sweep: fix the install page links", { id: "sweep-1", projectId: "docs", status: "running" }),
  t("Sweep: rename the guides folder", { id: "sweep-2", projectId: "docs", ...completed }),
  t("Compare two date libraries", { projectId: "scratch", status: "idle" }),
  t("DOC-16 · Archive the old tutorial", { projectId: "docs", settledAt: ago(60), prs: [pr(3010, "linked")] }),
  t("Cache rollout dispatch", { id: "dispatch", projectId: "api", ...completed }),
  t("Search revamp map", { id: "search", projectId: "api", status: "idle" }),
  t("Search: plan the new index", { id: "search-plan", projectId: "api", ...completed }),
  t("Search: build the index writer", { id: "search-w", projectId: "api", status: "running" }),
  t("Search: backfill old documents", { id: "search-b", projectId: "api", pending: request("user_input") }),
  t("Search: rank by freshness", { id: "search-r", projectId: "api", snoozedUntil: later(45) }),
  ...[4201, 4202, 4203].map((own, i) =>
    t(`cache-0${i + 1} · ${["Add the cache client", "Cache the search results", "Purge on write"][i]}`, {
      id: `cache-${i + 1}`,
      projectId: "api",
      status: i === 2 ? "running" : "idle",
      prs: [4201, 4202, 4203].map((n) =>
        n === own ? pr(n, "created", "open", { stackBase: "main", checks: "passing" }) : pr(n, "stack"),
      ),
    }),
  ),
  /** The latest run is a queued follow-up with no start or end; an older run still works. */
  t("Move the project docs to the wiki", {
    projectId: "docs",
    status: "queued",
    activityRunStatus: "running",
    activityRunStartedAt: ago(2),
    updatedAt: ago(0),
    prs: [pr(3020, "created")],
  }),
];
/** The thread that the push steps add to API-77 and remove again. */
const extra = t("API-77 · Add a per-key quota dashboard", { projectId: "api" });
/** Step threads of the fake runs. They show only under their run. */
const stepThread = (id: string, runId: string, name: string, title: string, over: Partial<Thread> = {}) =>
  t(title, { id, workflowRun: { runId, workflow: "ship-issue", step: name }, ...over });
threads.push(
  stepThread("wf-plan", "run-8", "plan", "Plan SHOP-430 Gift cards", {
    createdAt: ago(100),
    latestRunCompletedAt: ago(80),
    lastVisitedAt: ago(70),
  }),
  stepThread("wf-impl", "run-8", "implement", "Implement SHOP-430 Gift cards", {
    status: "running",
    createdAt: ago(75),
    activityRunStartedAt: ago(12),
  }),
  stepThread("wf-docs", "run-8", "docs", "Update the docs for SHOP-430", {
    projectId: "docs",
    status: "running",
    createdAt: ago(60),
    activityRunStartedAt: ago(5),
  }),
  stepThread("wf-review", "run-9", "review", "Review #2110 Gift cards", {
    status: "running",
    createdAt: ago(20),
    activityRunStartedAt: ago(4),
  }),
  stepThread("wf-fail", "run-10", "implement", "Implement SHOP-431 Wallet export", {
    status: "failed",
    createdAt: ago(50),
  }),
  stepThread("wf-old", "run-11", "implement", "Implement SHOP-399 Old report", {
    createdAt: ago(600),
    lastVisitedAt: ago(30),
  }),
);
const spawners: Record<string, string> = {
  m1: "map",
  m2: "map",
  m3: "map",
  launched: "map",
  "sweep-1": "sweep",
  "sweep-2": "sweep",
  "cache-1": "dispatch",
  "cache-2": "cache-1",
  "cache-3": "cache-2",
  "search-plan": "search",
  "search-r": "search",
  "search-w": "search-plan",
  "search-b": "search-plan",
};
/** The map key that the first message of a thread names; m4 and the sweep threads start with `/wayfinder`. */
const MAP_KEYS: Record<string, string> = {
  m1: "/wiki/design-system",
  m2: "/wiki/design-system",
  m3: "/wiki/design-system",
  m4: "/wiki/design-system",
  "search-plan": "/wiki/search-revamp",
  "search-r": "/wiki/search-revamp",
  "sweep-1": "/wiki/docs-sweep",
  "sweep-2": "/wiki/docs-sweep",
};
const projects = new Map<string, Project>([
  ["storefront", { title: "storefront", repo: "acme/storefront" }],
  ["api", { title: "api-gateway", repo: "acme/api-gateway" }],
  ["docs", { title: "docs-site", repo: null }],
  ["scratch", { title: "No project", repo: null }],
]);

const CHECKOUT = {
  id: "demo-checkout",
  name: "Checkout redesign",
  url: "https://linear.app/acme/project/checkout-redesign",
};
const PAYMENTS = { id: "demo-payments", name: "Payments", url: "https://linear.app/acme/project/payments" };
const BETA = { id: "demo-beta", name: "Beta", targetDate: "2026-12-01" };
/** Linear data by issue key. Beta holds two issues. Threads with no key stay without Linear data. */
const LINEAR: Record<string, LinearIssue> = {
  "SHOP-412": { project: CHECKOUT, milestone: BETA },
  "SHOP-401": { project: CHECKOUT, milestone: BETA },
  "SHOP-413": { project: CHECKOUT, milestone: { id: "demo-polish", name: "Polish", targetDate: null } },
  "SHOP-415": { project: PAYMENTS, milestone: null },
  "SHOP-418": { project: null, milestone: null },
  "SHOP-398": { project: PAYMENTS, milestone: { id: "demo-launch", name: "Launch", targetDate: "2026-12-15" } },
};

/** A fixed Catch-up for some waiting threads, one per state, so the surfaces show every look. */
const CATCH_UP: Record<string, CatchUp> = {
  "demo-2": {
    state: "done",
    pick: "claude",
    did: "Saved cards list works.",
    ask: "Make a new card the default?",
    options: ["At once", "Only when picked"],
    question: "Should a new card become the default at once, or only when picked?",
  },
  "demo-15": {
    state: "done",
    pick: "claude",
    did: "Retry queue needs a new table.",
    ask: "Approve db:migrate retry_queue?",
    options: [],
    question: "Approve db:migrate retry_queue?",
  },
  "demo-17": {
    state: "done",
    pick: process.env.APPLE === "ok" ? "apple" : "claude",
    did: "Looked at the cache layer.",
    ask: null,
    options: [],
    doneLike: true,
    question: "I looked at the cache layer and the notes are in the thread.",
  },
  m2: { state: "failed", pick: "claude", question: "Dialog is migrated. Merge it now?" },
  "search-b": { state: "running", pick: "claude" },
};

const projectsFor = (settled: boolean, rules = defaultRules(false), labels: string[] = [], wantsLinear = false) =>
  (wantsLinear ? buildLinearTree : buildTree)(
    {
      threads,
      projects,
      spawnerOf: (id) => spawners[id],
      mapKeyOf: (id) => MAP_KEYS[id] ?? null,
      environmentId: "demo",
      settled,
      now,
      labels,
      labelsOf: (p) => LABELS[p.n],
      catchUpOf: (id) => CATCH_UP[id],
      lastMessagesOf: (ids) => new Map(ids.map((id) => [id, lastMessage(id)])),
      linearOf: wantsLinear ? (key) => LINEAR[key] : undefined,
      runs: workflows,
      stepsOf: (runId) => RUN_STEPS[runId],
      origin: "http://127.0.0.1:3773",
    },
    rules,
  );
/** The fake `workflows.get` steps of the runs that have step threads. */
const RUN_STEPS: Record<string, { name: string; status: string; threadId: string | null }[]> = {
  "run-8": [
    { name: "plan", status: "completed", threadId: "wf-plan" },
    { name: "implement", status: "running", threadId: "wf-impl" },
    { name: "docs", status: "running", threadId: "wf-docs" },
    { name: "review", status: "running", threadId: null },
  ],
  "run-9": [{ name: "review", status: "running", threadId: "wf-review" }],
  "run-10": [{ name: "implement", status: "failed", threadId: "wf-fail" }],
};
/** A fake `workflows.subscribe` snapshot: questions with and without choices, and paused runs that wait, that resume alone and that are retired. */
const LONG_FAIL =
  "Step `open-pr` failed after 3 attempts: gh: GraphQL: Resource not accessible by integration (createPullRequest).\nThe token in GH_TOKEN lacks the `pull_requests: write` permission for acme/storefront. Retry with a token that has that scope, or open the PR by hand and resume the run so it picks up the existing PR from the branch shop-412-payment-route.";
const wfRun = (
  runId: string,
  title: string,
  over: Partial<RunsSnapshot["runs"][number]> = {},
): RunsSnapshot["runs"][number] => ({
  runId,
  workflow: "ship-issue",
  title,
  status: "waiting",
  detail: null,
  retired: false,
  resumesAt: null,
  updatedAt: ago(30),
  parentRunId: null,
  parentStep: null,
  startedAt: ago(90),
  ...over,
});
const wfAsk = (runId: string, over: Partial<RunsSnapshot["questions"][number]>): RunsSnapshot["questions"][number] => ({
  runId,
  name: "approve",
  title: "Approve?",
  choices: [],
  askedAt: ago(20),
  thread: null,
  ...over,
});
const workflows: RunsSnapshot = {
  workflows: [
    { name: "review-pr", version: 3, triggers: [] },
    { name: "land-stack", version: 1, triggers: [] },
    { name: "digest", version: 2, triggers: ["every 1h"] },
    { name: "sentry-hook", version: 1, triggers: ["webhook sentry"] },
  ],
  runs: [
    wfRun("run-1", "Ship SHOP-412 Split the payment step"),
    wfRun("run-2", "Review PR #2107 Saved cards list", { workflow: "review-pr" }),
    wfRun("run-3", "Nightly deps bump", { workflow: "nightly-deps" }),
    wfRun("run-4", "Ship SHOP-420 Apple Pay button", { status: "paused", detail: LONG_FAIL, updatedAt: ago(45) }),
    wfRun("run-5", "Review PR #2088 Coupon field", {
      workflow: "review-pr",
      status: "paused",
      detail: "Step `review` failed: the agent hit its usage limit.",
      resumesAt: later(1),
    }),
    wfRun("run-6", "Triage bugs from Sentry", {
      workflow: "triage-bugs",
      status: "paused",
      detail: "Step `label` failed: unknown label `p2`.",
      retired: true,
      updatedAt: ago(75),
    }),
    wfRun("run-7", "Release 4.2", { workflow: "release", status: "completed" }),
    wfRun("run-8", "Ship SHOP-430 Gift cards", { status: "running", startedAt: ago(100), updatedAt: ago(2) }),
    wfRun("run-9", "Review #2110 Gift cards", {
      workflow: "review-pr",
      status: "running",
      parentRunId: "run-8",
      parentStep: "review",
      startedAt: ago(20),
      updatedAt: ago(3),
    }),
    wfRun("run-10", "Ship SHOP-431 Wallet export", {
      status: "paused",
      detail: "Step `implement` failed: the agent hit its usage limit.",
      startedAt: ago(50),
      updatedAt: ago(15),
    }),
    wfRun("run-11", "Ship SHOP-399 Old report", { status: "completed", startedAt: ago(600), updatedAt: ago(500) }),
  ],
  questions: [
    wfAsk("run-1", {
      title: "Approve the plan for SHOP-412?",
      choices: ["Approve", "Revise", "Stop"],
      askedAt: ago(14),
      thread: { threadId: "demo-1", environmentId: null },
    }),
    wfAsk("run-2", {
      name: "pick-fixes",
      title:
        "The review found 4 problems in PR #2107. Two are in code that the PR did not touch. Which fixes do you want the agent to make before it asks for a re-review?",
      choices: [
        "Fix all 4",
        "Fix only the 2 in this PR",
        "Fix the null check in SavedCards and skip the rest",
        "None, request re-review now",
        "Close the PR",
      ],
      askedAt: ago(52),
    }),
    wfAsk("run-3", { name: "confirm", title: "Bump react to 19.3?", askedAt: ago(3) }),
  ],
};
/** The fake workflow files. `WF_SCAN=off` makes the read fail, as a token without the read scope does. */
const DEFINITION = [
  { source: "const payload = { pr: PR, text: Text }", workflows: ["review-pr@3"] },
  { source: "const payload = { stack: Stack }", workflows: ["land-stack@1"] },
  { source: "const payload = { threadIds: Ids, text: Text }", workflows: ["digest@2"] },
  { source: "const payload = { project: Path }", workflows: ["sentry-hook@1"] },
];
const SCAN_ERROR = "The authenticated token is missing required scope: filesystem:read";
const treeFor = (rules: RuleId[], labels: string[], wantsLinear: boolean) =>
  JSON.stringify({
    conn: process.env.CONN ?? "up",
    lastUpdate: new Date(now).toISOString(),
    linear: { workspace: "acme", teams: ["SHOP"] },
    linearKey: process.env.LINEAR_KEY ?? "ok",
    settled: settledSignature(threads),
    projects: projectsFor(false, rules, labels, wantsLinear),
    runs: runItems(workflows, "http://127.0.0.1:3773", "demo-env"),
    workflows: launchList(workflows.workflows ?? [], process.env.WF_SCAN === "off" ? null : scanFields(DEFINITION)),
    workflowScan: process.env.WF_SCAN === "off" ? SCAN_ERROR : null,
    t3Origin: "http://127.0.0.1:3773",
  });

/** In-memory Local model config. `LOCAL` seeds it with that state; unset starts empty. */
const LOCAL_STATES: readonly LocalState[] = ["ok", "down", "missing"];
const localEnv = LOCAL_STATES.find((s) => s === process.env.LOCAL);
let localConfig: LocalConfig | null = localEnv
  ? { baseUrl: "http://localhost:11434/v1", model: "qwen3.5:4b-nvfp4" }
  : null;
const localAnswer = () => Response.json({ config: localConfig, state: localConfig ? (localEnv ?? "ok") : "unset" });

/** In-memory pick file, so the demo pick saves. */
let savedPick: { pick?: ModelPick | null; catchUp?: boolean } = {};
const pickAnswer = () => {
  const { pick = null, catchUp } = savedPick;
  return Response.json({ pick, catchUp: pick !== null && (catchUp ?? (pick !== "local" && pick !== "apple")) });
};

const listeners = new Set<(event: string, data: string) => void>();
const offered = () =>
  Promise.resolve([
    ...(process.env.CLIS === "0"
      ? []
      : [
          { id: "claude" as const, label: "Claude Haiku" },
          { id: "codex" as const, label: "Codex Luna" },
        ]),
    ...(process.env.APPLE === "ok" ? [{ id: "apple" as const, label: "Apple model" }] : []),
    ...(localConfig ? [{ id: "local" as const, label: `Local · ${localConfig.model}` }] : []),
  ]);

/**
 * Waits 1 s, then answers like the CLI. `SEND=failed` fails with the wrapper text. A workflow start fails when
 * its input holds "fail", and `WF_OLD=1` makes it fail like a CLI without the command.
 */
const stubCli: CliRun = async (argv) => {
  await Bun.sleep(1000);
  if (argv[1] === "workflow") {
    const input = argv.find((a) => a.startsWith("--input="))!;
    if (process.env.WF_OLD === "1")
      return { code: 1, stdout: "", stderr: 'Unknown command "workflow"\n', timedOut: false };
    if (input.includes("fail"))
      return {
        code: 1,
        stdout: "",
        stderr: `The payload does not fit workflow ${argv.at(-1)}: Expected a number, got "fail"\n`,
        timedOut: false,
      };
    return { code: 0, stdout: JSON.stringify({ run: { runId: `wr_${Date.now()}` } }), stderr: "", timedOut: false };
  }
  if (process.env.SEND === "failed")
    return { code: 1, stdout: "", stderr: "Sending the message.\nThread demo-1 is not reachable.\n", timedOut: false };
  const stdout = argv[2] === "send" ? '{"delivery":"queued"}' : '{"threadId":"demo-started"}';
  return { code: 0, stdout, stderr: "", timedOut: false };
};
const sender = sendService({
  cli: Promise.resolve({ available: process.env.T3CLI !== "0", path: cliPath() }),
  hasThread: (id) => threads.some((th) => th.id === id && !th.gone),
  hasProject: (id) => projects.has(id),
  projectList: () => projectChoices(projects, dirname(import.meta.dir)),
  run: stubCli,
});

/** Stub last messages by thread id. Other threads get one line from their title. The ids in `NO_MESSAGE` have none. */
const MESSAGES: Record<string, string> = {
  "demo-2":
    "The saved cards list works. One open point: should a new card become the default at once, or only when the user picks it?",
  "demo-15":
    "The retry queue needs a new table. I will run the migration next:\n\nbun run db:migrate --name retry_queue\n\nApprove the command to continue.",
  m2: "Dialog now uses the new tokens in `dialog.tsx`. Typecheck passes. I did not commit it yet.",
  "demo-7": [
    "PR #2095 is merged, and the review for **SHOP-401** is done.",
    "",
    "## What changed",
    "",
    "- `CheckoutSummary` now shows the tax line before the shipping line.",
    "- The coupon field trims spaces, so `SAVE10 ` and `SAVE10` give the same discount.",
    "- I added two tests in `checkout-summary.test.tsx`.",
    "",
    "## Checks",
    "",
    "| Check | Result |",
    "| --- | --- |",
    "| Typecheck | pass |",
    "| Unit tests | 214 pass |",
    "| E2E checkout | pass |",
    "",
    "One note: the old `formatTax` helper has no callers now. I left it in place:",
    "",
    "```ts",
    "export const formatTax = (n: number) => n.toFixed(2);",
    "```",
    "",
    "Nothing else is open. You can settle this thread.",
  ].join("\n"),
  "demo-21": "The retry policy change is ready. I need to run the load test script before I confirm the numbers.",
};
const NO_MESSAGE = new Set(["demo-5", "map", "demo-16", "launched"]);
const lastMessage = (id: string) =>
  NO_MESSAGE.has(id) ? null : (MESSAGES[id] ?? `I finished the work on "${byId(id).title}".`);

const byId = (id: string) => threads.find((th) => th.id === id)!;
const setPr = (id: string, n: number, over: Partial<Pr>) => {
  const th = byId(id);
  th.prs = th.prs.map((p) => (p.n === n ? { ...p, ...over } : p));
};
const touch = (id: string, over: Partial<Thread>) => Object.assign(byId(id), { updatedAt: ago(0) }, over);
const completedNow = () => ({ status: "completed", activityRunStatus: null, latestRunCompletedAt: ago(0) });
const runningNow = () => ({ status: "running", latestRunStartedAt: ago(0), activityRunStartedAt: ago(0) });

/** Each step changes threads the way a live push would. The last step undoes the others, so the loop repeats. */
const STEPS: (() => void)[] = [
  () => touch("m1", completedNow()),
  () => setPr("demo-1", 2101, { checks: "passing" }),
  () => touch("demo-18", runningNow()),
  () => (setPr("demo-1", 2101, { review: "approved" }), setPr("demo-4", 2107, { mergeability: null })),
  () => setPr("demo-24", 3004, { draft: null }),
  () => (setPr("demo-24", 3004, { state: "merged" }), setPr("demo-24", 3001, { state: "closed" })),
  () => (touch("demo-12", runningNow()), touch("m1", runningNow())),
  () => ((extra.createdAt = extra.updatedAt = ago(0)), threads.push(extra)),
  () => touch("demo-14", { settledAt: ago(0) }),
  () => touch("demo-14", { settledAt: null }),
  () => threads.splice(threads.indexOf(extra), 1),
  () => {
    setPr("demo-1", 2101, { checks: "pending", review: null });
    setPr("demo-4", 2107, { mergeability: "conflicting" });
    setPr("demo-24", 3004, { draft: true, state: "open" });
    setPr("demo-24", 3001, { state: "open" });
    touch("demo-18", { status: "queued", activityRunStatus: null });
    touch("demo-12", { status: "failed", activityRunStatus: null });
  },
];

const pushes = new Set<() => void>();
/** `PUSH=1` applies one fake live change every 3 s, in a loop, and pushes the new tree to each open stream. */
if (process.env.PUSH === "1") {
  let step = 0;
  setInterval(() => {
    STEPS[step++ % STEPS.length]();
    pushes.forEach((push) => push());
  }, 3000);
}

const server = Bun.serve({
  /** Above the 30 s CLI timeout, so a slow send still gets its 502 body. */
  idleTimeout: 40,
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4774),
  routes: {
    "/": index,
    "/up-next": upNext,
    "/models": { GET: async () => Response.json(await offered()) },
    "/local-model": async (req) => {
      if (req.method === "PUT") {
        const b = (await req.json().catch(() => null)) as Partial<LocalConfig> | null;
        if (!b?.baseUrl || !b.model) return new Response("Not a valid config", { status: 400 });
        localConfig = { baseUrl: b.baseUrl, model: b.model };
      }
      return localAnswer();
    },
    "/model-pick": async (req) => {
      if (req.method === "PUT") {
        const b = (await req.json().catch(() => null)) as typeof savedPick | null;
        if (!b) return new Response("Not valid settings", { status: 400 });
        savedPick = { ...savedPick, ...b };
      }
      return pickAnswer();
    },
    ...sender.routes,
    ...lastMessageRoutes({ read: lastMessage, has: (id) => threads.some((th) => th.id === id) }),
    ...findRoutes(() => projectsFor(true)),
    ...settleRoutes({
      hasThread: (id) => threads.some((th) => th.id === id && !th.gone),
      dispatch: async (c) => {
        const id = c.threadId as string;
        if (c.type === "thread.settle") touch(id, { settledAt: ago(0) });
        else if (c.type === "thread.unsettle") touch(id, { settledAt: null });
        else touch(id, { snoozedUntil: c.snoozedUntil as string });
        pushes.forEach((push) => push());
      },
    }),
    ...workflowRoutes({
      call: async (tag, payload) => {
        const { runId, name } = payload as { runId: string; name?: string };
        if (tag === "workflows.cancel" && process.env.CANCEL_SLOW === "1") await Bun.sleep(31_000);
        const run = workflows.runs.find((r) => r.runId === runId);
        if (tag === "workflows.answer")
          workflows.questions = workflows.questions.filter((q) => q.runId !== runId || q.name !== name);
        else if (run) run.status = tag === "workflows.resume" ? "running" : "cancelled";
        pushes.forEach((push) => push());
        if (tag === "workflows.cancel" && process.env.CANCEL_SLOW === "1") throw new Error("timed out");
      },
    }),
    ...settledRoutes({
      page: (after, limit) => settledPage(projectsFor(true), new Map(threads.map((th) => [th.id, th])), after, limit),
    }),
    "/events": async (req) => {
      server.timeout(req, 0);
      await Bun.sleep(Number(process.env.DELAY ?? 0));
      const params = new URL(req.url).searchParams;
      const rules = parseRules(params.get("rules"));
      const labels = parseLabels(params.get("labels") ?? "");
      const wantsLinear = params.get("linear") === "1";
      const enc = new TextEncoder();
      let send: (event: string, data: string) => void;
      const push = () => send("", treeFor(rules, labels, wantsLinear));
      return new Response(
        new ReadableStream({
          start(ctrl) {
            send = (event, data) => ctrl.enqueue(enc.encode(`${event ? `event: ${event}\n` : ""}data: ${data}\n\n`));
            listeners.add(send);
            pushes.add(push);
            push();
          },
          cancel() {
            listeners.delete(send);
            pushes.delete(push);
          },
        }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
      );
    },
  },
});
console.log(`demo tree on ${server.url}`);
