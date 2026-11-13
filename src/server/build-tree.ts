import { ago } from "../page/format.ts";
/** The tree rules: visibility, placement, stack order and status. Pure, so `bun test` covers it. */
import type { Branch, Detail, PrNode, Status, ThreadNode } from "../shared/tree.ts";
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

const verdict = (status: Status, phrase: string, since: string | null = null) => ({ status, phrase, since });

/** The first matching rule wins; the order is the contract. */
export function statusOf(t: Thread, now: number): { status: Status; phrase: string; since: string | null } {
  const run = t.activityRunStatus ?? t.status;
  const blocking = t.pending && t.pending.blocking !== false ? t.pending : null;
  if (blocking) return verdict("needs-input", REQUEST.get(blocking.kind ?? "") ?? "Input", blocking.createdAt);
  if ((t.guestMessages ?? 0) > 0) return verdict("needs-input", "Guest message");
  if (t.snoozedUntil && Date.parse(t.snoozedUntil) > now) return verdict("snoozed", "Snoozed");
  if (run === "running" || run === "waiting")
    return t.blockedOnThreadWait
      ? verdict("waiting", "Waiting")
      : verdict("working", "Working", t.activityRunStartedAt ?? t.latestRunStartedAt);
  if (run === "queued" || run === "preparing" || run === "starting")
    return verdict("starting", run === "queued" ? "Queued" : "Starting");
  if (run === "completed") {
    if (t.interactionMode === "plan" && t.hasPlan) return verdict("plan-ready", "Plan ready");
    const unseen =
      t.latestRunCompletedAt && (!t.lastVisitedAt || Date.parse(t.lastVisitedAt) < Date.parse(t.latestRunCompletedAt));
    return unseen ? verdict("your-turn", "Your turn") : verdict("done", "Done");
  }
  if (run === "failed") return verdict("failed", "Failed");
  if (run === "interrupted" || run === "cancelled" || run === "rolled_back")
    return verdict("interrupted", run === "cancelled" ? "Cancelled" : "Interrupted");
  return verdict("idle", "Idle");
}

export type BuildInput = {
  threads: Iterable<Thread>;
  projects: Map<string, Project>;
  spawnerOf: (id: string) => string | null | undefined;
  environmentId: string;
  settled: boolean;
  now: number;
};

type Node = ThreadNode & { t: Thread; first: string };
type Group = { key: string; nodes: Node[]; first: string };
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
  title: p.title,
  additions: p.additions,
  deletions: p.deletions,
  changedFiles: p.changedFiles,
});
const hrefOf = (environmentId: string, id: string) =>
  `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(id)}`;

/** The details of a thread, without the spawner link, which needs the placement. */
export function detailOf(t: Thread, now: number, all: Map<string, Thread>): Omit<Detail, "launchedBy"> {
  const fork = t.forkedFromThreadId && all.get(t.forkedFromThreadId);
  const startedBy = [t.createdBy, t.creationSource].filter((x) => x !== null).join(" via ");
  return {
    request: t.pending
      ? `${t.pending.kind ?? "request"}${t.pending.createdAt ? ` · ${ago(t.pending.createdAt, now)}` : ""}`
      : null,
    error:
      t.lastError === null && t.lastErrorClass === null && t.lastErrorCode === null
        ? null
        : { class: t.lastErrorClass, code: t.lastErrorCode, text: t.lastError },
    limitResetAt: t.limitResetAt,
    autoResume: t.autoResume,
    stopRequested: t.stopRequested,
    model: t.model,
    planMode: t.interactionMode === "plan",
    branch: t.branch,
    worktreePath: t.worktreePath,
    origin: fork
      ? `Fork of ${fork.title || fork.id}`
      : t.delegatedFromTitle !== null
        ? `Delegated from ${t.delegatedFromTitle}`
        : t.linkLabel !== null
          ? `via ${t.linkLabel}`
          : null,
    startedBy: startedBy || null,
    createdAt: t.createdAt,
    goal: t.goal,
    tags: t.tags,
    pinned: t.pinned,
  };
}
/** Creation time in ms, zero-padded so a string compare orders it, then the id. A bad date sorts first. */
const creationKey = (t: Thread) => `${String(Date.parse(t.createdAt ?? "") || 0).padStart(16, "0")} ${t.id}`;
const byFirst = <T extends { first: string }>(a: T, b: T) => a.first.localeCompare(b.first);

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
    const order = best.prs
      .filter((p) => (p.source === "stack" || p.source === "agent") && p.state === "open")
      .map((p) => p.n);
    for (const p of best.prs.filter((x) => x.source === "created")) {
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
  const all = new Map<string, Thread>();
  for (const t of input.threads) {
    all.set(t.id, t);
    if (!t.parentThreadId && !t.sideChat && !t.gone && (settled || !t.settledAt)) visible.set(t.id, t);
  }

  const stacks = computeStacks([...visible.values()]);
  const stackIdOf = new Map<string, number>();
  stacks.forEach((st, i) => st.threads.forEach((t) => stackIdOf.set(t.id, i)));

  const nodes = new Map<string, Node>();
  for (const t of visible.values()) {
    const si = stackIdOf.get(t.id);
    const created = t.prs.find((p) => p.source === "created")?.n;
    const st = si === undefined ? null : stacks[si];
    const pos = st && created !== undefined && st.order.includes(created) ? st.order.indexOf(created) + 1 : null;
    nodes.set(t.id, {
      t,
      id: t.id,
      href: hrefOf(environmentId, t.id),
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
      detail: { ...detailOf(t, now, all), launchedBy: null },
      children: [],
      first: creationKey(t),
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
    const grp = g.get(key) ?? { key, nodes: [], first: "" };
    g.set(key, grp);
    grp.nodes.push(n);
  };
  for (const n of nodes.values()) {
    const { t } = n;
    const sp = spawnerOf(t.id);
    const spawner = sp ? all.get(sp) : undefined;
    if (t.title.startsWith("Review #")) addTo(t.projectId, REVIEWS, n);
    else if (n.key) addTo(t.projectId, n.key, n);
    else {
      const vs = visibleSpawner(t.id);
      if (vs && visible.get(vs)!.projectId === t.projectId) nodes.get(vs)!.children.push(n);
      else addTo(t.projectId, NO_KEY, n);
    }
    if (spawner && !nodes.get(spawner.id)?.children.includes(n))
      n.detail.launchedBy = { title: spawner.title || spawner.id, href: hrefOf(environmentId, spawner.id) };
  }

  /** The creation key of a node is the oldest of its own and its nested threads'. Sorts children on the way. */
  const settle = (n: Node): string => {
    for (const c of n.children as Node[]) n.first = [n.first, settle(c)].toSorted()[0]!;
    (n.children as Node[]).sort(byFirst);
    return n.first;
  };

  const out: { branch: Branch; first: string }[] = [];
  for (const [projectId, gmap] of groups) {
    const gs = [...gmap.values()];
    for (const g of gs) {
      g.nodes.forEach(settle);
      g.nodes.sort(byFirst);
      g.first = g.nodes[0].first;
    }
    gs.sort(byFirst);
    /** Groups that share a stack sit together, in stack order, at the slot of the oldest member. */
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
          : gs
              .filter((h) => h.nodes.some((n) => stackIdOf.get(n.id) === si))
              .toSorted((a, b) => minPos(a, si) - minPos(b, si));
      for (const h of mates)
        if (!placed.has(h)) {
          placed.add(h);
          ordered.push(h);
        }
    }
    const rank = (g: Group) => (g.key === REVIEWS ? 1 : g.key === NO_KEY ? 2 : 0);
    ordered.sort((a, b) => rank(a) - rank(b));

    const gid = (key: string) => `g:${projectId}:${key}`;
    /** The stack of a group, for the rail. A group with threads in two stacks takes the first one, as the order does. */
    const railOf = (g: Group): Branch["stack"] => {
      const st = stacks[stackOf(g) ?? -1];
      if (!st) return undefined;
      const base = st.threads.flatMap((t) => t.prs).find((p) => st.set.has(p.n) && p.stackBase)?.stackBase ?? null;
      return { id: `s${st.order[0]}`, total: st.order.length, base };
    };
    const branches = ordered.map((g): Branch => {
      if (g.key !== REVIEWS) {
        /** "No issue key" gets no rail: it does not sit with its stack mates. Reviews takes the other return. */
        const stack = g.key === NO_KEY ? undefined : railOf(g);
        return { id: gid(g.key), label: g.key, ...(stack && { stack }), branches: [], threads: g.nodes.map(clean) };
      }
      const byKey = new Map<string, Node[]>();
      for (const n of g.nodes) byKey.set(n.key ?? NO_KEY, [...(byKey.get(n.key ?? NO_KEY) ?? []), n]);
      return {
        id: gid(REVIEWS),
        label: REVIEWS,
        threads: [],
        branches: [...byKey].map(([k, ns]) => ({
          id: `${gid(REVIEWS)}:${k}`,
          label: k,
          branches: [],
          threads: ns.map(clean),
        })),
      };
    });
    const project = projects.get(projectId);
    out.push({
      branch: {
        id: `p:${projectId}`,
        label: project?.title ?? projectId,
        ...(project?.repo && { repo: project.repo }),
        branches,
        threads: [],
      },
      first: gs[0].first,
    });
  }
  return out.toSorted(byFirst).map((o) => o.branch);
}

/** Strips the build-only fields before the node goes on the wire. */
const clean = ({ t: _t, first: _f, children, ...n }: Node): ThreadNode => ({
  ...n,
  children: (children as Node[]).map(clean),
});
