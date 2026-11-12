/** The tree rules: visibility, placement, stack order and status. Pure, so `bun test` covers it. */
import type { Branch, PrNode, Status, ThreadNode } from "../shared/tree.ts";
import type { Project, Thread } from "./t3.ts";

const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const STACK_SOURCES = new Set(["created", "stack", "agent"]);
export const NO_KEY = "No issue key";
export const REVIEWS = "Reviews";

export const issueKey = (title: string): string | null => title.match(KEY)?.[0] ?? null;

const REQUEST = new Map([
  ...["command", "file-read", "file-change", "permission", "dynamic_tool_call"].map((k) => [k, "Approval"] as const),
  ...["user_input", "mcp-elicitation"].map((k) => [k, "Question"] as const),
  ["auth_refresh", "Sign in"],
]);

/** The first matching rule wins; the order is the contract. */
export function statusOf(t: Thread, now: number): { status: Status; phrase: string; since: string | null } {
  const run = t.activityRunStatus ?? t.status;
  const out = (status: Status, phrase: string, since: string | null = null) => ({ status, phrase, since });
  const blocking = t.pending && t.pending.blocking !== false ? t.pending : null;
  if (blocking) return out("needs-input", REQUEST.get(blocking.kind ?? "") ?? "Input", blocking.createdAt);
  if ((t.guestMessages ?? 0) > 0) return out("needs-input", "Guest message");
  if (t.snoozedUntil && Date.parse(t.snoozedUntil) > now) return out("snoozed", "Snoozed");
  if (run === "running" || run === "waiting")
    return t.blockedOnThreadWait ? out("waiting", "Waiting") : out("working", "Working", t.activityRunStartedAt ?? t.latestRunStartedAt);
  if (run === "queued" || run === "preparing" || run === "starting") return out("starting", run === "queued" ? "Queued" : "Starting");
  if (run === "completed") {
    if (t.interactionMode === "plan" && t.hasPlan) return out("plan-ready", "Plan ready");
    const unseen = t.latestRunCompletedAt && (!t.lastVisitedAt || Date.parse(t.lastVisitedAt) < Date.parse(t.latestRunCompletedAt));
    return unseen ? out("your-turn", "Your turn") : out("done", "Done");
  }
  if (run === "failed") return out("failed", "Failed");
  if (run === "interrupted" || run === "cancelled" || run === "rolled_back")
    return out("interrupted", run === "cancelled" ? "Cancelled" : "Interrupted");
  return out("idle", "Idle");
}

export type BuildInput = {
  threads: Iterable<Thread>;
  projects: Map<string, Project>;
  spawnerOf: (id: string) => string | null | undefined;
  environmentId: string;
  settled: boolean;
  now: number;
};

type Node = ThreadNode & { t: Thread; latest: string };
type Group = { key: string; nodes: Node[]; latest: string };
type Stack = { set: Set<number>; threads: Thread[]; order: number[] };

const stackPrs = (t: Thread) => t.prs.filter((p) => STACK_SOURCES.has(p.source) && p.state === "open").map((p) => p.n);
const CHECKS = ["passing", "failing", "pending"] as const;
const REVIEWS_STATE = ["approved", "changes-requested", "review-required"] as const;
const narrow = <T extends string>(v: string | null, set: readonly T[]): T | null => set.find((x) => x === v) ?? null;
const prNode = (p: Thread["prs"][number]): PrNode => ({
  n: p.n,
  url: p.url,
  state: p.state,
  draft: p.draft === true,
  checks: narrow(p.checks, CHECKS),
  review: narrow(p.review, REVIEWS_STATE),
  conflicting: p.mergeability === "conflicting",
});
const byLatest = <T extends { latest: string }>(a: T, b: T) => b.latest.localeCompare(a.latest);

/**
 * Stacks are connected sets of open stack PRs across threads. The order comes from the thread with
 * the longest list: its stack/agent PRs in list order, with each of its own created PRs placed after
 * the last lower number.
 */
export function computeStacks(threads: Thread[]): Stack[] {
  const stacks: Stack[] = [];
  for (const t of threads) {
    const s = new Set(stackPrs(t));
    if (s.size < 2) continue;
    const hit = stacks.filter((st) => [...st.set].some((n) => s.has(n)));
    const merged: Stack = { set: s, threads: [t], order: [] };
    for (const h of hit) {
      stacks.splice(stacks.indexOf(h), 1);
      h.set.forEach((n) => s.add(n));
      merged.threads.push(...h.threads);
    }
    stacks.push(merged);
  }
  for (const st of stacks) {
    const best = st.threads.reduce((a, b) => (stackPrs(b).length > stackPrs(a).length ? b : a));
    const order = best.prs.filter((p) => (p.source === "stack" || p.source === "agent") && p.state === "open").map((p) => p.n);
    for (const p of best.prs.filter((p) => p.source === "created")) {
      let k = 0;
      order.forEach((x, j) => x < p.n && (k = j + 1));
      order.splice(k, 0, p.n);
    }
    st.order = order;
  }
  return stacks;
}

export function buildTree(input: BuildInput): Branch[] {
  const { projects, spawnerOf, environmentId, settled, now } = input;
  const visible = new Map<string, Thread>();
  for (const t of input.threads)
    if (!t.parentThreadId && !t.sideChat && !t.gone && (settled || !t.settledAt)) visible.set(t.id, t);

  const stacks = computeStacks([...visible.values()]);
  const stackIdOf = new Map<string, number>();
  stacks.forEach((st, i) => st.threads.forEach((t) => stackIdOf.set(t.id, i)));

  const nodes = new Map<string, Node>();
  for (const t of visible.values()) {
    const si = stackIdOf.get(t.id);
    const created = t.prs.find((p) => p.source === "created")?.n;
    const st = si === undefined ? null : stacks[si]!;
    const pos = st && created !== undefined && st.order.includes(created) ? st.order.indexOf(created) + 1 : null;
    nodes.set(t.id, {
      t,
      id: t.id,
      href: `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(t.id)}`,
      title: t.title,
      key: issueKey(t.title),
      ...statusOf(t, now),
      raw: t.pending ? `${t.status} · pending ${t.pending.kind ?? "request"}` : t.status,
      updatedAt: t.updatedAt,
      settled: !!t.settledAt,
      input: t.pending?.blocking === false,
      snoozedUntil: t.snoozedUntil && Date.parse(t.snoozedUntil) > now ? t.snoozedUntil : null,
      stack: st ? { pos, total: st.order.length } : null,
      prs: t.prs.filter((p) => p.source !== "stack" && p.source !== "stack-dismissed").map(prNode),
      children: [],
      latest: t.updatedAt,
    });
  }

  const visibleSpawner = (id: string): string | null => {
    const seen = new Set([id]);
    let c = spawnerOf(id);
    while (c && !seen.has(c)) {
      if (visible.has(c)) return c;
      seen.add(c);
      c = spawnerOf(c);
    }
    return null;
  };

  const groups = new Map<string, Map<string, Group>>();
  const addTo = (projectId: string, key: string, n: Node) => {
    const g = groups.get(projectId) ?? new Map<string, Group>();
    groups.set(projectId, g);
    const grp = g.get(key) ?? { key, nodes: [], latest: "" };
    g.set(key, grp);
    grp.nodes.push(n);
  };
  for (const n of nodes.values()) {
    const { t } = n;
    if (t.title.startsWith("Review #")) addTo(t.projectId, REVIEWS, n);
    else if (n.key) addTo(t.projectId, n.key, n);
    else {
      const vs = visibleSpawner(t.id);
      if (vs && visible.get(vs)!.projectId === t.projectId) nodes.get(vs)!.children.push(n);
      else addTo(t.projectId, NO_KEY, n);
    }
  }

  /** The latest update of a node includes its nested threads. Sorts children on the way. */
  const settle = (n: Node): string => {
    for (const c of n.children as Node[]) n.latest = [n.latest, settle(c)].sort().at(-1)!;
    (n.children as Node[]).sort(byLatest);
    return n.latest;
  };

  const out: { branch: Branch; latest: string }[] = [];
  for (const [projectId, gmap] of groups) {
    const gs = [...gmap.values()];
    for (const g of gs) {
      g.nodes.forEach(settle);
      g.nodes.sort(byLatest);
      g.latest = g.nodes[0]!.latest;
    }
    gs.sort(byLatest);
    /** Groups that share a stack sit together, in stack order, at the slot of the newest member. */
    const stackOf = (g: Group) => g.nodes.map((n) => stackIdOf.get(n.id)).find((s) => s !== undefined);
    const minPos = (g: Group, si: number) =>
      Math.min(...g.nodes.filter((n) => stackIdOf.get(n.id) === si).map((n) => n.stack?.pos ?? 0));
    const placed = new Set<Group>();
    const ordered: Group[] = [];
    for (const g of gs) {
      if (placed.has(g)) continue;
      const si = stackOf(g);
      const mates =
        si === undefined
          ? [g]
          : gs.filter((h) => h.nodes.some((n) => stackIdOf.get(n.id) === si)).sort((a, b) => minPos(a, si) - minPos(b, si));
      for (const h of mates) if (!placed.has(h)) placed.add(h), ordered.push(h);
    }
    const rank = (g: Group) => (g.key === REVIEWS ? 1 : g.key === NO_KEY ? 2 : 0);
    ordered.sort((a, b) => rank(a) - rank(b));

    const gid = (key: string) => `g:${projectId}:${key}`;
    const branches = ordered.map((g): Branch => {
      if (g.key !== REVIEWS) return { id: gid(g.key), label: g.key, branches: [], threads: g.nodes.map(clean) };
      const byKey = new Map<string, Node[]>();
      for (const n of g.nodes) byKey.set(n.key ?? NO_KEY, [...(byKey.get(n.key ?? NO_KEY) ?? []), n]);
      return {
        id: gid(REVIEWS),
        label: REVIEWS,
        threads: [],
        branches: [...byKey].map(([k, ns]) => ({ id: `${gid(REVIEWS)}:${k}`, label: k, branches: [], threads: ns.map(clean) })),
      };
    });
    const project = projects.get(projectId);
    out.push({
      branch: { id: `p:${projectId}`, label: project?.title ?? projectId, ...(project?.repo && { repo: project.repo }), branches, threads: [] },
      latest: gs[0]!.latest,
    });
  }
  return out.sort(byLatest).map((o) => o.branch);
}

/** Strips the build-only fields before the node goes on the wire. */
const clean = ({ t: _t, latest: _l, children, ...n }: Node): ThreadNode => ({ ...n, children: (children as Node[]).map(clean) });
