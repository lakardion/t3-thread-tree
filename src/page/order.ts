import { arrayMove } from "@dnd-kit/helpers";

import { NO_KEY, REVIEWS, type Branch, type ThreadNode } from "../shared/tree.ts";
import { stackRuns } from "./format.ts";

/** The stored order: list key to the ids of that list. */
export type Orders = Record<string, string[]>;

/** What one list holds: a project or review group, a run of stacked key groups, or a thread. */
export type Unit = Branch | Branch[] | ThreadNode;

/** While a drag runs, the list `list` renders as `ids`; `units` keeps the units that a push removed. */
export type Freeze = { list: string; ids: string[]; units: Map<string, Unit> };

export type Arranged = {
  projects: Branch[];
  /** List key to the ids of that list, in render order. */
  lists: Map<string, string[]>;
  /** List key to id to unit, in the same order. */
  units: Map<string, Map<string, Unit>>;
};

export const PROJECTS = "projects";
export const groupsKey = (parentId: string) => `groups:${parentId}`;
export const threadsKey = (groupId: string) => `threads:${groupId}`;
export const threadUnitId = (t: ThreadNode) => `t:${t.id}`;
/** A stack run moves as one block, so it has one id. */
export const runUnitId = (projectId: string, run: Branch[]) =>
  run[0].stack ? `stack:${projectId}:${run[0].stack.id}` : run[0].id;

/** Reviews and No issue key: they stay after the key groups and do not move. */
export const isTail = (b: Branch): boolean => b.label === REVIEWS || b.label === NO_KEY;

const isRun = (u: Unit): u is Branch[] => Array.isArray(u);
const isBranch = (u: Unit): u is Branch => !Array.isArray(u) && "branches" in u;
const isThread = (u: Unit): u is ThreadNode => !Array.isArray(u) && "children" in u;
const groupIds = (u: Unit): string[] => (isRun(u) ? u.map((b) => b.id) : [u.id]);

/** The stored ids that still exist, in stored order, then the other items in base order. */
export function applyOrder<T>(items: T[], idOf: (t: T) => string, stored: string[] | undefined): T[] {
  if (!stored) return items;
  const byId = new Map(items.map((t) => [idOf(t), t]));
  const known = stored.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const placed = new Set(stored);
  return [...known, ...items.filter((t) => !placed.has(idOf(t)))];
}

/**
 * Renders the frozen list in its frozen order: a unit that a push removed stays in its slot, and a new unit goes last.
 * A frozen unit that no longer exists shows only when none of its groups sits in a current unit.
 */
function applyFreeze<T extends Unit>(
  items: T[],
  idOf: (t: T) => string,
  freeze: Freeze,
  fits: (u: Unit) => u is T,
): T[] {
  const byId = new Map(items.map((t) => [idOf(t), t]));
  const live = new Set(items.flatMap(groupIds));
  const kept: T[] = [];
  for (const id of freeze.ids) {
    const now = byId.get(id);
    const old = freeze.units.get(id);
    if (now) kept.push(now);
    else if (old && fits(old) && !groupIds(old).some((g) => live.has(g))) kept.push(old);
  }
  const placed = new Set(freeze.ids);
  return [...kept, ...items.filter((t) => !placed.has(idOf(t)))];
}

/**
 * The tree with the user order applied at each level, and the ids and units of each list.
 * Reviews and No issue key stay after the key groups. Subthreads keep the base order. The input is not changed.
 */
export function arrange(projects: Branch[], orders: Orders, freeze?: Freeze): Arranged {
  const lists = new Map<string, string[]>();
  const units = new Map<string, Map<string, Unit>>();
  const put = <T extends Unit>(key: string, items: T[], idOf: (t: T) => string, fits: (u: Unit) => u is T): T[] => {
    const ordered = applyOrder(items, idOf, orders[key]);
    const out = freeze?.list === key ? applyFreeze(ordered, idOf, freeze, fits) : ordered;
    lists.set(key, out.map(idOf));
    units.set(key, new Map(out.map((t) => [idOf(t), t])));
    return out;
  };
  const group = (b: Branch): Branch => ({
    ...b,
    threads: put(threadsKey(b.id), b.threads, threadUnitId, isThread),
  });
  const reviews = (b: Branch): Branch => ({
    ...b,
    branches: put(groupsKey(b.id), b.branches, (c) => c.id, isBranch).map(group),
  });
  const project = (p: Branch): Branch => {
    const tail = p.branches.filter(isTail);
    const keys = p.branches.filter((b) => !tail.includes(b));
    const runs = put(groupsKey(p.id), stackRuns(keys), (r) => runUnitId(p.id, r), isRun);
    return {
      ...p,
      branches: [...runs.flat().map(group), ...tail.map((b) => (b.label === REVIEWS ? reviews(b) : group(b)))],
    };
  };
  const ordered = put(PROJECTS, projects, (b) => b.id, isBranch).map(project);
  return { projects: ordered, lists, units };
}

/**
 * The new stored order after a drop. `visible` is the rendered list and `full` the whole list.
 * Hidden ids keep their slots, and ids that are not in `full` drop out.
 */
export function reorder(full: string[], visible: string[], from: number, to: number): string[] {
  const moved = arrayMove(visible, from, to).filter((id) => full.includes(id));
  const shown = new Set(visible);
  let next = 0;
  return full.map((id) => (shown.has(id) ? moved[next++] : id));
}

/** The stored orders from JSON text. Keeps only the entries that are arrays of strings. */
export function parseOrders(raw: string | null): Orders {
  try {
    const data: unknown = JSON.parse(raw ?? "{}");
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(
        (e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((id) => typeof id === "string"),
      ),
    );
  } catch {
    return {};
  }
}

/** Each stored list keeps only the ids that still exist. A list that no longer exists is removed. */
export function prune(orders: Orders, lists: Map<string, string[]>): Orders {
  return Object.fromEntries(
    Object.entries(orders).flatMap(([key, ids]) => {
      const live = lists.get(key);
      return live ? [[key, ids.filter((id) => live.includes(id))]] : [];
    }),
  );
}
