import type { NeedsYouStatus, NeedsYouThread, NotifyEvent, NotifyStatus } from "../shared/desktop.ts";
import { allThreads, type Branch, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";

export type Counts = { needYou: number; working: number; yourTurn: number; stopped: number };

/** The statuses that the "Needs you" filter keeps. */
export const needsYou = (s: Status): boolean => s === "needs-input" || s === "plan-ready" || s === "your-turn";

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

const keepThreads = (ts: ThreadNode[]): ThreadNode[] =>
  ts.flatMap((t) => {
    const children = keepThreads(t.children);
    return needsYou(t.status) || children.length > 0 ? [{ ...t, children }] : [];
  });

const keepBranch = (b: Branch): Branch[] => {
  const branches = b.branches.flatMap(keepBranch);
  const threads = keepThreads(b.threads);
  return branches.length > 0 || threads.length > 0 ? [{ ...b, branches, threads }] : [];
};

/** The tree with only the threads that need the user, and the spawners, groups and projects that hold them. */
export const onlyNeedsYou = (projects: Branch[]): Branch[] => projects.flatMap(keepBranch);

const envOf = (t: ThreadNode) => decodeURIComponent(t.href.split("/")[3] ?? "");

/** The visible threads that wait for the user (needs input or plan ready), settled ones left out. */
export const needsYouThreads = (projects: Branch[]): NeedsYouThread[] =>
  projects
    .flatMap(allThreads)
    .filter(
      (t): t is ThreadNode & { status: NeedsYouStatus } =>
        !t.settled && (t.status === "needs-input" || t.status === "plan-ready"),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      environmentId: envOf(t),
      since: t.since,
      status: t.status,
    }));

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
  }));
  return { events, nextStatuses };
}
