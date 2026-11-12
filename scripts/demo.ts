/** Serves the page with made-up threads, run through the real tree rules. No T3 needed. */
import index from "../src/page/index.html";
import { buildTree } from "../src/server/build-tree.ts";
import type { Pr, Project, Thread } from "../src/server/t3.ts";

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

/** A four-PR stack spread over four issue keys. */
const STACK = [2101, 2102, 2104, 2107];
const pr = (n: number, source: string, state = "open", over: Partial<Pr> = {}): Pr => ({
  n,
  url: gh(n),
  source,
  state,
  draft: null,
  checks: null,
  review: null,
  mergeability: null,
  stackBase: null,
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
  t("SHOP-412 · Checkout: split the payment step into its own route", { status: "running", activityRunStartedAt: ago(9), model: "claude-opus-4-7", branch: "shop-412-payment-route", worktreePath: "~/.t3/worktrees/storefront/shop-412", createdBy: "agent", creationSource: "mcp", prs: stacked(2101, { checks: "pending", title: "Split the payment step", additions: 212, deletions: 40, changedFiles: 9 }) }),
  t("SHOP-413 · Saved cards list with default selection", { pending: request("user_input"), status: "running", stopRequested: true, model: "claude-sonnet-5-5", prs: stacked(2102, { checks: "passing", review: "approved" }) }),
  t("SHOP-415 · Apple Pay button behind a feature flag", { ...completed, lastVisitedAt: ago(5), prs: stacked(2104, { draft: true }) }),
  t("SHOP-418 · Order summary sidebar in the new design", { status: "interrupted", forkedFromThreadId: "demo-1", prs: stacked(2107, { checks: "failing", review: "changes-requested", mergeability: "conflicting" }) }),
  t("Review #2088 SHOP-398", { prs: [pr(2088, "agent")] }),
  t("Review #2093 SHOP-401", { status: "running", prs: [pr(2093, "agent")] }),
  t("Review #2095 SHOP-401", { prs: [pr(2095, "agent", "merged")] }),
  t("Design-system migration map", { id: "map", status: "idle" }),
  t("Migrate Button to the new tokens", { id: "m1", status: "running" }),
  t("Migrate Dialog to the new tokens", { id: "m2", ...completed }),
  t("Migrate Tooltip to the new tokens", { id: "m3", snoozedUntil: later(20) }),
  t("Flaky e2e: cart badge count", { status: "failed", lastErrorClass: "provider", lastErrorCode: "rate_limited", lastError: "The provider closed the stream before the run finished.", limitResetAt: later(2), autoResume: true, tags: ["flaky", "e2e"], pinned: true }),
  t("API-77 · Rate-limit the search endpoint per API key", { projectId: "api", status: "running" }),
  t("API-77 · Document the rate-limit headers", { projectId: "api" }),
  t("API-81 · Move webhook retries to a durable queue", { projectId: "api", pending: request("command") }),
  t("Investigate slow cold starts", { projectId: "api", goal: { objective: "Cut cold start below 400 ms", status: "active" }, linkLabel: "Linear", snoozedUntil: later(14), status: "idle" }),
  t("DOC-12 · Getting-started guide for the CLI", { projectId: "docs", ...completed }),
  t("API-90 · Queue the nightly export job", { projectId: "api", status: "queued" }),
  t("API-91 · Fan out the reindex across shards", { projectId: "api", status: "running", blockedOnThreadWait: true }),
  t("API-92 · Draft the pagination plan", { projectId: "api", ...completed, interactionMode: "plan", hasPlan: true, model: "claude-opus-4-7", delegatedFromTitle: "API-77 · Rate-limit the search endpoint per API key" }),
  t("API-93 · Confirm the retry policy", { projectId: "api", status: "running", pending: request("command", false) }),
  t("DOC-14 · Review the changelog wording", { projectId: "docs", guestMessages: 1 }),
  t("Fix broken anchors after the sidebar change", { projectId: "docs", status: "cancelled" }),
  t("DOC-15 · Link the four release PRs", {
    projectId: "docs",
    ...completed,
    prs: [
      pr(3001, "linked", "open", { checks: "passing", review: "approved", title: "Bump to 4.2", additions: 12, deletions: 3, changedFiles: 2 }),
      pr(3002, "linked", "merged", { title: "Changelog entry", additions: 40, deletions: 0, changedFiles: 1 }),
      pr(3003, "linked", "closed", { title: "Try the old layout", additions: 5, deletions: 90, changedFiles: 6 }),
      pr(3004, "linked", "open", { draft: true, title: "Docs for 4.2", additions: 300, deletions: 12, changedFiles: 14 }),
    ],
  }),
  t("API-94 · Approve the schema change, then sleep", {
    projectId: "api",
    status: "running",
    pending: request("command"),
    snoozedUntil: later(30),
  }),
  t("Rewrite the install page", { id: "launched", projectId: "docs" }),
  t("DOC-16 · Archive the old tutorial", { projectId: "docs", settledAt: ago(60) }),
];
const spawners: Record<string, string> = { m1: "map", m2: "map", m3: "map", launched: "map" };
const projects = new Map<string, Project>([
  ["storefront", { title: "storefront", repo: "acme/storefront" }],
  ["api", { title: "api-gateway", repo: "acme/api-gateway" }],
  ["docs", { title: "docs-site", repo: null }],
]);

const treeFor = (settled: boolean) =>
  JSON.stringify({
    conn: process.env.CONN ?? "up",
    lastUpdate: new Date(now).toISOString(),
    projects: buildTree({ threads, projects, spawnerOf: (id) => spawners[id], environmentId: "demo", settled, now }),
  });
const trees = { open: treeFor(false), settled: treeFor(true) };

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4774),
  routes: {
    "/": index,
    "/events": async (req) => {
      await Bun.sleep(Number(process.env.DELAY ?? 0));
      const tree = new URL(req.url).searchParams.get("settled") === "1" ? trees.settled : trees.open;
      return new Response(`data: ${tree}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    },
  },
});
console.log(`demo tree on ${server.url}`);
