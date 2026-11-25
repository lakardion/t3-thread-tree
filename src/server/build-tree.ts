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
  type RunInfo,
  type RunStep,
  type Status,
  type ThreadNode,
} from "../shared/tree.ts";
import { waiting } from "./catch-up.ts";
import { mapName, mapsOf, markedKey } from "./maps.ts";
import { suggestedReplies } from "./replies.ts";
import type { Project, RunStepsRaw, RunsSnapshot, Thread } from "./t3.ts";

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
  /** The newest complete assistant text of threads. Unset: no node gets Suggested replies. */
  lastMessagesOf?: (ids: string[]) => Map<string, string | null>;
  /** The workflow runs snapshot. Unset: no run shows. */
  runs?: RunsSnapshot | null;
  /** The fetched steps of a run, in start order. */
  stepsOf?: (runId: string) => RunStepsRaw | undefined;
  /** The T3 web origin, for the run page link. */
  origin?: string;
  /** The map key of a thread, from its first message. Unset: no Map groups. */
  mapKeyOf?: (id: string) => string | null;
  /** The ids of marked map threads: their keyless children form a map group. */
  marked?: Set<string>;
};

/** `si` is the stack index of a child in a stack rail of a Map group. */
type Node = ThreadNode & { t: Thread; first: string; si?: number };
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
/** The `t3code://` link of a thread. */
export const hrefOf = (environmentId: string, id: string) =>
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
/** Time in ms, zero-padded so a string compare orders it, then the id. A bad date sorts first. */
const timeKey = (iso: string | null, id: string) => `${String(Date.parse(iso ?? "") || 0).padStart(16, "0")} ${id}`;
const creationKey = (t: Thread) => timeKey(t.createdAt, t.id);
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

const BUSY_THREAD: Status[] = ["working", "starting", "needs-input", "plan-ready"];
const BUSY_RUN = ["running", "waiting", "paused"];
const STEP_STATE = new Map<string, RunStep["state"]>([
  ["running", "now"],
  ["completed", "done"],
  ["failed", "failed"],
]);

/** The step line state of a child by its status. */
const lineState = (c: ThreadNode): RunStep["state"] =>
  c.status === "failed" ? "failed" : [...BUSY_THREAD, "waiting"].includes(c.status) ? "now" : "done";

/**
 * The root run nodes of the step threads. A run is a candidate when it has a step thread. It shows when it is active or a step
 * thread is busy. A candidate nests under its candidate parent run; a showing run with no showing ancestor is a root.
 * A root node carries its first step thread as `t`, which gives its project.
 */
function runNodes(steps: Node[], input: BuildInput): Node[] {
  const snap = new Map((input.runs?.runs ?? []).map((r) => [r.runId, r]));
  const asked = new Map((input.runs?.questions ?? []).toReversed().map((q) => [q.runId, q]));
  const byRun = new Map<string, Node[]>();
  for (const n of steps) {
    const id = n.t.workflowRun!.runId;
    byRun.set(id, [...(byRun.get(id) ?? []), n]);
  }
  const showing = (id: string) =>
    BUSY_RUN.includes(snap.get(id)?.status ?? "") || byRun.get(id)!.some((n) => BUSY_THREAD.includes(n.status));
  const parentOf = (id: string) => {
    const p = snap.get(id)?.parentRunId;
    return p && byRun.has(p) ? p : null;
  };
  const underShown = (id: string): boolean => {
    const p = parentOf(id);
    return p !== null && (showing(p) || underShown(p));
  };
  const projectLabel = (id: string) => input.projects.get(id)?.title ?? id;

  const built = new Map<string, Node>();
  const build = (runId: string): Node => {
    const done = built.get(runId);
    if (done) return done;
    const own = byRun.get(runId)!.toSorted(byFirst);
    const run = snap.get(runId);
    const q = run && asked.get(runId);
    const kids = [...snap.values()]
      .filter((r) => byRun.has(r.runId) && parentOf(r.runId) === runId)
      .map((r) => build(r.runId));
    for (const c of own) {
      c.step = c.t.workflowRun!.step;
      if (c.t.projectId !== own[0].t.projectId) c.t3Project = { id: c.t.projectId, label: projectLabel(c.t.projectId) };
    }
    for (const k of kids) k.step = snap.get(k.run!.runId)?.parentStep ?? "";
    const children = [...own, ...kids].toSorted(byFirst);

    const used = new Set<ThreadNode>();
    const lines: RunStep[] = (input.stepsOf?.(runId) ?? []).map((s) => {
      const c =
        children.find((x) => !used.has(x) && !x.run && x.id === s.threadId) ??
        children.find((x) => !used.has(x) && x.run && x.step === s.name);
      if (c) used.add(c);
      return { name: s.name, state: STEP_STATE.get(s.status) ?? "pending", child: c?.id ?? null };
    });
    for (const c of children) if (!used.has(c)) lines.push({ name: c.step ?? "", state: lineState(c), child: c.id });

    const active = lines.findLast((l) => l.state === "now" || l.state === "failed")?.name || q?.name;
    const say = (word: string) => (active ? `${word} · ${active}` : word);
    const [state, verdictOf] = ((): [RunInfo["state"], ReturnType<typeof verdict>] => {
      if (q) return ["asks", verdict("needs-input", say("asks you"), q.askedAt)];
      if (run?.status === "paused") return ["paused", verdict("needs-input", say("paused"), run.updatedAt)];
      if (run?.status === "running" || run?.status === "waiting")
        return ["running", verdict("working", say("running"))];
      return ["done", verdict("done", `done · ${lines.length} ${lines.length === 1 ? "step" : "steps"}`)];
    })();
    const title = run?.title ?? own[0].t.workflowRun!.workflow;
    const updatedAt =
      run?.updatedAt ??
      own
        .map((n) => n.updatedAt)
        .toSorted()
        .at(-1)!;
    const key = issueKey(title) ?? own[0].key;
    const id = `run:${runId}`;
    const node: Node = {
      t: own[0].t,
      id,
      href: `${input.origin ?? ""}/workflows?run=${encodeURIComponent(runId)}`,
      title,
      key,
      linear: (key && input.linearOf?.(key)) || null,
      ...verdictOf,
      raw: run?.status ?? "",
      updatedAt,
      lastRun: updatedAt,
      settled: false,
      input: false,
      snoozedUntil: null,
      stack: null,
      prs: [],
      detail: {
        request: null,
        error: null,
        limitResetAt: null,
        autoResume: false,
        stopRequested: false,
        model: null,
        planMode: false,
        branch: null,
        worktreePath: null,
        launchedBy: null,
        origin: null,
        startedBy: null,
        createdAt: null,
        goal: null,
        tags: [],
        pinned: false,
      },
      children,
      run: {
        runId,
        workflow: run?.workflow ?? own[0].t.workflowRun!.workflow,
        state,
        steps: lines,
        detail: run?.detail ?? null,
      },
      first: timeKey(run?.startedAt || own[0].t.createdAt, id),
    };
    built.set(runId, node);
    return node;
  };
  return [...byRun.keys()].filter((id) => showing(id) && !underShown(id)).map(build);
}

/** The visible threads as nodes, with their stacks and spawner lookups. Shared by both trees. */
function prepare(input: BuildInput) {
  const { spawnerOf, environmentId, settled, now } = input;
  const watched = new Set((input.labels ?? []).map((l) => l.toLowerCase()));
  const labelsFor = (t: Thread, p: Thread["prs"][number]): Label[] =>
    t.settledAt || watched.size === 0
      ? []
      : (input.labelsOf?.(p) ?? []).filter((l) => watched.has(l.name.toLowerCase()));
  const visible = new Map<string, Thread>();
  const stepThreads: Thread[] = [];
  const all = new Map<string, Thread>();
  for (const t of input.threads) {
    all.set(t.id, t);
    if (t.parentThreadId || t.sideChat || t.gone) continue;
    if (t.workflowRun) stepThreads.push(t);
    else if (settled || !t.settledAt) visible.set(t.id, t);
  }

  const stacks = computeStacks([...visible.values(), ...stepThreads]);
  const stackIdOf = new Map<string, number>();
  stacks.forEach((st, i) => st.threads.forEach((t) => stackIdOf.set(t.id, i)));

  const nodeOf = (t: Thread): Node => {
    const si = stackIdOf.get(t.id);
    const created = (t.prs.find((p) => p.source === "created") ?? t.prs.find((p) => p.source === "agent"))?.n;
    const st = si === undefined ? null : stacks[si];
    const pos = st && created !== undefined && st.order.includes(created) ? st.order.indexOf(created) + 1 : null;
    const key = issueKey(t.title);
    const catchUp = input.catchUpOf?.(t.id);
    return {
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
      detail: {
        ...detailOf(t, now, all),
        launchedBy: null,
        ...(input.marked?.has(t.id) && { mapMarked: true as const }),
      },
      children: [],
      ...(catchUp && { catchUp }),
      first: creationKey(t),
    };
  };
  const nodes = new Map<string, Node>();
  for (const t of visible.values()) nodes.set(t.id, nodeOf(t));

  if (input.lastMessagesOf) {
    const asks = waiting([...nodes.values()]).filter((n) => !(n.status === "needs-input" && n.phrase === "Approval"));
    const texts = input.lastMessagesOf(asks.map((n) => n.id));
    for (const n of asks) {
      const text = texts.get(n.id);
      if (text) n.suggestedReplies = suggestedReplies(text);
    }
  }

  for (const r of runNodes(stepThreads.map(nodeOf), input)) nodes.set(r.id, r);

  /** Map members and map threads: no thread nests under them by launch. */
  const claimed = new Set<string>();
  const visibleSpawner = (id: string): string | null => {
    const seen = new Set([id]);
    let c = spawnerOf(id);
    while (c && !seen.has(c)) {
      if (visible.has(c)) return claimed.has(c) ? null : c;
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

  /**
   * Rule 6.0. Each Map member, and each keyless stack mate of a member, leaves `nodes` and nests in its group, under its
   * nearest ancestor in the same map. A group hangs on its map thread, or on a Map header that `nodes` then holds.
   * Returns the nodes that left.
   */
  const groupMaps = (): Node[] => {
    const markedKeyOf = markedKey(input.mapKeyOf!, spawnerOf, input.marked ?? new Set());
    const maps = mapsOf({
      ids: [...visible.keys()],
      spawnerOf,
      keyOf: (id) => (all.get(id)?.workflowRun ? null : markedKeyOf(id)),
      createdKey: (id) => timeKey(all.get(id)?.createdAt ?? null, id),
    });
    const keyOf = new Map<string, string>();
    for (const id of visible.keys()) {
      const k = maps.mapOf(id);
      if (k) keyOf.set(id, k);
    }
    const members = new Set(keyOf.keys());
    const lowest = new Map<number, Node>();
    for (const n of [...members].map((id) => nodes.get(id)!).toSorted(byPos)) {
      const si = stackIdOf.get(n.id);
      if (si !== undefined && !lowest.has(si)) lowest.set(si, n);
    }
    const mates = new Map<string, Node>();
    for (const id of visible.keys()) {
      const n = nodes.get(id)!;
      const si = stackIdOf.get(id);
      const low = si === undefined ? undefined : lowest.get(si);
      if (low && !members.has(id) && !n.key && !isReview(n)) {
        keyOf.set(id, keyOf.get(low.id)!);
        mates.set(id, low);
      }
    }

    const shown = [...new Set(keyOf.values())];
    const anchored = (id: string) => (maps.anchors.get(id) ?? []).filter((k) => shown.includes(k));
    /** The node that holds the top level of each group. */
    const top = new Map<string, Node>();
    const placed: Node[] = [];
    const sub: { header: Node; of: string; parentKey: string }[] = [];
    const header = (key: string, id: string, t: Thread, mapThread: Thread | undefined): Node => {
      const alone = mapThread && anchored(mapThread.id).length === 1;
      const href = mapThread ? hrefOf(environmentId, mapThread.id) : null;
      const title = key.startsWith("thread:") ? (all.get(key.slice(7))?.title ?? null) : alone ? mapThread.title : null;
      const n: Node = {
        ...nodeOf(t),
        id,
        href: href ?? "",
        stack: null,
        lastRun: null,
        children: [],
        map: { name: mapName(key, title, shown), header: true, href },
      };
      top.set(key, n);
      return n;
    };
    for (const key of shown) {
      const mt = maps.threadOf.get(key);
      const mapThread = mt ? all.get(mt) : undefined;
      const head = mt ? nodes.get(mt) : undefined;
      if (head) {
        claimed.add(head.id);
        if (anchored(head.id).length === 1) {
          top.set(key, head);
          head.map = { name: mapName(key, head.title, shown), header: false, href: null };
        } else {
          head.map = { name: head.title, header: false, href: null };
          head.children.push(header(key, `map:${key}`, head.t, mapThread));
        }
        continue;
      }
      if (mapThread && !mapThread.workflowRun) {
        const h = header(key, anchored(mapThread.id).length === 1 ? mapThread.id : `map:${key}`, mapThread, mapThread);
        const parentKey = maps.mapOf(mapThread.id);
        if (parentKey && shown.includes(parentKey)) sub.push({ header: h, of: mapThread.id, parentKey });
        else placed.push(h);
        continue;
      }
      const oldest = [...members]
        .filter((id) => keyOf.get(id) === key)
        .map((id) => nodes.get(id)!)
        .toSorted(byFirst)[0];
      placed.push(header(key, `map:${key}`, oldest.t, undefined));
    }

    /** The nearest member of the map above `id`, skipping the head of another map and the stack mates of `id`. */
    const ancestorIn = (id: string, key: string) =>
      maps
        .ancestors(id)
        .find(
          (a) =>
            members.has(a) &&
            keyOf.get(a) === key &&
            anchored(a).length === 0 &&
            (stackIdOf.get(id) === undefined || stackIdOf.get(a) !== stackIdOf.get(id)),
        );
    const containerOf = (id: string, key: string) => {
      const a = ancestorIn(id, key);
      return a ? nodes.get(a)! : top.get(key)!;
    };
    const lists = new Set<Node>();
    const put = (n: Node, container: Node) => {
      container.children.push(n);
      lists.add(container);
    };
    for (const id of members) put(nodes.get(id)!, containerOf(id, keyOf.get(id)!));
    for (const [id, low] of mates) put(nodes.get(id)!, containerOf(low.id, keyOf.get(id)!));
    for (const s of sub) put(s.header, containerOf(s.of, s.parentKey));
    for (const c of lists) {
      const bySi = Map.groupBy(
        (c.children as Node[]).filter((n) => stackIdOf.has(n.id)),
        (n) => stackIdOf.get(n.id)!,
      );
      for (const [si, ns] of bySi)
        if (ns.length > 1)
          for (const n of ns) {
            n.si = si;
            n.rail = railOf(stacks[si]);
          }
    }

    const left = [...members, ...mates.keys()].map((id) => nodes.get(id)!);
    for (const n of left) {
      const top1 = top.get(keyOf.get(n.id)!)!;
      if (n.t.projectId !== top1.t.projectId)
        n.t3Project = { id: n.t.projectId, label: input.projects.get(n.t.projectId)?.title ?? n.t.projectId };
      markLaunched(n);
      claimed.add(n.id);
    }
    for (const n of left) nodes.delete(n.id);
    for (const h of placed) nodes.set(h.id, h);
    return left;
  };
  const grouped = input.mapKeyOf ? groupMaps() : [];

  return { visible, stacks, stackIdOf, nodes, grouped, visibleSpawner, markLaunched };
}

/** Stack mates in a stack, then creation. */
const byPos = (a: Node, b: Node) => (a.stack?.pos ?? Infinity) - (b.stack?.pos ?? Infinity) || byFirst(a, b);

/** The rail data of a stack. */
const railOf = (st: Stack | undefined): Branch["stack"] => {
  if (!st) return undefined;
  const prs = st.threads.flatMap((t) => t.prs);
  const base = prs.find((p) => st.set.has(p.n) && p.stackBase)?.stackBase ?? null;
  const number = prs.find((p) => st.set.has(p.n) && p.stackNumber)?.stackNumber;
  return { id: `s${st.order[0]}`, total: st.order.length, base, ...(number && { number }) };
};

/** The creation key of a node is the oldest of its own and its nested threads'. Sorts children on the way, with the stack mates of a Map group together. */
const settle = (n: Node): string => {
  const kids = n.children as Node[];
  for (const c of kids) n.first = [n.first, settle(c)].toSorted()[0]!;
  n.children = stackAdjacent(kids, new Map(kids.flatMap((c) => (c.si === undefined ? [] : [[c.id, c.si] as const]))));
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
    if (n.run) {
      addTo(t.projectId, isReview(n) ? REVIEWS : (n.key ?? NO_KEY), n);
      continue;
    }
    /** A stack outranks lineage: keyless mates share one group, so the stack keeps its rail. */
    const si = stackIdOf.get(n.id);
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
    const branches = ordered.map((g): Branch => {
      if (g.key !== REVIEWS) {
        /** "No issue key" gets no rail: it does not sit with its stack mates. Reviews takes the other return. */
        const stack = g.key === NO_KEY ? undefined : railOf(stacks[stackOf(g) ?? -1]);
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
        ...(project?.path && { path: project.path }),
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
  const { stacks, stackIdOf, nodes, grouped, visibleSpawner, markLaunched } = prepare(input);

  const byProject = new Map<string, { name: string; url: string; milestones: Map<string, Milestone> }>();
  const reviews: Node[] = [];
  const noProject: Node[] = [];
  const loose: Node[] = [];
  /** A stack stays whole where its lowest member with a key goes. */
  const placer = new Map<number, Node>();
  for (const n of [...nodes.values()].toSorted(byPos)) {
    const si = stackIdOf.get(n.id);
    if (si !== undefined && n.key && !isReview(n) && !placer.has(si)) placer.set(si, n);
  }
  for (const n of grouped)
    n.t3Project = { id: n.t.projectId, label: projects.get(n.t.projectId)?.title ?? n.t.projectId };
  for (const n of nodes.values()) {
    const { t } = n;
    n.t3Project = { id: t.projectId, label: projects.get(t.projectId)?.title ?? t.projectId };
    const si = n.run ? undefined : stackIdOf.get(n.id);
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
      const vs = nest && !n.run && !stackIdOf.has(n.id) ? visibleSpawner(t.id) : null;
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
  /** Splits placed nodes. Stack mates go in one key-group branch each, with the rail; the rest stay threads. */
  const holder = (ns: Node[], parentId: string): Pick<Branch, "branches" | "threads"> => {
    const keyed = new Map<string, Branch>();
    const threads: ThreadNode[] = [];
    for (const n of ns) {
      const si = stackIdOf.get(n.id);
      if (si === undefined) {
        threads.push(clean(n));
        continue;
      }
      const st = stacks[si];
      const key = n.key ?? `PR stack #${st.order[0]}`;
      const rail = railOf(st)!;
      const g = keyed.get(`${si}:${key}`) ?? {
        id: `${parentId}:${rail.id}:${key}`,
        label: key,
        stack: rail,
        branches: [],
        threads: [],
      };
      keyed.set(`${si}:${key}`, g);
      g.threads.push(clean(n));
    }
    return { branches: [...keyed.values()], threads };
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
            ...holder(m.nodes, m.id),
          })),
        } satisfies Branch,
      };
    })
    .toSorted(byFirst)
    .map((o) => o.branch);

  const fallback = (id: string, label: string, ns: Node[]): Branch[] =>
    ns.length ? [{ id, label, linear: {}, ...holder(place(ns), id) }] : [];
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

/** Strips the build-only fields before the node goes on the wire. Nested subthreads get no Suggested replies. */
const clean = ({ t: _t, first: _f, si: _si, children, ...n }: Node): ThreadNode => ({
  ...n,
  children: (children as Node[]).map(({ suggestedReplies: _s, ...c }) => clean(c as Node)),
});
