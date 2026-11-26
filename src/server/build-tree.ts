import { ago } from "../page/format.ts";
import { RULES, type RuleId } from "../shared/rules.ts";
/** The tree rules: visibility, placement, stack order and status. Pure, so `bun test` covers it. */
import {
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
import { mapName, mapsOf, markedKey } from "./maps.ts";
import { suggestedReplies } from "./replies.ts";
import {
  narrowChecks,
  narrowReview,
  type Pr,
  type Project,
  type RunStepsRaw,
  type RunsSnapshot,
  type Thread,
} from "./t3.ts";

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
  /** The map key of a thread, from its first message. Unset: no Map groups. */
  mapKeyOf?: (id: string) => string | null;
  /** The ids of marked map threads: their keyless children form a map group. */
  marked?: Set<string>;
};

/** `si` is the stack index of a child in a stack rail of a Map group. */
type Node = ThreadNode & { t: Thread; first: string; si?: number; slot?: number };
type KeyGroup = { key: string; nodes: Node[]; first: string; kind: GroupKind };
/** `order` holds the open PRs, which get numbers. `slots` adds merged PRs at their place in the stack. */
type Stack = { set: Set<number>; threads: Thread[]; order: number[]; slots: number[] };

const stackPrs = (t: Thread) => t.prs.filter((p) => STACK_SOURCES.has(p.source) && p.state === "open").map((p) => p.n);
export const prNode = (p: Thread["prs"][number], labels: Label[]): PrNode => {
  const pos = p.stackSlots?.indexOf(p.n) ?? -1;
  return {
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
 * Stacks are connected sets of open stack PRs across threads. The order is the layer list T3
 * synced last (a tie goes to the longest). Without one, it comes from the thread with the longest
 * list: its stack/agent PRs in list order, with each of its own created PRs placed after the last
 * lower number.
 */
export function computeStacks(threads: Thread[]): Stack[] {
  const stacks: Stack[] = [];
  for (const t of threads) {
    const s = new Set(stackPrs(t));
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
    const latest = st.threads
      .flatMap((t) => t.prs)
      .filter((p) => p.stackLayers?.length)
      .reduce<Pr | null>(
        (a, b) =>
          !a ||
          syncedMs(b) > syncedMs(a) ||
          (syncedMs(b) === syncedMs(a) && b.stackLayers!.length > a.stackLayers!.length)
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

  /** Map members and map threads: no thread nests under them by launch. */
  const mapped = new Set<string>();
  const visibleSpawner = (id: string): string | null => {
    const seen = new Set([id]);
    let c = spawnerOf(id);
    while (c && !seen.has(c)) {
      if (visible.has(c)) return mapped.has(c) ? null : c;
      seen.add(c);
      c = spawnerOf(c);
    }
    return null;
  };

  /**
   * Rule 6.0. Claims each Map member, and each keyless stack mate of a member, under its nearest ancestor in the same
   * map. A group hangs on its map thread, or on a Map header that the pool then holds.
   * Returns the claims, the new headers and the head marks.
   */
  const groupMaps = (): Ruled => {
    const claims = new Map<Node, Claim>();
    const marks = new Map<Node, MapInfo>();
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
        map: { name: mapName(key, title, shown), header: true, href, key },
      };
      top.set(key, n);
      return n;
    };
    for (const key of shown) {
      const mt = maps.threadOf.get(key);
      const mapThread = mt ? all.get(mt) : undefined;
      const head = mt ? nodes.get(mt) : undefined;
      if (head) {
        if (anchored(head.id).length === 1) {
          top.set(key, head);
          marks.set(head, { name: mapName(key, head.title, shown), header: false, href: null, key });
        } else {
          marks.set(head, { name: head.title, header: false, href: null });
          claims.set(header(key, `map:${key}`, head.t, mapThread), { under: head });
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
    const put = (n: Node, container: Node, key: string) => claims.set(n, { under: container, top: top.get(key) });
    for (const id of members) put(nodes.get(id)!, containerOf(id, keyOf.get(id)!), keyOf.get(id)!);
    for (const [id, low] of mates) put(nodes.get(id)!, containerOf(low.id, keyOf.get(id)!), keyOf.get(id)!);
    for (const s of sub) claims.set(s.header, { under: containerOf(s.of, s.parentKey) });
    return { claims, added: placed, marks };
  };

  return {
    stacks,
    stackIdOf,
    nodes,
    all,
    mapped,
    visibleSpawner,
    groupMaps: input.mapKeyOf ? groupMaps : (): Ruled => ({ claims: new Map() }),
  };
}

/** Stack mates in a stack, then creation. */
const bySlot = (a: Node, b: Node) => (a.slot ?? Infinity) - (b.slot ?? Infinity);
const byPos = (a: Node, b: Node) => bySlot(a, b) || byFirst(a, b);

/** The rail data of a stack. */
const railOf = (st: Stack | undefined): Group["stack"] => {
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

/** The group of a node by its own key and review flag. A keyless thread nests under a spawner of the same home. */
const home = (n: Node, layout: Layout): string => {
  if (layout === "project") return n.t.projectId;
  if (isReview(n)) return "review";
  if (!n.key) return "loose";
  const lp = n.linear?.project;
  return lp ? `key:${lp.id}:${n.linear?.milestone?.id ?? "none"}` : "none";
};

const CHAIN: Record<RuleId, Rule> = {
  map: (_pool, f) => f.groupMaps(),
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
  nest: (pool, f) =>
    claiming(pool, (n) => {
      if (n.run || n.key || isReview(n)) return null;
      const vs = f.visibleSpawner(n.t.id);
      const s = vs ? f.nodes.get(vs) : undefined;
      return s && home(n, f.layout) === home(s, f.layout) ? { under: s } : null;
    }),
};

/** The default chain; `nest` turns Launch nesting on. */
export const defaultRules = (nest: boolean): RuleId[] =>
  RULES.filter((r) => r.on || (nest && r.id === "nest")).map((r) => r.id);

/** The rule list of a `rules` stream parameter. No parameter: the default chain. Unknown and repeated ids drop; `map` goes first and `nest` last. */
export function parseRules(raw: string | null): RuleId[] {
  if (raw === null) return defaultRules(false);
  const ids = RULES.map((r) => r.id);
  const given = [...new Set(raw.split(","))].filter((id): id is RuleId => ids.includes(id as RuleId));
  const middle = given.filter((id) => id !== "map" && id !== "nest");
  return [...given.filter((id) => id === "map"), ...middle, ...given.filter((id) => id === "nest")];
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
    for (const [head, m] of ruled.marks ?? []) {
      head.map = m;
      f.mapped.add(head.id);
    }
    for (const [n, c] of ruled.claims) {
      if (entered.has(n) && !pool.has(n)) continue;
      claims.set(n, c);
      pool.delete(n);
      if (!("under" in c)) continue;
      c.under.children.push(n);
      if (c.top) f.mapped.add(n.id);
      if (id === "map") mapRows.set(c.under, [...(mapRows.get(c.under) ?? []), n]);
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
  for (const n of entered) {
    const c = claims.get(n)!;
    const top = "under" in c ? c.top : undefined;
    if (top && n.t.projectId !== top.t.projectId)
      n.t3Project = { id: n.t.projectId, label: input.projects.get(n.t.projectId)?.title ?? n.t.projectId };
    const sp = input.spawnerOf(n.id);
    const spawner = sp ? f.all.get(sp) : undefined;
    if (spawner && !("under" in c && c.under === f.nodes.get(spawner.id)))
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
    else if (c.into === "stack") addTo(pid, `PR stack #${stacks[c.si].order[0]}`, "stack", n);
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
      const key = n.key ?? `PR stack #${st.order[0]}`;
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
