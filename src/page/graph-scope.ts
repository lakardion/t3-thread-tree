import { isGraphMember } from "../shared/pr-graph-data.ts";
import type { GraphPr } from "../shared/pr-graph-data.ts";
import { stackKey, walk } from "../shared/pr-graph.ts";
import { allThreads, bySince, isThread, NO_PROJECT, type Group, type PrNode, type ThreadNode } from "../shared/tree.ts";
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
export function projectOf(t: ThreadNode, group: Project | undefined): Project {
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

/** `heads`: every anchor of the key in the tree, oldest first. `members`: the threads of all heads. `hasPrs`: a member links a PR. */
export type MapEntry = {
  key: string;
  name: string;
  heads: ThreadNode[];
  members: ThreadNode[];
  project: Project;
  hasPrs: boolean;
};

/** A Lineage group with no map key. `members` holds the head (unless it is a header) and every thread below it. */
export type LineageEntry = { name: string; head: ThreadNode; project: Project; members: ThreadNode[]; hasPrs: boolean };

/** The thread nodes below `n`, through headers and sub-map heads. A run node leaves out its subtree. */
const walkAll = (n: ThreadNode): ThreadNode[] =>
  n.children.flatMap((c) => (c.run ? [] : [...(isThread(c) ? [c] : []), ...walkAll(c)]));

/** Every node of a raw tree with the project it sits in. */
function eachNode(projects: Group[], visit: (t: ThreadNode, project: Project) => void) {
  const down = (t: ThreadNode, inherited: Project) => {
    const project = t.t3Project ? projectOf(t, undefined) : inherited;
    visit(t, project);
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
}

/** Every map of a raw tree, by name: a map thread row or a Map header. A key under several heads lists them all. */
export function mapsOf(projects: Group[]): MapEntry[] {
  const found = new Map<
    string,
    { name: string; heads: { t: ThreadNode; project: Project; oldest: string | null }[] }
  >();
  eachNode(projects, (t, project) => {
    if (!t.map?.key) return;
    const oldest =
      walk(t)
        .map((m) => m.detail.createdAt)
        .filter((c) => c !== null)
        .toSorted()[0] ?? null;
    const entry = found.get(t.map.key) ?? { name: t.map.name, heads: [] };
    found.set(t.map.key, entry);
    entry.heads.push({ t, project, oldest });
  });
  return [...found]
    .map(([key, { name, heads }]) => {
      const sorted = heads.toSorted((a, b) => bySince(a.oldest, b.oldest));
      const members = [...new Map(sorted.flatMap((h) => walk(h.t)).map((m) => [m.id, m])).values()];
      return {
        key,
        name,
        heads: sorted.map((h) => h.t),
        members,
        project: sorted[0].project,
        hasPrs: members.some((m) => m.prs.length > 0),
      };
    })
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

const lineageMembers = (head: ThreadNode) => [...(isThread(head) ? [head] : []), ...walkAll(head)];
const livePrs = (members: ThreadNode[]) => members.some((m) => !m.settled && m.prs.length > 0);

/** Every Lineage group with no map key, with the project of its head. */
export function lineagesOf(projects: Group[]): LineageEntry[] {
  const out: LineageEntry[] = [];
  eachNode(projects, (t, project) => {
    if (!t.map?.root || t.map.key) return;
    const members = lineageMembers(t);
    out.push({ name: t.map.name, head: t, project, members, hasPrs: livePrs(members) });
  });
  return out;
}

/** The scope id of the PR graph button of a group head: its map, else its Lineage group when a live member links a PR. */
export function lineageScope(t: ThreadNode): string | null {
  if (t.map?.key) return `map:${t.map.key}`;
  return t.map?.root && livePrs(lineageMembers(t)) ? `lineage:${t.id}` : null;
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
