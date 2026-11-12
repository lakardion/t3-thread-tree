/** Serves the page with made-up threads, run through the real tree rules. No T3 needed. */
import index from "../src/page/index.html";
import { buildTree } from "../src/server/build-tree.ts";
import type { Thread } from "../src/server/t3.ts";

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
    needsInput: false,
    pendingKind: null,
    settledAt: null,
    snoozedUntil: null,
    updatedAt: ago(seq * 7),
    gone: false,
    prs: [],
    ...over,
  };
}

/** A four-PR stack spread over four issue keys. */
const STACK = [2101, 2102, 2104, 2107];
const stacked = (own: number) => [
  { n: own, url: gh(own), source: "created", state: "open" },
  ...STACK.filter((n) => n !== own).map((n) => ({ n, url: gh(n), source: "stack", state: "open" })),
];

const threads: Thread[] = [
  t("SHOP-412 · Checkout: split the payment step into its own route", { status: "running", prs: stacked(2101) }),
  t("SHOP-413 · Saved cards list with default selection", { needsInput: true, pendingKind: "user_input", status: "running", prs: stacked(2102) }),
  t("SHOP-415 · Apple Pay button behind a feature flag", { prs: stacked(2104) }),
  t("SHOP-418 · Order summary sidebar in the new design", { status: "interrupted", prs: stacked(2107) }),
  t("Review #2088 SHOP-398", { prs: [{ n: 2088, url: gh(2088), source: "agent", state: "open" }] }),
  t("Review #2093 SHOP-401", { status: "running", prs: [{ n: 2093, url: gh(2093), source: "agent", state: "open" }] }),
  t("Review #2095 SHOP-401", { prs: [{ n: 2095, url: gh(2095), source: "agent", state: "merged" }] }),
  t("Design-system migration map", { id: "map", status: "idle" }),
  t("Migrate Button to the new tokens", { id: "m1", status: "running" }),
  t("Migrate Dialog to the new tokens", { id: "m2" }),
  t("Migrate Tooltip to the new tokens", { id: "m3", snoozedUntil: later(20) }),
  t("Flaky e2e: cart badge count", { status: "failed" }),
  t("API-77 · Rate-limit the search endpoint per API key", { projectId: "api", status: "running" }),
  t("API-81 · Move webhook retries to a durable queue", { projectId: "api", needsInput: true, pendingKind: "approval" }),
  t("Investigate slow cold starts", { projectId: "api", snoozedUntil: later(14), status: "idle" }),
  t("DOC-12 · Getting-started guide for the CLI", { projectId: "docs" }),
  t("Fix broken anchors after the sidebar change", { projectId: "docs", status: "cancelled" }),
];
const spawners: Record<string, string> = { m1: "map", m2: "map", m3: "map" };
const projects = new Map([
  ["storefront", "storefront"],
  ["api", "api-gateway"],
  ["docs", "docs-site"],
]);

const tree = JSON.stringify({
  conn: "up",
  lastUpdate: new Date(now).toISOString(),
  projects: buildTree({ threads, projects, spawnerOf: (id) => spawners[id], environmentId: "demo", settled: false, now }),
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4774),
  routes: {
    "/": index,
    "/events": () => new Response(`data: ${tree}\n\n`, { headers: { "Content-Type": "text/event-stream" } }),
  },
});
console.log(`demo tree on ${server.url}`);
