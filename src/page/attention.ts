import type {
  CatchUpLineData,
  NeedsYouThread,
  NotifyEvent,
  NotifyStatus,
  ThreadNotifyEvent,
  UpNext,
} from "../shared/desktop.ts";
import { allThreads, bySince, type Branch, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";
import { linearHref } from "./format.ts";

export type Counts = { needYou: number; working: number; yourTurn: number; stopped: number };

/** The statuses that the "Needs you" filter keeps. */
export const needsYou = (s: Status): s is "needs-input" | "plan-ready" | "your-turn" =>
  s === "needs-input" || s === "plan-ready" || s === "your-turn";

/** The tooltip of the "Needs you" chip numbers: the Needs-you count, then the your-turn count; "" when both are 0. */
export const needsYouTip = (c: Counts): string =>
  [c.needYou > 0 && `${c.needYou} need you`, c.yourTurn > 0 && `${c.yourTurn} your turn`].filter(Boolean).join(", ");

/** The summary counts over all threads of the tree, nested threads included. */
export function countAttention(projects: Branch[]): Counts {
  const c: Counts = { needYou: 0, working: 0, yourTurn: 0, stopped: 0 };
  for (const { status } of projects.flatMap(allThreads)) {
    if (status === "needs-input" || status === "plan-ready") c.needYou++;
    else if (status === "working" || status === "starting" || status === "waiting") c.working++;
    else if (status === "your-turn") c.yourTurn++;
    else if (status === "failed" || status === "interrupted") c.stopped++;
  }
  return c;
}

const keepThreads = (ts: ThreadNode[], keep: (t: ThreadNode) => boolean): ThreadNode[] =>
  ts.flatMap((t) => {
    const children = keepThreads(t.children, keep);
    return keep(t) || children.length > 0 ? [{ ...t, children }] : [];
  });

const keepBranch = (b: Branch, keep: (t: ThreadNode) => boolean): Branch[] => {
  const branches = b.branches.flatMap((x) => keepBranch(x, keep));
  const threads = keepThreads(b.threads, keep);
  return branches.length > 0 || threads.length > 0 ? [{ ...b, branches, threads }] : [];
};

/** The tree with only the threads that need the user, and the spawners, groups and projects that hold them. */
export const onlyNeedsYou = (projects: Branch[]): Branch[] =>
  projects.flatMap((b) => keepBranch(b, (t) => needsYou(t.status)));

/** The tree without snoozed threads. A snoozed thread with a kept subthread stays; empty groups and projects drop out. */
export const withoutSnoozed = (projects: Branch[]): Branch[] =>
  projects.flatMap((b) => keepBranch(b, (t) => t.status !== "snoozed"));

/** The Catch-up fields that cross the bridge, as an optional key to spread. */
const lineOf = (t: ThreadNode): { catchUp?: CatchUpLineData } => {
  if (!t.catchUp) return {};
  const { state, did, ask, options, question } = t.catchUp;
  return { catchUp: { state, did, ask, options, question } };
};

const envOf = (t: ThreadNode) => decodeURIComponent(t.href.split("/")[3] ?? "");

const waiting = (t: ThreadNode): t is ThreadNode & { status: "needs-input" | "plan-ready" } =>
  !t.settled && (t.status === "needs-input" || t.status === "plan-ready");

/** True when a thread under `b` waits for the user (needs input or plan ready), settled ones left out. */
export const waits = (b: Branch): boolean => allThreads(b).some(waiting);

/** The visible threads that wait for the user (needs input or plan ready), settled ones left out. */
export const needsYouThreads = (projects: Branch[]): NeedsYouThread[] =>
  projects
    .flatMap(allThreads)
    .flatMap((t) =>
      waiting(t)
        ? [{ id: t.id, title: t.title, environmentId: envOf(t), since: t.since, status: t.status, ...lineOf(t) }]
        : [],
    );

/** The threads "Open next" can open: needs input, plan ready or your turn, not settled, subthreads included. Oldest `since` first, no `since` last, ties in tree order. */
export const openNextQueue = (projects: Branch[]): ThreadNode[] =>
  projects
    .flatMap(allThreads)
    .filter((t) => !t.settled && needsYou(t.status))
    .toSorted((a, b) => bySince(a.since, b.since));

/** The Up next window payload: the queue in order, each row with its project label and Linear URL. */
export const upNextList = (
  projects: Branch[],
  queue: ThreadNode[],
  target: ThreadNode | null,
  linear: Tree["linear"],
): UpNext => {
  const projectOf = new Map(projects.flatMap((p) => allThreads(p).map((t) => [t.id, p.label] as const)));
  return {
    rows: queue.flatMap((t) =>
      needsYou(t.status)
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

/** A thread stays skipped until its Wait starts again. */
const seenKey = (t: ThreadNode) => `${t.id} ${t.since}`;

/** The first thread not opened yet; when all were opened, the top thread. Null with an empty queue. */
export const nextTarget = (queue: ThreadNode[], seen: ReadonlySet<string>): ThreadNode | null =>
  queue.find((t) => !seen.has(seenKey(t))) ?? queue[0] ?? null;

/** The memory after opening `t`. When every thread was skipped, the memory starts again with `t` only. */
export const remember = (queue: ThreadNode[], seen: ReadonlySet<string>, t: ThreadNode): Set<string> =>
  queue.every((q) => seen.has(seenKey(q))) ? new Set([seenKey(t)]) : new Set(seen).add(seenKey(t));

/** The tab title, with the count of threads that need the user when it is not 0. */
export const tabTitle = (n: number): string => (n > 0 ? `(${n}) Thread tree` : "Thread tree");

/** The app icon as a data URL, with an amber dot in the top-right corner when `n` is not 0. */
export const favicon = (svg: string, n: number): string => {
  const dot = '<circle cx="800" cy="224" r="200" fill="#f59e0b" stroke="#141c1a" stroke-width="48"/>';
  const out = n > 0 ? svg.replace("</svg>", `${dot}</svg>`) : svg;
  return `data:image/svg+xml,${encodeURIComponent(out)}`;
};

export type Statuses = Map<string, Status>;

const notifies = (s: Status): s is NotifyStatus => s === "needs-input" || s === "plan-ready" || s === "failed";

/**
 * The notifications for the threads that entered needs-input, plan-ready or failed since `last`.
 * The first live tree is the baseline and sends nothing. Settled threads never notify. Three or more threads give one summary.
 */
export function notifyEvents(
  last: Statuses | null,
  tree: Tree,
): { events: NotifyEvent[]; nextStatuses: Statuses | null } {
  if (tree.conn !== "up") return { events: [], nextStatuses: last };
  const threads = tree.projects.flatMap(allThreads);
  const nextStatuses: Statuses = new Map(last ?? []);
  for (const t of threads) nextStatuses.set(t.id, t.status);
  if (!last) return { events: [], nextStatuses };
  const entered = threads.filter(
    (t): t is ThreadNode & { status: NotifyStatus } => !t.settled && notifies(t.status) && last.get(t.id) !== t.status,
  );
  if (entered.length >= 3) return { events: [{ kind: "summary", count: entered.length }], nextStatuses };
  const events = entered.map((t) => ({
    kind: "thread" as const,
    threadId: t.id,
    environmentId: envOf(t),
    title: t.title,
    status: t.status,
    ...lineOf(t),
  }));
  return { events, nextStatuses };
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
