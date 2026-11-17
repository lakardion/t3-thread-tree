import {
  allThreads,
  bySince,
  flat,
  NO_KEY,
  REVIEWS,
  type Branch,
  type Status,
  type ThreadNode,
} from "../shared/tree.ts";
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

export type FlatItem =
  | FlatUnit
  | { kind: "section"; id: string; key: string; label: string; count: number; open: boolean; statuses: Status[] };

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

/** All threads of a unit, subthreads at any depth. */
const everyThread = (u: FlatUnit): ThreadNode[] => (u.kind === "thread" ? flat(u.t) : u.run.flatMap(allThreads));

/**
 * The threads that place and sort a unit: all its threads, subthreads at any depth, without the settled ones.
 * When all are settled, all of them.
 */
const unitThreads = (u: FlatUnit): ThreadNode[] => {
  const all = everyThread(u);
  const live = all.filter((t) => !t.settled);
  return live.length > 0 ? live : all;
};

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

/** A closed branch with this many threads or more shows counts, not one icon per thread. */
const COUNTS_FROM = 5;

/** The threads of a closed branch per status section, in section order, with the first status of the section for its icon. Empty with fewer than 5 threads. */
export const closedCounts = (ts: ThreadNode[]): { status: Status; label: string; n: number }[] =>
  ts.length < COUNTS_FROM
    ? []
    : SECTIONS.map(([, label, statuses]) => ({
        status: statuses[0],
        label: label.toLowerCase(),
        n: ts.filter((t) => statuses.includes(t.status)).length,
      })).filter((g) => g.n > 0);

/** The sections that sort by Wait, oldest first, and have no drag. */
export const WAIT_SECTIONS = new Set(["needs-input", "plan-ready", "your-turn"]);

/** The oldest `since` of the unit threads that are in `statuses`. `null` when none has one. */
const waitOf = (u: FlatUnit, statuses: Status[]): string | null =>
  unitThreads(u)
    .filter((t) => statuses.includes(t.status))
    .map((t) => t.since)
    .toSorted(bySince)[0] ?? null;

/**
 * Groups units by status, in section order, and drops empty sections. A unit goes by its most urgent thread,
 * subthreads included. Units keep their input order, except in a waiting section: there the oldest Wait comes
 * first, units with no Wait last, and ties keep the input order. With `snoozed` false, the snoozed status is in no
 * section: a snoozed thread does not place its unit.
 */
export function sections(
  units: FlatUnit[],
  snoozed = true,
): { key: string; label: string; statuses: Status[]; units: FlatUnit[] }[] {
  const list = SECTIONS.map(([key, label, statuses]): [string, string, Status[]] => [
    key,
    label,
    snoozed ? statuses : statuses.filter((s) => s !== "snoozed"),
  ]);
  const indexOf = (st: Status) => list.findIndex(([, , statuses]) => statuses.includes(st));
  const placed = (ts: ThreadNode[]) => ts.map((t) => indexOf(t.status)).filter((n) => n >= 0);
  const at = (u: FlatUnit) => {
    const own = placed(unitThreads(u));
    return Math.min(...(own.length > 0 ? own : placed(everyThread(u))));
  };
  return list
    .map(([key, label, statuses], i) => {
      const inSection = units.filter((u) => at(u) === i);
      return {
        key,
        label,
        statuses,
        units: WAIT_SECTIONS.has(key)
          ? inSection.toSorted((a, b) => bySince(waitOf(a, statuses), waitOf(b, statuses)))
          : inSection,
      };
    })
    .filter((s) => s.units.length > 0);
}

/** True when the thread is a context row in a section of `statuses`: it is settled or has another status. */
export const isContext = (t: ThreadNode, statuses: Status[]): boolean => t.settled || !statuses.includes(t.status);

/** True when a stack row folds in a section of `statuses`: it and all its subthreads are context rows. */
export const folds = (t: ThreadNode, statuses: Status[]): boolean => flat(t).every((x) => isContext(x, statuses));

/**
 * The flat sequence: the units, or section headers each followed by its units. A header counts the threads that
 * match its section, subthreads included. Context rows are not counted. A section in `shut` keeps its header and
 * count and gives no units. `shut` does nothing without grouping.
 */
export const sequence = (
  units: FlatUnit[],
  groupBy: GroupBy,
  shut: ReadonlySet<string> = new Set(),
  snoozed = true,
): FlatItem[] =>
  groupBy === "status"
    ? sections(units, snoozed).flatMap((s): FlatItem[] => {
        const open = !shut.has(s.key);
        return [
          {
            kind: "section",
            id: `sec:${s.key}`,
            key: s.key,
            label: s.label,
            count: s.units.flatMap(everyThread).filter((t) => !isContext(t, s.statuses)).length,
            open,
            statuses: s.statuses,
          },
          ...(open ? s.units : []),
        ];
      })
    : units;

/**
 * The statuses of the section header above the item `i`. `null` without grouping, for a header, or for an item that
 * is not in `items`.
 */
export const sectionOf = (items: FlatItem[], i: FlatItem): Status[] | null => {
  const at = items.findIndex((x) => x.id === i.id);
  if (i.kind === "section" || at < 0) return null;
  const head = items.slice(0, at).findLast((x) => x.kind === "section");
  return head?.kind === "section" ? head.statuses : null;
};

/** The ids that a flat item puts in the row-order signature. */
export const itemIds = (i: FlatItem): string[] =>
  i.kind === "stack" ? [i.id, ...i.run.flatMap(allThreads).map((t) => t.id)] : [i.id];

/** The stored order key of the flat list. It is kept apart from the tree lists. */
export const FLAT = "flat";
/** The drag list of one status section. A row drags only inside its section. */
export const sectionList = (key: string) => `${FLAT}:${key}`;

/**
 * The drag lists of a flat sequence: all unit ids under `FLAT`, and the unit ids of each section header. A waiting
 * section has no list, and its units are not under `FLAT`, so its rows have no drag.
 */
export function flatLists(items: FlatItem[]): Map<string, string[]> {
  const lists = new Map<string, string[]>([[FLAT, []]]);
  let section: string[] | undefined;
  let waiting = false;
  for (const i of items) {
    if (i.kind === "section") {
      waiting = WAIT_SECTIONS.has(i.key);
      section = waiting ? undefined : [];
      if (section) lists.set(sectionList(i.key), section);
    } else if (!waiting) {
      lists.get(FLAT)!.push(i.id);
      section?.push(i.id);
    }
  }
  return lists;
}
