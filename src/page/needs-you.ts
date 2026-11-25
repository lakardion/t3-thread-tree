import type {
  CatchUpLineData,
  NeedsYouThread,
  NotifyEvent,
  NotifyStatus,
  ThreadNotifyEvent,
  UpNext,
} from "../shared/desktop.ts";
import { isRun, type RunItem } from "../shared/runs.ts";
import { BUSY, CATCH_UP, isIn, NEEDS_YOU, NOTIFY } from "../shared/status.ts";
import { allThreads, bySince, isThread, type Group, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";
import { linearHref } from "./format.ts";

export type Counts = { needYou: number; working: number; yourTurn: number; stopped: number };

/** Whether a thread status is in Needs you. */
export const needsYou = (s: Status) => isIn(NEEDS_YOU, s);

/** Whether a row shows a Catch-up line. */
export const hasCatchUpLine = (t: Pick<ThreadNode, "status" | "catchUp">) => !!t.catchUp && isIn(CATCH_UP, t.status);

/** The tooltip of the "Needs you" chip: the Needs-you count, with the your-turn part of it; "" when it is 0. */
export const needsYouTip = (c: Counts): string =>
  c.needYou === 0 ? "" : `${c.needYou} need you${c.yourTurn > 0 ? ` (${c.yourTurn} your turn)` : ""}`;

/** The header counts over all threads of the tree, nested threads included. Each run item needs the user. `yourTurn` is a part of `needYou`. */
export function countHeader(projects: Group[], runs: RunItem[] = []): Counts {
  const c: Counts = { needYou: runs.length, working: 0, yourTurn: 0, stopped: 0 };
  for (const { status } of projects.flatMap(allThreads)) {
    if (isIn(NEEDS_YOU, status)) {
      c.needYou++;
      if (status === "your-turn") c.yourTurn++;
    } else if (isIn(BUSY, status)) c.working++;
    else if (status === "failed" || status === "interrupted") c.stopped++;
  }
  return c;
}

/** A Map header with no child left drops out; a map thread with no child left is a plain row. */
const keepThreads = (ts: ThreadNode[], keep: (t: ThreadNode) => boolean): ThreadNode[] =>
  ts.flatMap((t) => {
    const children = keepThreads(t.children, keep);
    if (t.map?.header) return children.length > 0 ? [{ ...t, children }] : [];
    if (!keep(t) && children.length === 0) return [];
    return [{ ...t, children, ...(t.map && children.length === 0 && { map: undefined }) }];
  });

const keepGroup = (b: Group, keep: (t: ThreadNode) => boolean): Group[] => {
  const groups = b.groups.flatMap((x) => keepGroup(x, keep));
  const threads = keepThreads(b.threads, keep);
  return groups.length > 0 || threads.length > 0 ? [{ ...b, groups, threads }] : [];
};

/** The tree with only the threads that need the user, and the spawners, groups and projects that hold them. */
export const onlyNeedsYou = (projects: Group[]): Group[] =>
  projects.flatMap((b) => keepGroup(b, (t) => isThread(t) && needsYou(t.status)));

/** The tree without snoozed threads. A snoozed thread with a kept subthread stays; empty groups and projects drop out. */
export const withoutSnoozed = (projects: Group[]): Group[] =>
  projects.flatMap((b) => keepGroup(b, (t) => t.status !== "snoozed"));

/** Why the list is empty. Follows the page pipeline order: the snoozed filter, then the Needs you filter. */
export type EmptyKind = "needs" | "snoozed" | "none";
const count = (ps: Group[]) => ps.flatMap(allThreads).length;
export const emptyKind = (projects: Group[], snoozed: boolean, needsOnly: boolean): EmptyKind => {
  if (needsOnly && count(snoozed ? projects : withoutSnoozed(projects)) > 0) return "needs";
  if (!snoozed && count(projects) > 0) return "snoozed";
  return "none";
};

/** The Catch-up fields that cross the bridge, as an optional key to spread. */
const lineOf = (t: ThreadNode): { catchUp?: CatchUpLineData } => {
  if (!t.catchUp) return {};
  const { state, did, ask, options, question } = t.catchUp;
  return { catchUp: { state, did, ask, options, question } };
};

const envOf = (t: ThreadNode) => decodeURIComponent(t.href.split("/")[3] ?? "");

const inNeedsYou = (t: ThreadNode): t is ThreadNode & { status: (typeof NEEDS_YOU)[number] } =>
  !t.settled && isIn(NEEDS_YOU, t.status);

/** True when a thread under `b` is in Needs you, settled ones left out. */
export const waits = (b: Group): boolean => allThreads(b).some(inNeedsYou);

const runStatus = (r: RunItem): "run-question" | "paused-run" =>
  r.kind === "question" ? "run-question" : "paused-run";

/** What a run item shows as its status phrase. */
export const runPhrase = (r: RunItem) => (r.kind === "question" ? "Run question" : "Paused run");

/** The Catch-up line of a run item: its `line`, with no model call. */
const runLine = (r: RunItem): { catchUp?: CatchUpLineData } => ({ catchUp: { state: "done", ask: r.line } });

/** The visible threads that wait for the user (needs input or plan ready), settled ones left out, then the run items. */
export const needsYouThreads = (projects: Group[], runs: RunItem[] = []): NeedsYouThread[] => [
  ...projects
    .flatMap(allThreads)
    .flatMap((t) =>
      inNeedsYou(t)
        ? [{ id: t.id, title: t.title, environmentId: envOf(t), since: t.since, status: t.status, ...lineOf(t) }]
        : [],
    ),
  ...runs.map((r) => ({
    id: r.id,
    title: r.runTitle,
    environmentId: "",
    since: r.since,
    status: runStatus(r),
    url: r.href,
    ...runLine(r),
  })),
];

/** The items "Open next" can open: the Needs-you threads (not settled, subthreads included) and run items. Oldest `since` first, no `since` last, ties in tree order. */
export const openNextQueue = (projects: Group[], runs: RunItem[] = []): (ThreadNode | RunItem)[] =>
  [...projects.flatMap(allThreads).filter((t) => !t.settled && needsYou(t.status)), ...runs].toSorted((a, b) =>
    bySince(a.since, b.since),
  );

/** The Up next window payload: the queue in order, each row with its project label and Linear URL. */
export const upNextList = (
  projects: Group[],
  queue: (ThreadNode | RunItem)[],
  target: ThreadNode | RunItem | null,
  linear: Tree["linear"],
): UpNext => {
  const projectOf = new Map(projects.flatMap((p) => allThreads(p).map((t) => [t.id, p.label] as const)));
  return {
    rows: queue.flatMap((t): UpNext["rows"] =>
      isRun(t)
        ? [
            {
              id: t.id,
              title: t.title,
              status: runStatus(t),
              phrase: runPhrase(t),
              raw: "",
              since: t.since,
              project: t.workflow,
              key: null,
              linearUrl: null,
              ...runLine(t),
            },
          ]
        : needsYou(t.status)
          ? [
              {
                id: t.id,
                title: t.title,
                status: t.status,
                phrase: t.phrase,
                raw: t.raw,
                since: t.since,
                project: t.t3Project?.label ?? projectOf.get(t.id) ?? "",
                key: t.key,
                linearUrl: t.key ? linearHref(t.key, linear) : null,
                ...lineOf(t),
              },
            ]
          : [],
    ),
    targetId: target?.id ?? null,
  };
};

/** An item stays skipped until its Wait starts again. */
const seenKey = (t: { id: string; since: string | null }) => `${t.id} ${t.since}`;

/** The first item not opened yet; when all were opened, the top item. Null with an empty queue. */
export const nextTarget = <T extends { id: string; since: string | null }>(
  queue: T[],
  seen: ReadonlySet<string>,
): T | null => queue.find((t) => !seen.has(seenKey(t))) ?? queue[0] ?? null;

/** The memory after opening `t`. When every item was skipped, the memory starts again with `t` only. */
export const remember = <T extends { id: string; since: string | null }>(
  queue: T[],
  seen: ReadonlySet<string>,
  t: T,
): Set<string> => (queue.every((q) => seen.has(seenKey(q))) ? new Set([seenKey(t)]) : new Set(seen).add(seenKey(t)));

/** The tab title, with the count of threads that need the user when it is not 0. */
export const tabTitle = (n: number): string => (n > 0 ? `(${n}) Thread tree` : "Thread tree");

/** The app icon as a data URL, with an amber dot in the top-right corner when `n` is not 0. */
export const favicon = (svg: string, n: number): string => {
  const dot = '<circle cx="800" cy="224" r="200" fill="#f59e0b" stroke="#141c1a" stroke-width="48"/>';
  const out = n > 0 ? svg.replace("</svg>", `${dot}</svg>`) : svg;
  return `data:image/svg+xml,${encodeURIComponent(out)}`;
};

export type Statuses = Map<string, Status>;

/** What the notification rule remembers. `threads`: the last status of each thread. `runs`: the keys of the run items. Each is null until its baseline. */
export type NotifyMemory = { threads: Statuses | null; runs: Set<string> | null };

export const noMemory: NotifyMemory = { threads: null, runs: null };

const notifies = (s: Status): s is NotifyStatus => isIn(NOTIFY, s);

/**
 * The notifications for the threads that entered needs-input, plan-ready or failed since `last`,
 * and for the run items whose key (`id` + `since`) is new. Threads and runs each have a baseline:
 * the first live tree for threads, the first tree with a workflows snapshot for runs. A baseline sends nothing.
 * Settled threads never notify. Three or more items give one summary.
 */
export function notifyEvents(last: NotifyMemory, tree: Tree): { events: NotifyEvent[]; next: NotifyMemory } {
  if (tree.conn !== "up") return { events: [], next: last };
  const threads = tree.projects.flatMap(allThreads);
  const statuses: Statuses = new Map(last.threads ?? []);
  for (const t of threads) statuses.set(t.id, t.status);
  const next: NotifyMemory = {
    threads: statuses,
    runs: tree.runs ? new Set(tree.runs.map(seenKey)) : last.runs,
  };
  const entered = last.threads
    ? threads.filter(
        (t): t is ThreadNode & { status: NotifyStatus } =>
          !t.settled && notifies(t.status) && last.threads?.get(t.id) !== t.status,
      )
    : [];
  const fresh = last.runs && tree.runs ? tree.runs.filter((r) => !last.runs?.has(seenKey(r))) : [];
  if (entered.length + fresh.length >= 3)
    return { events: [{ kind: "summary", count: entered.length + fresh.length }], next };
  const events: NotifyEvent[] = [
    ...entered.map((t) => ({
      kind: "thread" as const,
      threadId: t.id,
      environmentId: envOf(t),
      title: t.title,
      status: t.status,
      ...lineOf(t),
    })),
    ...fresh.map((r) => ({
      kind: "run" as const,
      id: r.id,
      status: runStatus(r),
      title: r.title,
      url: r.href,
    })),
  ];
  return { events, next };
}

/** Thread events held for their Catch-up, by thread id, with the time each one started to wait. */
export type Held = Map<string, { event: ThreadNotifyEvent; at: number }>;

export const HOLD_MS = 15_000;

/**
 * Splits the held events into those to send now and those to keep. A held event drops when its thread left the tree,
 * settled, or changed status. It goes out with its Catch-up once that is `done` or `failed`, and as it is after `HOLD_MS`.
 * A tree that is not up keeps every held event.
 */
export function releaseHeld(held: Held, tree: Tree, now: number): { send: ThreadNotifyEvent[]; held: Held } {
  if (tree.conn !== "up") return { send: [], held };
  const byId = new Map(tree.projects.flatMap(allThreads).map((t) => [t.id, t]));
  const send: ThreadNotifyEvent[] = [];
  const keep: Held = new Map();
  for (const [id, h] of held) {
    const t = byId.get(id);
    if (!t || t.settled || t.status !== h.event.status) continue;
    if (t.catchUp?.state === "done" || t.catchUp?.state === "failed") send.push({ ...h.event, ...lineOf(t) });
    else if (now - h.at >= HOLD_MS) send.push(h.event);
    else keep.set(id, h);
  }
  return { send, held: keep };
}

/**
 * Splits new notify events into those to send now and those to hold for their Catch-up. With the Catch-up on or not
 * known yet, a thread event is held from `now`. With it off, nothing is held and every held event goes out.
 */
export function holdNew(
  events: NotifyEvent[],
  held: Held,
  catchUpOn: boolean | undefined,
  now: number,
): { send: NotifyEvent[]; held: Held } {
  if (catchUpOn === false) return { send: [...events, ...[...held.values()].map((h) => h.event)], held: new Map() };
  const keep: Held = new Map(held);
  const send: NotifyEvent[] = [];
  for (const e of events) {
    if (e.kind === "thread") keep.set(e.threadId, { event: e, at: now });
    else send.push(e);
  }
  return { send, held: keep };
}
