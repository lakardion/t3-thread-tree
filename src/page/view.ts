import { NEEDS_YOU } from "../shared/status.ts";
import {
  allRuns,
  allThreads,
  bySince,
  flat,
  isThread,
  runsOf,
  type Group,
  type Status,
  type ThreadNode,
} from "../shared/tree.ts";
import { stackRuns } from "./format.ts";
import { pinFirst, pinIdOf, pinnedList, runUnitId, unitPinId } from "./order.ts";

export type SortBy = "manual" | "updated";
export type Layout = "tree" | "flat";
export type GroupBy = "none" | "status" | "linear";

/** The Last run of a node as a time: a thread's `lastRun`, else its creation; a run node's `updatedAt`. `-Infinity` for a Map header or a bad value. */
export function lastRunOf(t: ThreadNode): number {
  if (t.map?.header) return -Infinity;
  const at = Date.parse((t.run ? t.updatedAt : (t.lastRun ?? t.detail.createdAt)) ?? "");
  return Number.isNaN(at) ? -Infinity : at;
}

/** The nodes whose time counts: settled ones only when all are settled; snoozed ones only when `snoozed` is on, or when all left are snoozed. */
export function counted(ts: ThreadNode[], snoozed: boolean): ThreadNode[] {
  const live = ts.filter((t) => !t.settled);
  const open = live.length > 0 ? live : ts;
  if (snoozed) return open;
  const awake = open.filter((t) => t.status !== "snoozed");
  return awake.length > 0 ? awake : open;
}

/** A time, with the node that gives it. `by` is null when there is none. */
export type Time = { at: number; by: ThreadNode | null };

/** The newest Last run over the counted nodes. The first node wins a tie. */
export function newest(ts: ThreadNode[], snoozed: boolean): Time {
  return counted(ts, snoozed).reduce<Time>((m, t) => (lastRunOf(t) > m.at ? { at: lastRunOf(t), by: t } : m), {
    at: -Infinity,
    by: null,
  });
}

/** The time of a row: the newest Last run of its block. A run nests only at the top level or under a run, so it never lifts a thread's block. */
export const blockTime = (t: ThreadNode, snoozed: boolean): Time => newest([...flat(t), ...runsOf(t)], snoozed);

/** The hover of a row age: what the time is, and the thread that gives it when that is not the row. */
export function ageTip(t: ThreadNode, { at, by }: Time): string | undefined {
  if (!by) return undefined;
  const what = by.run || by.lastRun ? "Last run" : "Created";
  return `${what} ${new Date(at).toLocaleString()}${by.id === t.id ? "" : ` · ${by.title}`}`;
}

/** The hover of a header, which shows no age: "Last run <date> · <title>". */
export const headerTip = ({ at, by }: Time): string | undefined =>
  by ? `Last run ${new Date(at).toLocaleString()} · ${by.title}` : undefined;

/** The time of a list of groups: a key group, a Reviews subgroup, a stack run or a map block. */
export const groupTime = (bs: Group[], snoozed: boolean): Time =>
  newest(
    bs.flatMap((b) => [...allThreads(b), ...allRuns(b)]),
    snoozed,
  );

/** Stable sort, newest first. */
export const byNewest = <T>(items: T[], by: (t: T) => number): T[] =>
  items.toSorted((a, b) => Number(by(b) > by(a)) - Number(by(b) < by(a)));

/**
 * Sorts an arranged tree by Last run (`snoozed`: whether snoozed threads count). Top-level items keep their order.
 * In every container, the groups, stack runs and loose threads sort together, newest first; a stack run moves as one
 * block and keeps its inner order. A key group sorts its threads. Milestones of a Linear project keep their order.
 * Subthreads keep their order. Ties keep the input order. The input is not changed.
 * A pinned item leads its list; pins sort among themselves.
 */
export function sortTree(projects: Group[], snoozed = true, pins: ReadonlySet<string> = new Set()): Group[] {
  const sortGroup = (b: Group): Group =>
    b.kind === "key"
      ? {
          ...b,
          threads: pinFirst(
            byNewest(b.threads, (t) => blockTime(t, snoozed).at),
            pinIdOf,
            pins,
          ),
        }
      : b.kind === "loose" || b.kind === "stack"
        ? b
        : sortList(b);
  const sortList = (b: Group): Group => ({
    ...b,
    groups: pinFirst(
      byNewest(stackRuns(b.groups), (run) => groupTime(run, snoozed).at),
      (run) => unitPinId(runUnitId(b.id, run), run),
      pins,
    ).flatMap((run) => (run[0].stack ? run : run.map(sortGroup))),
  });
  return projects.map((p) =>
    p.kind === "loose" ? p : p.kind === "linear-project" ? { ...p, groups: p.groups.map(sortList) } : sortList(p),
  );
}

/** The `view-transition-name` of a thread row (`t`), a stack rail (`s`) or a section header (`sec`). */
export const vtName = (kind: "t" | "s" | "sec", id: string): string => `${kind}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** One row of the flat list: a thread, or a PR stack that moves as one block. */
export type FlatUnit =
  | { kind: "thread"; id: string; t: ThreadNode; project: Group; review: boolean }
  | { kind: "stack"; id: string; run: Group[]; project: Group };

export type FlatItem =
  | FlatUnit
  | {
      kind: "section";
      id: string;
      key: string;
      label: string;
      count: number;
      open: boolean;
      statuses: Status[] | null;
      date?: string | null;
      loose?: true;
    };

/** The pin id of a flat unit: a thread pins as in the tree, a stack by its unit id. */
export const flatPinId = (u: FlatUnit): string => (u.kind === "thread" ? pinIdOf(u.t) : u.id);

const stackUnit = (run: Group[], project: Group): FlatUnit => ({
  kind: "stack",
  id: `stack:${project.id}:${run[0].stack!.id}`,
  run,
  project,
});

const threadUnit = (t: ThreadNode, project: Group, review: boolean): FlatUnit => ({
  kind: "thread",
  id: `t:${t.id}`,
  t,
  project,
  review,
});

/**
 * The units of an arranged tree, in order: per top-level item, a stack run (one unit), other groups walked in
 * order, then the threads of the item. Subthreads stay in `t.children`.
 */
export function flatten(projects: Group[]): FlatUnit[] {
  return projects.flatMap((p) => {
    const walk = (b: Group, review: boolean): FlatUnit[] => [
      ...stackRuns(b.groups).flatMap((run): FlatUnit[] =>
        run[0].stack ? [stackUnit(run, p)] : run.flatMap((g) => walk(g, review || g.kind === "review")),
      ),
      ...b.threads.map((t) => threadUnit(t, p, review)),
    ];
    return walk(p, p.kind === "review");
  });
}

/** All threads of a unit, subthreads at any depth. */
const everyThread = (u: FlatUnit): ThreadNode[] => (u.kind === "thread" ? flat(u.t) : u.run.flatMap(allThreads));

/** `everyThread` with the run nodes: the nodes that place a unit by status. */
const placing = (u: FlatUnit): ThreadNode[] => (u.kind === "thread" ? [...flat(u.t), ...runsOf(u.t)] : everyThread(u));

/**
 * The threads that place and sort a unit: all its threads, subthreads at any depth, without the settled ones.
 * When all are settled, all of them.
 */
const unitThreads = (u: FlatUnit): ThreadNode[] => {
  const all = placing(u);
  const live = all.filter((t) => !t.settled);
  return live.length > 0 ? live : all;
};

/** Sorts units across projects, newest first. A stack counts its newest thread. Ties keep the input order. */
export const sortFlat = (units: FlatUnit[], snoozed = true): FlatUnit[] =>
  byNewest(units, (u) => (u.kind === "thread" ? blockTime(u.t, snoozed) : groupTime(u.run, snoozed)).at);

/** The status sections, most urgent first. */
export const SECTIONS: [key: string, label: string, statuses: Status[]][] = [
  ["needs-input", "Needs input", ["needs-input"]],
  ["plan-ready", "Plan ready", ["plan-ready"]],
  ["your-turn", "Your turn", ["your-turn"]],
  ["failed", "Failed", ["failed", "interrupted"]],
  ["working", "Working", ["working", "starting", "blocked"]],
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
export const WAIT_SECTIONS = new Set<string>(NEEDS_YOU);

/** The oldest `since` of the unit threads that are in `statuses`. `null` when none has one. */
const waitOf = (u: FlatUnit, statuses: Status[]): string | null =>
  unitThreads(u)
    .filter((t) => statuses.includes(t.status))
    .map((t) => t.since)
    .toSorted(bySince)[0] ?? null;

type Section = {
  key: string;
  label: string;
  statuses: Status[] | null;
  date?: string | null;
  loose?: true;
  units: FlatUnit[];
};

/**
 * Groups units by status, in section order, and drops empty sections. A unit goes by its most urgent thread,
 * subthreads included. Units keep their input order, except in a waiting section: there the oldest Wait comes
 * first, units with no Wait last, and ties keep the input order. With `snoozed` false, the snoozed status is in no
 * section: a snoozed thread does not place its unit. A pinned unit leads a waiting section.
 */
export function sections(units: FlatUnit[], snoozed = true, pins: ReadonlySet<string> = new Set()): Section[] {
  const list = SECTIONS.map(([key, label, statuses]): [string, string, Status[]] => [
    key,
    label,
    snoozed ? statuses : statuses.filter((s) => s !== "snoozed"),
  ]);
  const indexOf = (st: Status) => list.findIndex(([, , statuses]) => statuses.includes(st));
  const placed = (ts: ThreadNode[]) => ts.map((t) => indexOf(t.status)).filter((n) => n >= 0);
  const at = (u: FlatUnit) => {
    const own = placed(unitThreads(u));
    return Math.min(...(own.length > 0 ? own : placed(placing(u))));
  };
  return list
    .map(([key, label, statuses], i) => {
      const inSection = units.filter((u) => at(u) === i);
      return {
        key,
        label,
        statuses,
        units: WAIT_SECTIONS.has(key)
          ? pinFirst(
              inSection.toSorted((a, b) => bySince(waitOf(a, statuses), waitOf(b, statuses))),
              flatPinId,
              pins,
            )
          : inSection,
      };
    })
    .filter((s) => s.units.length > 0);
}

/** The top-level nodes of a branch and its subgroups. */
const tops = (b: Group): ThreadNode[] => [...b.groups.flatMap(tops), ...b.threads];

/**
 * The Linear sections of an arranged Linear tree, in tree order: one per milestone, labelled "Project · Milestone",
 * and one per other top-level item. Adjacent loose items make one section with no label. A section takes the units whose thread sits in it, in unit order. Empty sections drop.
 */
export function linearSections(projects: Group[], units: FlatUnit[]): Section[] {
  return projects
    .flatMap((p): [Group, string, string | null][] =>
      p.kind === "linear-project"
        ? p.groups.map((m) => [m, `${p.label} · ${m.label}`, m.linear?.date ?? null])
        : [[p, p.label, null]],
    )
    .map(([b, label, date]): Section => {
      const held = new Set(tops(b).map((t) => t.id));
      return {
        key: b.id,
        label,
        statuses: null,
        date,
        ...(b.kind === "loose" && { loose: true as const }),
        units: units.filter((u) =>
          [...placing(u), ...(u.kind === "thread" && !isThread(u.t) ? [u.t] : [])].some((t) => held.has(t.id)),
        ),
      };
    })
    .filter((s) => s.units.length > 0)
    .reduce<Section[]>((out, s) => {
      const last = out.at(-1);
      if (s.loose && last?.loose) last.units.push(...s.units);
      else out.push(s);
      return out;
    }, []);
}

const groupSections = (
  units: FlatUnit[],
  groupBy: GroupBy,
  snoozed: boolean,
  projects: Group[],
  pins: ReadonlySet<string>,
): Section[] => (groupBy === "linear" ? linearSections(projects, units) : sections(units, snoozed, pins));

/** True when the thread is a context row in a section of `statuses`: it is settled or has another status. */
export const isContext = (t: ThreadNode, statuses: Status[]): boolean => t.settled || !statuses.includes(t.status);

/** True when a stack row folds in a section of `statuses`: it and all its subthreads are context rows. */
export const folds = (t: ThreadNode, statuses: Status[]): boolean => flat(t).every((x) => isContext(x, statuses));

/**
 * The flat sequence: the units, or section headers each followed by its units. A header counts the threads that
 * match its section, subthreads included. Context rows are not counted. A Linear section has no statuses: it counts
 * all threads of its units. A section in `shut` keeps its header and count and gives no units. `shut` does nothing
 * without grouping. A loose section has no label: the page shows no header for it, and it never shuts.
 */
export const sequence = (
  units: FlatUnit[],
  groupBy: GroupBy,
  shut: ReadonlySet<string> = new Set(),
  snoozed = true,
  projects: Group[] = [],
  pins: ReadonlySet<string> = new Set(),
): FlatItem[] =>
  groupBy !== "none"
    ? groupSections(units, groupBy, snoozed, projects, pins).flatMap((s): FlatItem[] => {
        const open = !!s.loose || !shut.has(s.key);
        return [
          {
            kind: "section",
            id: `sec:${s.key}`,
            key: s.key,
            label: s.label,
            count: s.units.flatMap(everyThread).filter((t) => !s.statuses || !isContext(t, s.statuses)).length,
            open,
            statuses: s.statuses,
            date: s.date,
            ...(s.loose && { loose: true as const }),
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
 * section has no list, and its units are not under `FLAT`, so its rows have no drag. A pinned unit goes to the
 * pinned part of both lists, which exists only when it holds a unit.
 */
export function flatLists(items: FlatItem[], pins: ReadonlySet<string> = new Set()): Map<string, string[]> {
  const lists = new Map<string, string[]>([[FLAT, []]]);
  let section: string | undefined;
  let waiting = false;
  const add = (list: string, id: string) => {
    if (!lists.has(list)) lists.set(list, []);
    lists.get(list)!.push(id);
  };
  for (const i of items) {
    if (i.kind === "section") {
      waiting = WAIT_SECTIONS.has(i.key);
      section = waiting ? undefined : sectionList(i.key);
      if (section) lists.set(section, []);
    } else if (!waiting) {
      const pinned = pins.has(flatPinId(i));
      add(pinned ? pinnedList(FLAT) : FLAT, i.id);
      if (section) add(pinned ? pinnedList(section) : section, i.id);
    }
  }
  return lists;
}

/** The ids of the Map heads above thread `id` inside the top-level node `t`. */
const mapHeadsTo = (t: ThreadNode, id: string): string[] =>
  t.children.some((c) => flat(c).some((x) => x.id === id))
    ? [...(t.map ? [t.id] : []), ...t.children.flatMap((c) => mapHeadsTo(c, id))]
    : [];

/**
 * The fold ids to open so that the row of thread `id` shows in the tree: every branch on the path to it, from the
 * project down, the rail of each PR stack on the path, and the Map heads above it. Empty when the thread is not in `projects`.
 */
export function pathFolds(projects: Group[], id: string): string[] {
  const walk = (b: Group): Group[] | null => {
    if (b.threads.some((t) => flat(t).some((x) => x.id === id))) return [b];
    for (const c of b.groups) {
      const path = walk(c);
      if (path) return [b, ...path];
    }
    return null;
  };
  for (const p of projects) {
    const path = walk(p);
    if (path)
      return [
        ...path.flatMap((b) => (b.kind === "loose" ? [] : b.stack ? [b.id, `rail:${b.stack.id}`] : [b.id])),
        ...path.at(-1)!.threads.flatMap((t) => mapHeadsTo(t, id)),
      ];
  }
  return [];
}

/** The key of the section whose unit holds thread `id`, subthreads at any depth. Null when no section does. */
export const sectionHolding = (
  units: FlatUnit[],
  snoozed: boolean,
  id: string,
  groupBy: GroupBy = "status",
  projects: Group[] = [],
): string | null =>
  groupSections(units, groupBy, snoozed, projects, new Set()).find((s) =>
    s.units.some((u) => everyThread(u).some((t) => t.id === id)),
  )?.key ?? null;
