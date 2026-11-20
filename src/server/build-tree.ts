import { ago } from "../page/format.ts";
/** The tree rules: visibility, placement, stack order and status. Pure, so `bun test` covers it. */
import {
  LINEAR_LOOSE,
  LINEAR_REVIEWS,
  NO_KEY,
  NO_MILESTONE,
  NO_PROJECT,
  REVIEWS,
  type Branch,
  type CatchUp,
  type Detail,
  type Label,
  type LinearIssue,
  type PrNode,
  type Status,
  type ThreadNode,
} from "../shared/tree.ts";
import type { Project, Thread } from "./t3.ts";

/** Review threads sit in Reviews, whatever their key. */
const isReview = (t: { title: string }) => t.title.startsWith("Review #");
const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/;
const STACK_SOURCES = new Set(["created", "stack", "agent"]);

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
    if (t.interactionMode === "plan" && t.hasPlan) return verdict("plan-ready", "Plan ready", t.latestRunCompletedAt);
    const unseen =
      t.latestRunCompletedAt && (!t.lastVisitedAt || Date.parse(t.lastVisitedAt) < Date.parse(t.latestRunCompletedAt));
    return unseen ? verdict("your-turn", "Your turn", t.latestRunCompletedAt) : verdict("done", "Done");
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
  /** Launch nesting: a keyless thread nests under its visible spawner. */
  nest: boolean;
  now: number;
  /** Watched label names. Empty: no PR gets labels. */
  labels?: string[];
  labelsOf?: (p: Thread["prs"][number]) => Label[] | undefined;
  /** Linear data of an issue key. Unset: no node gets Linear data. */
  linearOf?: (key: string) => LinearIssue | undefined;
  /** The Catch-up of a thread. Unset: no node gets one. */
  catchUpOf?: (id: string) => CatchUp | undefined;
};

type Node = ThreadNode & { t: Thread; first: string };
type Group = { key: string; nodes: Node[]; first: string };
type Stack = { set: Set<number>; threads: Thread[]; order: number[] };

const stackPrs = (t: Thread) => t.prs.filter((p) => STACK_SOURCES.has(p.source) && p.state === "open").map((p) => p.n);
const CHECKS = ["passing", "failing", "pending"] as const;
const REVIEWS_STATE = ["approved", "changes-requested", "review-required"] as const;
const narrow = <T extends string>(v: string | null, set: readonly T[]): T | null => set.find((x) => x === v) ?? null;
const prNode = (p: Thread["prs"][number], labels: Label[]): PrNode => ({
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
  labels,
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
 * Stacks are connected sets of open stack PRs across threads. The order is the longest layer list
 * T3 reports. Without one, it comes from the thread with the longest list: its stack/agent PRs in
 * list order, with each of its own created PRs placed after the last lower number.
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
    const layers = st.threads
      .flatMap((t) => t.prs.map((p) => p.stackLayers ?? []))
      .reduce((a, b) => (b.length > a.length ? b : a), []);
    if (layers.length) {
      st.order = layers;
      continue;
    }
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

/** The later of two ISO times, or null when both are null. */
const newest = (a: string | null, b: string | null): string | null =>
  a && b ? (Date.parse(a) >= Date.parse(b) ? a : b) : (a ?? b);

/** The visible threads as nodes, with their stacks and spawner lookups. Shared by both trees. */
function prepare(input: BuildInput) {
  const { spawnerOf, environmentId, settled, now } = input;
  const watched = new Set((input.labels ?? []).map((l) => l.toLowerCase()));
  const labelsFor = (t: Thread, p: Thread["prs"][number]): Label[] =>
    t.settledAt || watched.size === 0
      ? []
      : (input.labelsOf?.(p) ?? []).filter((l) => watched.has(l.name.toLowerCase()));
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
    const created = (t.prs.find((p) => p.source === "created") ?? t.prs.find((p) => p.source === "agent"))?.n;
    const st = si === undefined ? null : stacks[si];
    const pos = st && created !== undefined && st.order.includes(created) ? st.order.indexOf(created) + 1 : null;
    const key = issueKey(t.title);
    const catchUp = input.catchUpOf?.(t.id);
    nodes.set(t.id, {
      t,
      id: t.id,
      href: hrefOf(environmentId, t.id),
      title: t.title,
      key,
      linear: (key && input.linearOf?.(key)) || null,
      ...statusOf(t, now),
      raw: t.pending ? `${t.status} · pending ${t.pending.kind ?? "request"}` : t.status,
      updatedAt: t.updatedAt,
      lastRun: newest(t.activityRunStartedAt, newest(t.latestRunStartedAt, t.latestRunCompletedAt)),
      settled: !!t.settledAt,
      input: t.pending?.blocking === false,
      snoozedUntil: t.snoozedUntil && Date.parse(t.snoozedUntil) > now ? t.snoozedUntil : null,
      stack: st ? { pos, total: st.order.length } : null,
      prs: t.prs
        .filter((p) => p.source !== "stack" && p.source !== "stack-dismissed")
        .map((p) => prNode(p, labelsFor(t, p))),
      detail: { ...detailOf(t, now, all), launchedBy: null },
      children: [],
      ...(catchUp && { catchUp }),
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

  /** Sets `launchedBy` unless the node nests under its spawner. */
  const markLaunched = (n: Node) => {
    const sp = spawnerOf(n.id);
    const spawner = sp ? all.get(sp) : undefined;
    if (spawner && !nodes.get(spawner.id)?.children.includes(n))
      n.detail.launchedBy = { title: spawner.title || spawner.id, href: hrefOf(environmentId, spawner.id) };
  };

  return { visible, stacks, stackIdOf, nodes, visibleSpawner, markLaunched };
}

/** The creation key of a node is the oldest of its own and its nested threads'. Sorts children on the way. */
const settle = (n: Node): string => {
  for (const c of n.children as Node[]) n.first = [n.first, settle(c)].toSorted()[0]!;
  (n.children as Node[]).sort(byFirst);
  return n.first;
};

export function buildTree(input: BuildInput): Branch[] {
  const { projects, nest } = input;
  const { visible, stacks, stackIdOf, nodes, visibleSpawner, markLaunched } = prepare(input);

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
    /** A stack outranks lineage: keyless mates share one group, so the stack keeps its rail. */
    const si = stackIdOf.get(t.id);
    const stackKey = si === undefined ? null : `PR stack #${stacks[si].order[0]}`;
    if (isReview(t)) addTo(t.projectId, REVIEWS, n);
    else if (n.key) addTo(t.projectId, n.key, n);
    else if (stackKey) addTo(t.projectId, stackKey, n);
    else {
      const vs = nest ? visibleSpawner(t.id) : null;
      if (vs && visible.get(vs)!.projectId === t.projectId) nodes.get(vs)!.children.push(n);
      else addTo(t.projectId, NO_KEY, n);
    }
    markLaunched(n);
  }

  const out: { branch: Branch; first: string }[] = [];
  for (const [projectId, gmap] of groups) {
    const gs = [...gmap.values()];
    for (const g of gs) {
      g.nodes.forEach(settle);
      /** Stack mates go in stack order; the group keeps the slot of its oldest thread. */
      g.first = g.nodes.toSorted(byFirst)[0].first;
      g.nodes.sort((a, b) => (a.stack?.pos ?? Infinity) - (b.stack?.pos ?? Infinity) || byFirst(a, b));
    }
    gs.sort(byFirst);
    /** Groups that share a stack sit together, in stack order, at the slot of the oldest member. */
    const stackOf = (g: Group) => g.nodes.map((n) => stackIdOf.get(n.id)).find((s) => s !== undefined);
    const minPos = (g: Group, si: number) =>
      Math.min(...g.nodes.filter((n) => stackIdOf.get(n.id) === si).map((n) => n.stack?.pos ?? Infinity));
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
    const rank = (g: Group) => (g.key === REVIEWS ? -1 : g.key === NO_KEY ? 1 : 0);
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
      return { id: gid(REVIEWS), label: REVIEWS, threads: [], branches: reviewGroups(g.nodes, gid(REVIEWS)) };
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

/** Nodes by creation. Stack mates follow the oldest of them, in stack order. */
const stackAdjacent = (nodes: Node[], stackIdOf: Map<string, number>): Node[] => {
  const sorted = nodes.toSorted(byFirst);
  const placed = new Set<Node>();
  return sorted.flatMap((n) => {
    if (placed.has(n)) return [];
    const si = stackIdOf.get(n.id);
    const mates =
      si === undefined
        ? [n]
        : sorted
            .filter((m) => stackIdOf.get(m.id) === si)
            .toSorted((a, b) => (a.stack?.pos ?? Infinity) - (b.stack?.pos ?? Infinity));
    mates.forEach((m) => placed.add(m));
    return mates;
  });
};

type Milestone = { id: string; label: string; date: string | null; none: boolean; nodes: Node[] };

/** Linear project, then milestone, then thread. Fallback groups follow the projects. */
export function buildLinearTree(input: BuildInput): Branch[] {
  const { projects, nest } = input;
  const { stackIdOf, nodes, visibleSpawner, markLaunched } = prepare(input);

  const byProject = new Map<string, { name: string; url: string; milestones: Map<string, Milestone> }>();
  const reviews: Node[] = [];
  const noProject: Node[] = [];
  const loose: Node[] = [];
  /** A stack stays whole where its lowest member with a key goes. */
  const placer = new Map<number, Node>();
  const byPos = (a: Node, b: Node) => (a.stack?.pos ?? Infinity) - (b.stack?.pos ?? Infinity) || byFirst(a, b);
  for (const n of [...nodes.values()].toSorted(byPos)) {
    const si = stackIdOf.get(n.id);
    if (si !== undefined && n.key && !isReview(n) && !placer.has(si)) placer.set(si, n);
  }
  for (const n of nodes.values()) {
    const { t } = n;
    n.t3Project = { id: t.projectId, label: projects.get(t.projectId)?.title ?? t.projectId };
    const si = stackIdOf.get(t.id);
    const by = si === undefined ? n : placer.get(si);
    const lp = by?.linear?.project;
    if (isReview(n)) reviews.push(n);
    else if (by?.key) {
      if (!lp) noProject.push(n);
      else {
        const p = byProject.get(lp.id) ?? { name: lp.name, url: lp.url, milestones: new Map() };
        byProject.set(lp.id, p);
        const m = by.linear?.milestone;
        const id = m ? `lm:${m.id}` : `lm:${lp.id}:none`;
        const entry = p.milestones.get(id) ?? {
          id,
          label: m?.name ?? NO_MILESTONE,
          date: m?.targetDate ?? null,
          none: !m,
          nodes: [],
        };
        p.milestones.set(id, entry);
        entry.nodes.push(n);
      }
    } else {
      const vs = nest && !stackIdOf.has(t.id) ? visibleSpawner(t.id) : null;
      const spawner = vs ? nodes.get(vs)! : null;
      if (spawner && !spawner.key && !isReview(spawner)) spawner.children.push(n);
      else loose.push(n);
    }
    markLaunched(n);
  }

  /** Settles nested threads, then orders the group. */
  const place = (ns: Node[]) => {
    ns.forEach(settle);
    return stackAdjacent(ns, stackIdOf);
  };
  const oldest = (ns: Node[]) => ns.toSorted(byFirst)[0].first;
  const rank = (m: Milestone) => (m.none ? 2 : m.date ? 0 : 1);

  for (const p of byProject.values()) for (const m of p.milestones.values()) m.nodes = place(m.nodes);

  const top = [...byProject]
    .map(([id, p]) => {
      const ms = [...p.milestones.values()];
      const first = (m: Milestone) => oldest(m.nodes);
      ms.sort(
        (a, b) => rank(a) - rank(b) || (a.date ?? "").localeCompare(b.date ?? "") || first(a).localeCompare(first(b)),
      );
      return {
        first: oldest(ms.flatMap((m) => m.nodes)),
        branch: {
          id: `lp:${id}`,
          label: p.name,
          linear: { url: p.url },
          threads: [],
          branches: ms.map((m): Branch => ({
            id: m.id,
            label: m.label,
            linear: { date: m.date },
            branches: [],
            threads: m.nodes.map(clean),
          })),
        } satisfies Branch,
      };
    })
    .toSorted(byFirst)
    .map((o) => o.branch);

  const fallback = (id: string, label: string, ns: Node[]): Branch[] =>
    ns.length ? [{ id, label, linear: {}, branches: [], threads: place(ns).map(clean) }] : [];
  const reviewBranch: Branch[] = reviews.length
    ? [
        {
          id: LINEAR_REVIEWS,
          label: REVIEWS,
          linear: {},
          threads: [],
          branches: reviewGroups(place(reviews), LINEAR_REVIEWS),
        },
      ]
    : [];
  return [...top, ...reviewBranch, ...fallback("lf:none", NO_PROJECT, noProject), ...fallback(LINEAR_LOOSE, "", loose)];
}

/** Review threads in one subgroup per issue key, in first-seen order. */
const reviewGroups = (nodes: Node[], id: string): Branch[] => {
  const byKey = new Map<string, Node[]>();
  for (const n of nodes) byKey.set(n.key ?? NO_KEY, [...(byKey.get(n.key ?? NO_KEY) ?? []), n]);
  return [...byKey].map(([k, ns]) => ({ id: `${id}:${k}`, label: k, branches: [], threads: ns.map(clean) }));
};

/** Strips the build-only fields before the node goes on the wire. */
const clean = ({ t: _t, first: _f, children, ...n }: Node): ThreadNode => ({
  ...n,
  children: (children as Node[]).map(clean),
});
