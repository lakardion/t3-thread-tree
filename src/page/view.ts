import { allThreads, NO_KEY, REVIEWS, type Branch, type Status, type ThreadNode } from "../shared/tree.ts";
import { stackRuns } from "./format.ts";
import { isPinned } from "./order.ts";

export type SortBy = "manual" | "updated";
export type Layout = "tree" | "flat";
export type GroupBy = "none" | "status";

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

/** The `view-transition-name` of a thread row (`t`), a stack rail (`s`) or a section header (`sec`). */
export const vtName = (kind: "t" | "s" | "sec", id: string): string => `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** One row of the flat list: a thread, or a PR stack that moves as one block. */
export type FlatUnit =
  | { kind: "thread"; id: string; t: ThreadNode; project: Branch; review: boolean }
  | { kind: "stack"; id: string; run: Branch[]; project: Branch };

export type FlatItem = FlatUnit | { kind: "section"; id: string; key: string; label: string; count: number };

const threadUnit = (t: ThreadNode, project: Branch, review: boolean): FlatUnit => ({
  kind: "thread",
  id: `t:${t.id}`,
  t,
  project,
  review,
});

/**
 * The units of an arranged tree, in order: per project, the Reviews threads, then each stack run (one unit) or
 * group thread, then the No issue key threads. Subthreads stay in `t.children`.
 */
export function flatten(projects: Branch[]): FlatUnit[] {
  return projects.flatMap((p) => [
    ...p.branches
      .filter((b) => b.label === REVIEWS)
      .flatMap((r) => r.branches.flatMap((g) => g.threads.map((t) => threadUnit(t, p, true)))),
    ...stackRuns(p.branches.filter((b) => !isPinned(b))).flatMap((run): FlatUnit[] =>
      run[0].stack
        ? [{ kind: "stack", id: `stack:${p.id}:${run[0].stack.id}`, run, project: p }]
        : run.flatMap((g) => g.threads.map((t) => threadUnit(t, p, false))),
    ),
    ...p.branches.filter((b) => b.label === NO_KEY).flatMap((g) => g.threads.map((t) => threadUnit(t, p, false))),
  ]);
}

const unitThreads = (u: FlatUnit): ThreadNode[] => (u.kind === "thread" ? [u.t] : u.run.flatMap((g) => g.threads));

/** Sorts units across projects, newest first. A stack counts its newest thread. Ties keep the input order. */
export const sortFlat = (units: FlatUnit[]): FlatUnit[] =>
  byNewest(units, (u) => Math.max(-Infinity, ...(u.kind === "thread" ? [recency(u.t)] : u.run.map(newestRun))));

/** The status sections, most urgent first. */
export const SECTIONS: [key: string, label: string, statuses: Status[]][] = [
  ["needs-input", "Needs input", ["needs-input"]],
  ["plan-ready", "Plan ready", ["plan-ready"]],
  ["your-turn", "Your turn", ["your-turn"]],
  ["failed", "Failed", ["failed", "interrupted"]],
  ["working", "Working", ["working", "starting", "waiting"]],
  ["idle", "Idle and snoozed", ["idle", "snoozed"]],
  ["done", "Done", ["done"]],
];

const sectionIndex = (st: Status) => SECTIONS.findIndex(([, , statuses]) => statuses.includes(st));

/**
 * Groups units by status, in section order, and drops empty sections. A thread goes by its own status, a stack by
 * its most urgent thread. Units keep their input order.
 */
export function sections(units: FlatUnit[]): { key: string; label: string; units: FlatUnit[] }[] {
  const at = (u: FlatUnit) => Math.min(...unitThreads(u).map((t) => sectionIndex(t.status)));
  return SECTIONS.map(([key, label], i) => ({ key, label, units: units.filter((u) => at(u) === i) })).filter(
    (s) => s.units.length > 0,
  );
}

/** The flat sequence: the units, or section headers each followed by its units. */
export const sequence = (units: FlatUnit[], groupBy: GroupBy): FlatItem[] =>
  groupBy === "status"
    ? sections(units).flatMap((s): FlatItem[] => [
        { kind: "section", id: `sec:${s.key}`, key: s.key, label: s.label, count: s.units.length },
        ...s.units,
      ])
    : units;

/** The ids that a flat item puts in the row-order signature. */
export const itemIds = (i: FlatItem): string[] =>
  i.kind === "stack" ? [i.id, ...i.run.flatMap(allThreads).map((t) => t.id)] : [i.id];
