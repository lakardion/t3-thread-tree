import { allThreads, NO_KEY, REVIEWS, type Branch, type ThreadNode } from "../shared/tree.ts";
import { stackRuns } from "./format.ts";
import { isPinned } from "./order.ts";

export type SortBy = "manual" | "updated";

/** The newest `lastRun` of a thread and its subthreads, as a time. `-Infinity` when none has run. */
export function recency(t: ThreadNode): number {
  return Math.max(t.lastRun ? Date.parse(t.lastRun) : -Infinity, ...t.children.map(recency));
}

/** The newest run, as a time, over all threads of a group, subthreads included. */
const newestRun = (b: Branch) => Math.max(-Infinity, ...allThreads(b).map(recency));
const threadsSorted = (b: Branch): Branch => ({ ...b, threads: byNewest(b.threads, recency) });

/** Stable sort, newest first. */
const byNewest = <T>(items: T[], by: (t: T) => number): T[] =>
  items.toSorted((a, b) => Number(by(b) > by(a)) - Number(by(b) < by(a)));

/**
 * Sorts an arranged tree by recency. Projects keep their order. In a project, Reviews stays first and No issue key last;
 * the groups between them, and the threads in each group, sort newest first. A stack run moves as one block and keeps
 * its inner order. Subthreads keep their order. Ties keep the input order. The input is not changed.
 */
export function sortTree(projects: Branch[]): Branch[] {
  return projects.map((p) => {
    const keys = stackRuns(p.branches.filter((b) => !isPinned(b)));
    return {
      ...p,
      branches: [
        ...p.branches
          .filter((b) => b.label === REVIEWS)
          .map((r) => ({ ...r, branches: byNewest(r.branches.map(threadsSorted), newestRun) })),
        ...byNewest(keys, (run) => Math.max(...run.map(newestRun))).flatMap((run) =>
          run[0].stack ? run : run.map(threadsSorted),
        ),
        ...p.branches.filter((b) => b.label === NO_KEY).map(threadsSorted),
      ],
    };
  });
}

/** The `view-transition-name` of a thread row (`t`) or a stack rail (`s`). */
export const vtName = (kind: "t" | "s", id: string): string => `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
