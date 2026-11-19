/** Serves the page with made-up threads, run through the real tree rules. No T3 needed. */
import index from "../src/page/index.html";
import upNext from "../src/page/up-next.html";
import { briefInput, briefService, lastMessageRoutes, type Outcome } from "../src/server/brief.ts";
import { buildLinearTree, buildTree } from "../src/server/build-tree.ts";
import { findRoutes } from "../src/server/find.ts";
import { cliPath, type CliRun, sendService } from "../src/server/send.ts";
import { settledPage, settledRoutes, settledSignature } from "../src/server/settled.ts";
import type { Pr, Project, Thread } from "../src/server/t3.ts";
import type { BriefAction, LocalConfig, LocalState, ModelPick } from "../src/shared/brief.ts";
import { parseLabels, type LinearIssue } from "../src/shared/tree.ts";

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
  source,
  state,
  draft: null,
  checks: null,
  review: null,
  mergeability: null,
  stackBase: null,
  stackLayers: null,
  title: null,
  additions: null,
  deletions: null,
  changedFiles: null,
  ...over,
});
const stacked = (own: number, over: Partial<Pr> = {}) => [
  pr(own, "created", "open", { stackBase: "main", ...over }),
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
  t("Review #2088 SHOP-398", { prs: [pr(2088, "agent")] }),
  t("Review #2093 SHOP-401", { status: "running", prs: [pr(2093, "agent")] }),
  t("Review #2095 SHOP-401", { prs: [pr(2095, "agent", "merged")] }),
  t("Design-system migration map", { id: "map", status: "idle" }),
  t("Migrate Button to the new tokens", { id: "m1", status: "running" }),
  t("Migrate Dialog to the new tokens", { id: "m2", ...completed }),
  t("Migrate Tooltip to the new tokens", { id: "m3", snoozedUntil: later(20) }),
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
  t("DOC-12 · Getting-started guide for the CLI", { projectId: "docs", ...completed }),
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
const spawners: Record<string, string> = {
  m1: "map",
  m2: "map",
  m3: "map",
  launched: "map",
  "cache-1": "dispatch",
  "cache-2": "cache-1",
  "cache-3": "cache-2",
  "search-plan": "search",
  "search-r": "search",
  "search-w": "search-plan",
  "search-b": "search-plan",
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

const projectsFor = (settled: boolean, nest = false, labels: string[] = [], wantsLinear = false) =>
  (wantsLinear ? buildLinearTree : buildTree)({
    threads,
    projects,
    spawnerOf: (id) => spawners[id],
    environmentId: "demo",
    settled,
    nest,
    now,
    labels,
    labelsOf: (p) => LABELS[p.n],
    linearOf: wantsLinear ? (key) => LINEAR[key] : undefined,
  });
const treeFor = (nest: boolean, labels: string[], wantsLinear: boolean) =>
  JSON.stringify({
    conn: process.env.CONN ?? "up",
    lastUpdate: new Date(now).toISOString(),
    linear: { workspace: "acme", teams: ["SHOP"] },
    linearKey: process.env.LINEAR_KEY ?? "ok",
    settled: settledSignature(threads),
    projects: projectsFor(false, nest, labels, wantsLinear),
  });

/** The model part of the sample brief. Code makes the `answer`, `fix` and `merge` actions from the tree, so these threads have none of them. `demo-27` is settled, so its heading shows struck through. */
const SAMPLE: BriefAction[] = [
  {
    kind: "unblock",
    title: "Resume the flaky cart badge test",
    reason: "The thread failed on a rate limit and the e2e fix waits.",
    threadIds: ["demo-12"],
    prompt: "Resume the work and fix the flaky cart badge count test.",
  },
  {
    kind: "review",
    title: "Mark the Apple Pay draft ready",
    reason: "The agent finished its turn 2 hours ago and the PR is still a draft.",
    threadIds: ["demo-3"],
    prompt: "Mark PR #2104 ready for review and request a reviewer.",
  },
  {
    kind: "clean-up",
    title: "Settle the finished docs threads",
    reason: "The getting-started guide is done and the tutorial archive is settled.",
    threadIds: ["demo-17", "demo-27"],
    prompt: "Settle the getting-started guide and the tutorial archive threads.",
  },
];
const titles = Object.fromEntries(threads.map((th) => [th.id, th.title]));

/** Stub runner: `BRIEF=failed|empty|rules` picks the outcome, `CLIS=0` offers no CLI. */
function stubRun(cli: ModelPick): { done: Promise<Outcome | null>; cancel: () => void } {
  const outcome = (): Outcome =>
    process.env.BRIEF === "failed"
      ? {
          status: "failed",
          cli,
          error: "Overloaded",
          stderrTail: "Error: API Error: 529 overloaded_error\nclaude exited with code 1",
          actions: [],
          titles: {},
        }
      : {
          status: "done",
          cli,
          generatedAt: new Date().toISOString(),
          actions: process.env.BRIEF === "empty" ? [] : SAMPLE,
          titles,
        };
  let cancel!: () => void;
  const done = new Promise<Outcome | null>((resolve) => {
    const timer = setTimeout(() => resolve(outcome()), 2500);
    cancel = () => (clearTimeout(timer), resolve(null));
  });
  return { done, cancel };
}

/** In-memory Local model config. `LOCAL` seeds it with that state; unset starts empty. */
const LOCAL_STATES: readonly LocalState[] = ["ok", "down", "missing"];
const localEnv = LOCAL_STATES.find((s) => s === process.env.LOCAL);
let localConfig: LocalConfig | null = localEnv
  ? { baseUrl: "http://localhost:11434/v1", model: "qwen3.5:4b-nvfp4" }
  : null;
const localAnswer = () => Response.json({ config: localConfig, state: localConfig ? (localEnv ?? "ok") : "unset" });

const listeners = new Set<(event: string, data: string) => void>();
const brief = briefService({
  offered: () =>
    Promise.resolve([
      ...(process.env.CLIS === "0"
        ? []
        : [
            { id: "claude" as const, label: "Claude Haiku" },
            { id: "codex" as const, label: "Codex Luna" },
          ]),
      ...(localConfig ? [{ id: "local" as const, label: `Local · ${localConfig.model}` }] : []),
    ]),
  input: () => {
    const i = briefInput(projectsFor(false), () => new Map(), now);
    return process.env.BRIEF === "rules" ? { ...i, threads: [] } : i;
  },
  onChange: () => listeners.forEach((l) => l("brief", JSON.stringify(brief.state()))),
  run: stubRun,
});

/** Waits 1 s, then answers like the CLI. `SEND=failed` fails with the wrapper text. */
const stubCli: CliRun = async (argv) => {
  await Bun.sleep(1000);
  if (process.env.SEND === "failed")
    return { code: 1, stdout: "", stderr: "Sending the message.\nThread demo-1 is not reachable.\n", timedOut: false };
  const stdout = argv[2] === "send" ? '{"delivery":"queued"}' : '{"threadId":"demo-started"}';
  return { code: 0, stdout, stderr: "", timedOut: false };
};
const sender = sendService({
  cli: Promise.resolve({ available: process.env.T3CLI !== "0", path: cliPath() }),
  hasThread: (id) => threads.some((th) => th.id === id && !th.gone),
  hasProject: (id) => projects.has(id),
  run: stubCli,
});

/** Stub last messages by thread id. Other threads get one line from their title. The ids in `NO_MESSAGE` have none. */
const MESSAGES: Record<string, string> = {
  "demo-2":
    "The saved cards list works. One open point: should a new card become the default at once, or only when the user picks it?",
  "demo-15":
    "The retry queue needs a new table. I will run the migration next:\n\nbun run db:migrate --name retry_queue\n\nApprove the command to continue.",
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
    ...brief.routes,
    "/local-model": async (req) => {
      if (req.method === "PUT") {
        const b = (await req.json().catch(() => null)) as Partial<LocalConfig> | null;
        if (!b?.baseUrl || !b.model) return new Response("Not a valid config", { status: 400 });
        localConfig = { baseUrl: b.baseUrl, model: b.model };
      }
      return localAnswer();
    },
    ...sender.routes,
    ...lastMessageRoutes({ read: lastMessage, has: (id) => threads.some((th) => th.id === id) }),
    ...findRoutes(() => projectsFor(true, false)),
    ...settledRoutes({
      page: (after, limit) => settledPage(projectsFor(true), new Map(threads.map((th) => [th.id, th])), after, limit),
    }),
    "/events": async (req) => {
      server.timeout(req, 0);
      await Bun.sleep(Number(process.env.DELAY ?? 0));
      const params = new URL(req.url).searchParams;
      const nest = params.get("nest") === "1";
      const labels = parseLabels(params.get("labels") ?? "");
      const wantsLinear = params.get("linear") === "1";
      const enc = new TextEncoder();
      let send: (event: string, data: string) => void;
      const push = () => send("", treeFor(nest, labels, wantsLinear));
      return new Response(
        new ReadableStream({
          start(ctrl) {
            send = (event, data) => ctrl.enqueue(enc.encode(`${event ? `event: ${event}\n` : ""}data: ${data}\n\n`));
            listeners.add(send);
            pushes.add(push);
            push();
            send("brief", JSON.stringify(brief.state()));
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
