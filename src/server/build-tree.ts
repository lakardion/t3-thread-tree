import { ago } from "../page/format.ts";
import { RULES, type RuleId } from "../shared/rules.ts";
/** The tree rules: visibility, placement, stack order and status. Pure, so `bun test` covers it. */
import {
  isReviewTitle,
  LINEAR_LOOSE,
  LINEAR_REVIEWS,
  NO_MILESTONE,
  NO_PROJECT,
  REVIEWS,
  type Group,
  type GroupKind,
  type CatchUp,
  type Detail,
  type Label,
  type LinearIssue,
  type MapInfo,
  type PrNode,
  type RunInfo,
  type RunStep,
  type Status,
  type ThreadNode,
} from "../shared/tree.ts";
import { catchUpThreads } from "./catch-up.ts";
import { mapName, mapsOf } from "./maps.ts";
import { suggestedReplies } from "./replies.ts";
import {
  decodeThread,
  narrowChecks,
  narrowReview,
  type Pr,
  type Project,
  type RunStepsRaw,
  type RunsSnapshot,
  type Thread,
} from "./t3.ts";

/** Review threads sit in Reviews, whatever their key. */
const isReview = (t: { title: string }) => isReviewTitle(t.title);
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
      ? verdict("blocked", "Waiting")
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
  /** The map key of a thread, from its first message. Unset: no map labels. */
  mapKeyOf?: (id: string) => string | null;
  /** The T3 thread table row of an id, archived and deleted rows included. Unset: only the threads in `threads` are known. */
  rowOf?: (id: string) => { title: string; projectId: string; createdAt: string } | null;
};

/** `si` is the stack index of a child in a stack rail of a Lineage group. */
type Node = ThreadNode & { t: Thread; first: string; si?: number; slot?: number };
type KeyGroup = { key: string; nodes: Node[]; first: string; kind: GroupKind };
/** `order` holds the open PRs, which get numbers. `slots` adds merged PRs at their place in the stack. */
type Stack = { set: Set<number>; threads: Thread[]; order: number[]; slots: number[] };

const stackPrs = (t: Thread) => t.prs.filter((p) => STACK_SOURCES.has(p.source) && p.state === "open").map((p) => p.n);
/** The open stack PRs of a thread and every PR in the stack slots of its stack PRs, merged ones too. */
const stackMembers = (t: Thread) =>
  new Set([
    ...stackPrs(t),
    ...t.prs.filter((p) => STACK_SOURCES.has(p.source) && p.state !== "closed").flatMap((p) => p.stackSlots ?? []),
  ]);
export const prNode = (p: Thread["prs"][number], labels: Label[]): PrNode => {
  const pos = p.stackSlots?.indexOf(p.n) ?? -1;
  return {
    repository: p.repository,
    n: p.n,
    url: p.url,
    state: p.state,
    draft: p.draft === true,
    checks: narrowChecks(p.checks),
    review: narrowReview(p.review),
    conflicting: p.mergeability === "conflicting",
    title: p.title,
    head: p.head,
    base: p.base,
    stack:
      p.stackNumber !== null && pos >= 0 ? { number: p.stackNumber, pos: pos + 1, total: p.stackSlots!.length } : null,
    additions: p.additions,
    deletions: p.deletions,
    changedFiles: p.changedFiles,
    labels,
  };
};
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
const syncedMs = (p: Pr) => Date.parse(p.syncedAt) || 0;
const creationKey = (t: Thread) => timeKey(t.createdAt, t.id);
const byFirst = <T extends { first: string }>(a: T, b: T) => a.first.localeCompare(b.first);

/**
 * Stacks are connected sets of stack PRs across threads: the open ones and the merged ones in the T3 slots. The order is the layer list T3
 * synced last (a tie goes to the longest). Without one, it comes from the thread with the longest
 * list: its stack/agent PRs in list order, with each of its own created PRs placed after the last
 * lower number.
 */
export function computeStacks(threads: Thread[]): Stack[] {
  const stacks: Stack[] = [];
  for (const t of threads) {
    const s = stackMembers(t);
    if (s.size < 2) continue;
    const hit = stacks.filter((st) => [...st.set].some((n) => s.has(n)));
    const merged: Stack = { set: s, threads: [t], order: [], slots: [] };
    for (const h of hit) {
      stacks.splice(stacks.indexOf(h), 1);
      h.set.forEach((n) => s.add(n));
      merged.threads.push(...h.threads);
    }
    stacks.push(merged);
  }
  for (const st of stacks) {
    const prs = st.threads.flatMap((t) => t.prs);
    const withLayers = prs.filter((p) => p.stackLayers?.length);
    /** With no open layer, the slots still give the stack order. */
    const latest = (withLayers.length ? withLayers : prs.filter((p) => p.stackSlots?.length)).reduce<Pr | null>(
      (a, b) =>
        !a ||
        syncedMs(b) > syncedMs(a) ||
        (syncedMs(b) === syncedMs(a) && (b.stackLayers?.length ?? 0) > (a.stackLayers?.length ?? 0))
          ? b
          : a,
      null,
    );
    st.order = latest?.stackLayers ?? fallbackOrder(st);
    st.slots = [...(latest?.stackSlots ?? st.order)];
    /** A thread's own PR that the layers lack, such as a merged one, goes after the last lower number. */
    for (const n of st.threads.flatMap(ownPr)) placeByNumber(st.slots, n);
  }
  return stacks;
}

/** The order from the thread with the longest list, when T3 has no layers. */
const fallbackOrder = (st: Stack): number[] => {
  const best = st.threads.reduce((a, b) => (stackPrs(b).length > stackPrs(a).length ? b : a));
  const order = best.prs
    .filter((p) => (p.source === "stack" || p.source === "agent") && p.state === "open")
    .map((p) => p.n);
  for (const p of best.prs.filter((x) => x.source === "created" && x.state === "open")) placeByNumber(order, p.n);
  return order;
};

/** The PR a thread opened: its created PR, else its agent-linked one. */
const ownPr = (t: Thread): number[] => {
  const n = (t.prs.find((p) => p.source === "created") ?? t.prs.find((p) => p.source === "agent"))?.n;
  return n === undefined ? [] : [n];
};

/** Puts `n` after the last lower number, unless the list has it. */
const placeByNumber = (list: number[], n: number) => {
  if (list.includes(n)) return;
  let k = 0;
  list.forEach((x, j) => x < n && (k = j + 1));
  list.splice(k, 0, n);
};

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
  c.status === "failed" ? "failed" : [...BUSY_THREAD, "blocked"].includes(c.status) ? "now" : "done";

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
      review: false,
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
    const created = ownPr(t)[0];
    const st = si === undefined ? null : stacks[si];
    const pos = st && created !== undefined && st.order.includes(created) ? st.order.indexOf(created) + 1 : null;
    const slot = st && created !== undefined ? st.slots.indexOf(created) : -1;
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
      review: isReview(t),
      input: t.pending?.blocking === false,
      snoozedUntil: t.snoozedUntil && Date.parse(t.snoozedUntil) > now ? t.snoozedUntil : null,
      stack: st ? { pos, total: st.order.length } : null,
      ...(slot >= 0 && { slot }),
      prs: t.prs
        .filter((p) => p.source !== "stack" && p.source !== "stack-dismissed")
        .map((p) => prNode(p, labelsFor(t, p))),
      detail: {
        ...detailOf(t, now, all),
        launchedBy: null,
      },
      children: [],
      ...(catchUp && { catchUp }),
      first: creationKey(t),
    };
  };
  const nodes = new Map<string, Node>();
  for (const t of visible.values()) nodes.set(t.id, nodeOf(t));

  if (input.lastMessagesOf) {
    const asks = catchUpThreads([...nodes.values()]).filter(
      (n) => !(n.status === "needs-input" && n.phrase === "Approval"),
    );
    const texts = input.lastMessagesOf(asks.map((n) => n.id));
    for (const n of asks) {
      const text = texts.get(n.id);
      if (text) n.suggestedReplies = suggestedReplies(text);
    }
  }

  for (const r of runNodes(stepThreads.map(nodeOf), input)) nodes.set(r.id, r);

  const created = (id: string) => timeKey(all.get(id)?.createdAt ?? input.rowOf?.(id)?.createdAt ?? null, id);

  /** The thread of an id on a spawner chain: a live thread, else a stand-in from its table row. */
  const threadFor = (id: string): Thread => {
    const row = input.rowOf?.(id);
    return (
      all.get(id) ?? decodeThread({ id, title: row?.title, projectId: row?.projectId, createdAt: row?.createdAt })!
    );
  };
  /** A header node: the row of a thread without PRs, stack or status line. */
  const headerOf = (t: Thread, id: string, href: string, first = creationKey(t)): Node => ({
    ...nodeOf(t),
    id,
    href,
    first,
    stack: null,
    lastRun: null,
    prs: [],
    children: [],
  });

  /**
   * Rule 6.0. Claims each member of a Lineage group, and the stack mates of a member, under the nearest visible
   * ancestor or anchor, else under the head. The head is the root, or a Lineage header that the later rules place.
   * Returns the claims, the new headers and the head marks.
   */
  const groupLineage = (): Ruled => {
    const claims = new Map<Node, Claim>();
    const marks = new Map<Node, MapInfo>();
    const added: Node[] = [];
    const maps = mapsOf({
      ids: [...visible.keys()],
      spawnerOf,
      known: (id) => all.has(id) || !!input.rowOf?.(id),
      isStep: (id) => !!all.get(id)?.workflowRun,
      keyOf: input.mapKeyOf ?? (() => null),
      createdKey: created,
      stacks: stacks.map((st) =>
        st.threads
          .filter((t) => visible.has(t.id))
          .map((t) => nodes.get(t.id)!)
          .toSorted(byPos)
          .map((n) => n.id),
      ),
      issueKeyOf: (id) => !!issueKey(threadFor(id).title),
    });
    const allKeys = [...new Set([...maps.groups.values()].flat().map(maps.mapOf))].filter((k) => k !== null);

    for (const [root, ms] of maps.groups) {
      const members = new Set(ms);
      const shown = new Set(ms.map(maps.mapOf));
      const own = maps.mapOf(root);
      const head = nodes.get(root) ?? headerOf(threadFor(root), root, hrefOf(environmentId, root));
      if (!visible.has(root)) added.push(head);

      /** The shown map labels of an anchor, the oldest map first. */
      const labelsOf = (a: string) =>
        [...(maps.anchors.get(a) ?? []), ...(a === root && own ? [own] : [])]
          .filter((k) => shown.has(k))
          .toSorted((x, y) => ms.findIndex((m) => maps.mapOf(m) === x) - ms.findIndex((m) => maps.mapOf(m) === y));
      const anchors = new Map([[root, head]]);
      for (const a of maps.anchors.keys())
        if (a !== root && maps.rootOf(a) === root && labelsOf(a).length)
          anchors.set(a, nodes.get(a) ?? headerOf(threadFor(a), a, hrefOf(environmentId, a)));

      /** The Map headers under an anchor that anchors several labels, by key. */
      const subs = new Map<string, Map<string, Node>>();
      for (const [a, n] of anchors) {
        const ls = labelsOf(a);
        const header = !visible.has(a);
        const href = header ? hrefOf(environmentId, a) : null;
        if (ls.length === 1) {
          const title = maps.threadOf(root, ls[0]) === a ? n.title : null;
          marks.set(n, { name: mapName(ls[0], title, allKeys), header, href, key: ls[0] });
          continue;
        }
        marks.set(n, { name: n.title, header, href });
        for (const k of ls) {
          const mapHref = maps.threadOf(root, k) === a ? hrefOf(environmentId, a) : null;
          const h = headerOf(n.t, `map:${k}`, mapHref ?? "", created(ms.find((m) => maps.mapOf(m) === k)!));
          h.map = { name: mapName(k, null, allKeys), header: true, href: mapHref, key: k };
          subs.set(a, (subs.get(a) ?? new Map()).set(k, h));
          claims.set(h, { under: n, top: head });
        }
      }

      /** The nearest member or anchor above `id`, skipping the stack mates of `id`; the Map header of its map when it has one. */
      const holderOf = (id: string): Node => {
        const si = stackIdOf.get(id);
        const above = maps
          .ancestors(id)
          .find(
            (x) => x !== root && (members.has(x) || anchors.has(x)) && (si === undefined || stackIdOf.get(x) !== si),
          );
        const holder = above ?? root;
        return subs.get(holder)?.get(maps.mapOf(id) ?? "") ?? anchors.get(holder) ?? nodes.get(holder)!;
      };
      for (const [a, n] of anchors) if (a !== root && !visible.has(a)) claims.set(n, { under: holderOf(a), top: head });

      /** The members of a stack go to the holder of the topmost one: fewest ancestors, then oldest. */
      const topOf = new Map<number, string>();
      for (const id of ms) {
        const si = stackIdOf.get(id);
        if (si !== undefined && (!topOf.has(si) || maps.ancestors(id).length < maps.ancestors(topOf.get(si)!).length))
          topOf.set(si, id);
      }
      const stackHolder = new Map([...topOf].map(([si, id]) => [si, holderOf(id)]));
      const put = (id: string) => {
        const si = stackIdOf.get(id);
        claims.set(nodes.get(id)!, { under: (si !== undefined && stackHolder.get(si)) || holderOf(id), top: head });
      };
      ms.forEach(put);
      for (const [id, r] of maps.mates) if (r === root) put(id);
    }
    return { claims, added, marks };
  };

  return { stacks, stackIdOf, nodes, all, groupLineage };
}

/** Stack mates in a stack, then creation. */
const bySlot = (a: Node, b: Node) => (a.slot ?? Infinity) - (b.slot ?? Infinity);
const byPos = (a: Node, b: Node) => bySlot(a, b) || byFirst(a, b);

/** The bottom open PR of a stack, else its first slot. */
const bottomPr = (st: Stack) => st.order[0] ?? st.slots[0];

/** The rail data of a stack. */
const railOf = (st: Stack | undefined): Group["stack"] => {
  if (!st) return undefined;
  const prs = st.threads.flatMap((t) => t.prs);
  const base = prs.find((p) => st.set.has(p.n) && p.stackBase)?.stackBase ?? null;
  const number = prs.find((p) => st.set.has(p.n) && p.stackNumber)?.stackNumber;
  return { id: `s${bottomPr(st)}`, total: st.order.length, base, ...(number && { number }) };
};

/** The creation key of a node is the oldest of its own and its nested threads'. Sorts children on the way, with the stack mates of a Lineage group together. */
const settle = (n: Node): string => {
  const kids = n.children as Node[];
  for (const c of kids) n.first = [n.first, settle(c)].toSorted()[0]!;
  n.children = stackAdjacent(kids, new Map(kids.flatMap((c) => (c.si === undefined ? [] : [[c.id, c.si] as const]))));
  return n.first;
};

/** Where a rule puts a node. `by`: the node whose key gives the group. `top`: the head of a map group. */
type Claim =
  | { into: "review" | "loose" }
  | { into: "key"; by: Node }
  | { into: "stack"; si: number }
  | { under: Node; top?: Node };
type Ruled = { claims: Map<Node, Claim>; added?: Node[]; marks?: Map<Node, MapInfo> };
export type Layout = "project" | "linear";
type Facts = ReturnType<typeof prepare> & { input: BuildInput; layout: Layout; rules: RuleId[] };
type Rule = (pool: Node[], f: Facts) => Ruled;

const claiming = (pool: Node[], pick: (n: Node) => Claim | null): Ruled => ({
  claims: new Map(
    pool.flatMap((n) => {
      const c = pick(n);
      return c ? [[n, c] as const] : [];
    }),
  ),
});

const CHAIN: Record<RuleId, Rule> = {
  lineage: (_pool, f) => f.groupLineage(),
  review: (pool) => claiming(pool, (n) => (isReview(n) ? { into: "review" } : null)),
  stack: (pool, f) => {
    const siOf = (n: Node) => (n.run ? undefined : f.stackIdOf.get(n.id));
    if (f.layout === "project")
      return claiming(pool, (n) => {
        const si = siOf(n);
        return si !== undefined && (!n.key || !f.rules.includes("key")) ? { into: "stack", si } : null;
      });
    /** A stack stays whole where its lowest member with a key goes. With Issue key off, no group is a key group. */
    const placer = new Map<number, Node>();
    for (const n of f.rules.includes("key") ? pool.toSorted(byPos) : []) {
      const si = siOf(n);
      if (si !== undefined && n.key && !isReview(n) && !placer.has(si)) placer.set(si, n);
    }
    return claiming(pool, (n) => {
      const si = siOf(n);
      if (si === undefined) return null;
      const by = placer.get(si);
      return by ? { into: "key", by } : { into: "loose" };
    });
  },
  key: (pool) => claiming(pool, (n) => (n.key ? { into: "key", by: n } : null)),
};

/** The default chain. */
export const defaultRules = (): RuleId[] => RULES.filter((r) => r.on).map((r) => r.id);

/** The rule list of a `rules` stream parameter. No parameter: the default chain. Unknown and repeated ids drop; `lineage` goes first. */
export function parseRules(raw: string | null): RuleId[] {
  if (raw === null) return defaultRules();
  const ids = RULES.map((r) => r.id);
  const given = [...new Set(raw.split(","))].filter((id): id is RuleId => ids.includes(id as RuleId));
  return [...given.filter((id) => id === "lineage"), ...given.filter((id) => id !== "lineage")];
}

/** Runs the rules on the pool in order, then lays the claims out as groups. */
export function place(input: BuildInput, rules: RuleId[], layout: Layout): Group[] {
  const f: Facts = { ...prepare(input), input, layout, rules };
  const pool = new Set(f.nodes.values());
  const entered = new Set(pool);
  const claims = new Map<Node, Claim>();
  /** The rows of map claims, with the children each one got from the map rule. */
  const mapRows = new Map<Node, Node[]>();
  for (const id of rules) {
    const ruled = CHAIN[id]([...pool], f);
    for (const [head, m] of ruled.marks ?? []) head.map = m;
    for (const [n, c] of ruled.claims) {
      if (entered.has(n) && !pool.has(n)) continue;
      claims.set(n, c);
      pool.delete(n);
      if (!("under" in c)) continue;
      c.under.children.push(n);
      if (id === "lineage") mapRows.set(c.under, [...(mapRows.get(c.under) ?? []), n]);
    }
    for (const n of ruled.added ?? []) {
      pool.add(n);
      entered.add(n);
    }
  }
  for (const n of pool) claims.set(n, { into: "loose" });

  for (const kids of mapRows.values()) {
    const bySi = Map.groupBy(
      kids.filter((n) => f.stackIdOf.has(n.id)),
      (n) => f.stackIdOf.get(n.id)!,
    );
    for (const [si, ns] of bySi)
      if (ns.length > 1)
        for (const n of ns) {
          n.si = si;
          n.rail = railOf(f.stacks[si]);
        }
  }
  /** Includes the Map headers, which are claimed but never enter the pool. */
  for (const [n, c] of claims) {
    const top = "under" in c ? c.top : undefined;
    if (top && n.t.projectId !== top.t.projectId)
      n.t3Project = { id: n.t.projectId, label: input.projects.get(n.t.projectId)?.title ?? n.t.projectId };
  }
  for (const n of entered) {
    const c = claims.get(n)!;
    const sp = input.spawnerOf(n.id);
    const spawner = sp ? f.all.get(sp) : undefined;
    if (spawner && !("under" in c && c.under.t.id === spawner.id))
      n.detail.launchedBy = { title: spawner.title || spawner.id, href: hrefOf(input.environmentId, spawner.id) };
  }
  return LAYOUTS[layout](entered, claims, f);
}

export const buildTree = (input: BuildInput, rules: RuleId[]) => place(input, rules, "project");
export const buildLinearTree = (input: BuildInput, rules: RuleId[]) => place(input, rules, "linear");

type LayoutFn = (entered: Set<Node>, claims: Map<Node, Claim>, f: Facts) => Group[];
const LAYOUTS: Record<Layout, LayoutFn> = { project: projectLayout, linear: linearLayout };

function projectLayout(entered: Set<Node>, claims: Map<Node, Claim>, f: Facts): Group[] {
  const { projects } = f.input;
  const { stacks, stackIdOf } = f;

  const groups = new Map<string, Map<string, KeyGroup>>();
  const looseOf = new Map<string, Node[]>();
  const addTo = (projectId: string, key: string, kind: GroupKind, n: Node) => {
    const g = groups.get(projectId) ?? new Map<string, KeyGroup>();
    groups.set(projectId, g);
    const grp = g.get(key) ?? { key, nodes: [], first: "", kind };
    g.set(key, grp);
    grp.nodes.push(n);
  };
  for (const n of entered) {
    const c = claims.get(n)!;
    if ("under" in c) continue;
    const pid = n.t.projectId;
    if (c.into === "review") addTo(pid, REVIEWS, "review", n);
    else if (c.into === "key") addTo(pid, c.by.key!, "key", n);
    else if (c.into === "stack") addTo(pid, `PR stack #${bottomPr(stacks[c.si])}`, "stack", n);
    else looseOf.set(pid, [...(looseOf.get(pid) ?? []), n]);
  }

  const out: { branch: Group; first: string }[] = [];
  for (const projectId of new Set([...groups.keys(), ...looseOf.keys()])) {
    const gs = [...(groups.get(projectId)?.values() ?? [])];
    const loose = looseOf.get(projectId) ?? [];
    loose.forEach(settle);
    loose.sort(byFirst);
    for (const g of gs) {
      g.nodes.forEach(settle);
      /** Stack mates go in stack order; the group keeps the slot of its oldest thread. */
      g.first = g.nodes.toSorted(byFirst)[0].first;
      g.nodes.sort(byPos);
    }
    gs.sort(byFirst);
    /** Groups that share a stack sit together, in stack order, at the slot of the oldest member. */
    const stackOf = (g: KeyGroup) =>
      g.kind === "review" ? undefined : g.nodes.map((n) => stackIdOf.get(n.id)).find((s) => s !== undefined);
    const minPos = (g: KeyGroup, si: number) =>
      Math.min(...g.nodes.filter((n) => stackIdOf.get(n.id) === si).map((n) => n.slot ?? Infinity));
    const placed = new Set<KeyGroup>();
    const ordered: KeyGroup[] = [];
    for (const g of gs) {
      if (placed.has(g)) continue;
      const si = stackOf(g);
      const mates =
        si === undefined
          ? [g]
          : gs
              .filter((h) => h.kind !== "review" && h.nodes.some((n) => stackIdOf.get(n.id) === si))
              .toSorted((a, b) => minPos(a, si) - minPos(b, si));
      for (const h of mates)
        if (!placed.has(h)) {
          placed.add(h);
          ordered.push(h);
        }
    }

    const gid = (key: string) => `g:${projectId}:${key}`;
    const keyGroups = ordered.map((g): Group => {
      if (g.key !== REVIEWS) {
        const stack = railOf(stacks[stackOf(g) ?? -1]);
        return {
          id: gid(g.key),
          label: g.key,
          kind: g.kind,
          ...(stack && { stack }),
          groups: [],
          threads: g.nodes.map(clean),
        };
      }
      return {
        id: gid(REVIEWS),
        label: REVIEWS,
        kind: "review",
        ...reviewGroups(g.nodes, gid(REVIEWS)),
      };
    });
    const project = projects.get(projectId);
    out.push({
      branch: {
        id: `p:${projectId}`,
        label: project?.title ?? projectId,
        kind: "project",
        ...(project?.repo && { repo: project.repo }),
        ...(project?.path && { path: project.path }),
        groups: keyGroups,
        threads: loose.map(clean),
      },
      first: [...gs.map((g) => g.first), ...loose.map((n) => n.first)].toSorted()[0],
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
    const mates = si === undefined ? [n] : sorted.filter((m) => stackIdOf.get(m.id) === si).toSorted(bySlot);
    mates.forEach((m) => placed.add(m));
    return mates;
  });
};

type Milestone = { id: string; label: string; date: string | null; none: boolean; nodes: Node[] };

/** Linear project, then milestone, then thread. Fallback groups follow the projects. */
function linearLayout(entered: Set<Node>, claims: Map<Node, Claim>, f: Facts): Group[] {
  const { projects } = f.input;
  const { stacks, stackIdOf } = f;

  const byProject = new Map<string, { name: string; url: string; milestones: Map<string, Milestone> }>();
  const reviews: Node[] = [];
  const noProject: Node[] = [];
  const loose: Node[] = [];
  /** The Linear project that all threads under a map head share; the milestone only when they share one too. */
  const sharedOf = (head: Node): LinearIssue | undefined => {
    const below = (n: ThreadNode): ThreadNode[] => n.children.flatMap((c) => [c, ...below(c)]);
    const ls = below(head).flatMap((m) => (m.linear?.project ? [m.linear] : []));
    if (new Set(ls.map((l) => l.project!.id)).size !== 1) return undefined;
    const one = new Set(ls.map((l) => l.milestone?.id)).size === 1;
    return { project: ls[0].project, milestone: one ? ls[0].milestone : null };
  };
  for (const n of entered) {
    const { t } = n;
    n.t3Project = { id: t.projectId, label: projects.get(t.projectId)?.title ?? t.projectId };
    const c = claims.get(n)!;
    if ("under" in c) continue;
    const linear = c.into === "key" ? c.by.linear : c.into === "loose" && n.map ? sharedOf(n) : undefined;
    if (c.into === "review") reviews.push(n);
    else if (c.into === "key" || linear) {
      const lp = linear?.project;
      if (!lp) noProject.push(n);
      else {
        const p = byProject.get(lp.id) ?? { name: lp.name, url: lp.url, milestones: new Map() };
        byProject.set(lp.id, p);
        const m = linear?.milestone;
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
    } else loose.push(n);
  }

  /** Settles nested threads, then orders the group. */
  const placeAll = (ns: Node[]) => {
    ns.forEach(settle);
    return stackAdjacent(ns, stackIdOf);
  };
  /** Splits placed nodes. Stack mates go in one key-group branch each, with the rail; the rest stay threads. */
  const holder = (ns: Node[], parentId: string): Pick<Group, "groups" | "threads"> => {
    const keyed = new Map<string, Group>();
    const threads: ThreadNode[] = [];
    for (const n of ns) {
      const si = stackIdOf.get(n.id);
      if (si === undefined) {
        threads.push(clean(n));
        continue;
      }
      const st = stacks[si];
      const key = n.key ?? `PR stack #${bottomPr(st)}`;
      const rail = railOf(st)!;
      const g = keyed.get(`${si}:${key}`) ?? {
        id: `${parentId}:${rail.id}:${key}`,
        label: key,
        kind: "stack" as const,
        stack: rail,
        groups: [],
        threads: [],
      };
      keyed.set(`${si}:${key}`, g);
      g.threads.push(clean(n));
    }
    return { groups: [...keyed.values()], threads };
  };
  const oldest = (ns: Node[]) => ns.toSorted(byFirst)[0].first;
  const rank = (m: Milestone) => (m.none ? 2 : m.date ? 0 : 1);

  for (const p of byProject.values()) for (const m of p.milestones.values()) m.nodes = placeAll(m.nodes);

  const top = [...byProject].map(([id, p]) => {
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
        kind: "linear-project",
        linear: { url: p.url },
        threads: [],
        groups: ms.map((m): Group => ({
          id: m.id,
          label: m.label,
          kind: "milestone",
          linear: { date: m.date },
          ...holder(m.nodes, m.id),
        })),
      } satisfies Group,
    };
  });
  /** A group of the top level with the time of its oldest thread, so that it sorts with the Linear projects. */
  const fallback = (id: string, label: string, kind: GroupKind, ns: Node[]) => {
    const placed = placeAll(ns);
    return ns.length ? [{ first: oldest(placed), branch: { id, label, kind, linear: {}, ...holder(placed, id) } }] : [];
  };
  const placedReviews = placeAll(reviews);
  const reviewGroup = reviews.length
    ? [
        {
          first: oldest(placedReviews),
          branch: {
            id: LINEAR_REVIEWS,
            label: REVIEWS,
            kind: "review" as const,
            linear: {},
            ...reviewGroups(placedReviews, LINEAR_REVIEWS),
          },
        },
      ]
    : [];
  const entries = [...top, ...reviewGroup, ...fallback("lf:none", NO_PROJECT, "no-project", noProject)];
  return [
    ...entries.toSorted(byFirst).map((o) => o.branch),
    ...fallback(LINEAR_LOOSE, "", "loose", loose).map((o) => o.branch),
  ];
}

/** Review threads in one subgroup per issue key, in first-seen order. Keyless reviews sit directly in the group. */
const reviewGroups = (nodes: Node[], id: string): Pick<Group, "groups" | "threads"> => {
  const byKey = new Map<string, Node[]>();
  for (const n of nodes) if (n.key) byKey.set(n.key, [...(byKey.get(n.key) ?? []), n]);
  return {
    groups: [...byKey].map(([k, ns]): Group => ({
      id: `${id}:${k}`,
      label: k,
      kind: "key",
      groups: [],
      threads: ns.map(clean),
    })),
    threads: nodes.filter((x) => !x.key).map(clean),
  };
};

/** Strips the build-only fields before the node goes on the wire. Nested subthreads get no Suggested replies. */
const clean = ({ t: _t, first: _f, si: _si, slot: _sl, children, ...n }: Node): ThreadNode => ({
  ...n,
  children: (children as Node[]).map(({ suggestedReplies: _s, ...c }) => clean(c as Node)),
});
