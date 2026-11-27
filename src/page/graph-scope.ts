import { isGraphMember } from "../shared/pr-graph-data.ts";
import type { GraphPr } from "../shared/pr-graph-data.ts";
import { stackKey, walk } from "../shared/pr-graph.ts";
import { allThreads, NO_PROJECT, type Group, type PrNode, type ThreadNode } from "../shared/tree.ts";
import { applyOrder, PROJECTS, pinnedList, type Orders } from "./order.ts";

/** The band id of the threads with no project. */
export const NONE = "none";

type Project = { id: string; label: string };

/** One band of the PR graph: a T3 project. `threads` are all its live threads that are not settled or step threads, with a PR or not. */
export type Band = Project & { members: ThreadNode[]; threads: ThreadNode[] };

/**
 * The T3 project of a thread: its own `t3Project` (Linear tree), else the project group that holds it.
 * A project whose label equals its id has no known project in T3; the match is a heuristic.
 */
function projectOf(t: ThreadNode, group: Project | undefined): Project {
  const p = t.t3Project ?? group;
  return !p || p.label === p.id ? { id: NONE, label: NO_PROJECT } : p;
}

const groupProject = (g: Group): Project | undefined =>
  g.id.startsWith("p:") ? { id: g.id.slice(2), label: g.label } : undefined;

/** The bands of a raw tree (the project tree or the Linear tree), with the graph members of each project. */
export function bandsOf(projects: Group[]): Band[] {
  const bands = new Map<string, Band>();
  for (const g of projects)
    for (const t of allThreads(g)) {
      if (t.settled || t.step) continue;
      const p = projectOf(t, groupProject(g));
      const band = bands.get(p.id) ?? { ...p, members: [], threads: [] };
      bands.set(p.id, band);
      band.threads.push(t);
      if (isGraphMember({ live: true, settled: t.settled, step: !!t.step, prs: t.prs })) band.members.push(t);
    }
  return [...bands.values()];
}

/** `hasPrs`: a member of the map in the tree links a PR. */
export type MapEntry = { key: string; name: string; head: ThreadNode; project: Project; hasPrs: boolean };

/** Every map of a raw tree, by name: a map thread row or a Map header, with the project of its thread. */
export function mapsOf(projects: Group[]): MapEntry[] {
  const maps = new Map<string, MapEntry>();
  const down = (t: ThreadNode, inherited: Project) => {
    const project = t.t3Project ? projectOf(t, undefined) : inherited;
    if (t.map?.key)
      maps.set(t.map.key, {
        key: t.map.key,
        name: t.map.name,
        head: t,
        project,
        hasPrs: walk(t).some((m) => m.prs.length > 0),
      });
    for (const c of t.children) down(c, project);
  };
  for (const g of projects) {
    const own = groupProject(g);
    const walkGroup = (x: Group) => {
      x.groups.forEach(walkGroup);
      x.threads.forEach((t) => down(t, projectOf(t, own)));
    };
    walkGroup(g);
  }
  return [...maps.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

const mateKey = (p: PrNode) => p.stack && stackKey({ repository: p.repository, stack: p.stack });

/** The mates that sit in a stack of the band PRs. `mates` of the route holds those of every band. */
export function bandMates(mates: GraphPr[], prs: PrNode[]): GraphPr[] {
  const stacks = new Set(prs.map(mateKey).filter(Boolean));
  return mates.filter((m) => stacks.has(mateKey(m)));
}

export const GRAPH_SORTS = ["title", "open", "tree"] as const;
export type GraphSort = (typeof GRAPH_SORTS)[number];

/**
 * The band ids in tree order: pinned projects first, then the stored `projects` list of the tree order.
 * It reads the store, not the visible tree, so it holds in the Linear tree and the flat view.
 */
export function treeOrder(orders: Orders, pins: ReadonlySet<string>): string[] {
  const pinned = applyOrder(
    [...pins].filter((id) => id.startsWith("p:")),
    (id) => id,
    orders[pinnedList(PROJECTS)],
  );
  return [...new Set([...pinned, ...(orders[PROJECTS] ?? [])])]
    .filter((id) => id.startsWith("p:"))
    .map((id) => id.slice(2));
}

/** The bands in graph sort order. "No project" is always last. `open` counts the open PRs of a band. */
export function sortBands<T extends Project>(
  bands: T[],
  sort: GraphSort,
  open: (b: T) => number,
  order: string[],
): T[] {
  const byTitle = (a: T, b: T) => a.label.localeCompare(b.label);
  const rank = (b: T) => {
    const i = order.indexOf(b.id);
    return i < 0 ? order.length : i;
  };
  const cmp = (a: T, b: T) =>
    sort === "open"
      ? open(b) - open(a) || byTitle(a, b)
      : sort === "tree"
        ? rank(a) - rank(b) || byTitle(a, b)
        : byTitle(a, b);
  return [...bands.filter((b) => b.id !== NONE).toSorted(cmp), ...bands.filter((b) => b.id === NONE)];
}

/** True when every word of `query` is a substring of "PR graph", so the Find action shows. A blank query matches. */
export const graphActionMatches = (query: string): boolean =>
  query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => "pr graph".includes(w));
