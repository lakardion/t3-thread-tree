import { allThreads, type Branch, type Status, type ThreadNode } from "../shared/tree.ts";

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
