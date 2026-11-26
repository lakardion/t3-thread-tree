/** The pure model of the PR graph of a wayfinder map: nodes, edges, lanes and layout. */
import type { MapGraphData } from "./map-graph.ts";
import { bySince, type PrNode, type ThreadNode } from "./tree.ts";

/** A row passes when a key equals its head branch or starts it (`abc-12-x`), or the title has the key as a word. */
export function rowMatches(row: { head: string | null; title: string | null }, keys: string[]): boolean {
  const head = row.head?.toLowerCase() ?? "";
  return keys.some(
    (key) =>
      head === key.toLowerCase() ||
      head.startsWith(`${key.toLowerCase()}-`) ||
      new RegExp(`\\b${key}\\b`, "i").test(row.title ?? ""),
  );
}

/** `live`: a tree node that is not settled. */
export type GraphThread = { id: string; href: string; title: string; status: string; live: boolean };

export type GraphNode = PrNode & {
  /** First issue key of the head branch, else of the title, else the branch, else `#n`. */
  key: string;
  lane: number | null;
  outside: boolean;
  thread: GraphThread | null;
  col: number;
  row: number;
};

/** A foreign base: a branch that is neither `main` nor the head of a graph PR. */
export type BranchNode = { branch: string; col: number; row: number };

export type Edge = {
  from: number | "main" | { branch: string };
  to: number | { branch: string };
  kind: "stack" | "base" | "main" | "dim";
};

export type Anomaly = { text: string; prs: number[] };

export type PrGraph = {
  nodes: GraphNode[];
  branches: BranchNode[];
  edges: Edge[];
  anomalies: Anomaly[];
  noPr: GraphThread[];
};

type Member = { thread: GraphThread; createdAt: string | null; prs: PrNode[]; settled: boolean };
type Cand = { pr: PrNode; tier: number; threadId: string | null; threadHref: string | null };

const KEY = /\b[A-Z][A-Z0-9]*-\d+\b/i;
const keyOf = (s: string | null) => s?.match(KEY)?.[0].toUpperCase();

/** The thread nodes under `head`. A Map header and a run node leave out their subtree, and a member that heads a sub-map leaves out its children. */
const walk = (n: ThreadNode): ThreadNode[] =>
  n.children.flatMap((c) => (c.run || c.map?.header ? [] : [c, ...(c.map ? [] : walk(c))]));

export function buildPrGraph(head: ThreadNode, data: MapGraphData | null): PrGraph {
  const tree = walk(head).filter((t) => data || !t.settled);
  const treeIds = new Set(tree.map((t) => t.id));
  const members: Member[] = [
    ...tree.map((t) => ({
      thread: { id: t.id, href: t.href, title: t.title, status: t.status, live: !t.settled },
      createdAt: t.detail.createdAt,
      prs: t.prs,
      settled: t.settled,
    })),
    ...(data?.settled ?? [])
      .filter((s) => !treeIds.has(s.id))
      .map((s) => ({
        thread: { id: s.id, href: s.href, title: s.title, status: s.status, live: false },
        createdAt: s.createdAt,
        prs: s.prs,
        settled: true,
      })),
  ].toSorted((a, b) => bySince(a.createdAt, b.createdAt));

  const rows = data?.rows ?? [];
  const mates = data?.mates ?? [];
  const cands: Cand[] = [
    ...members.flatMap((m) => m.prs.map((pr) => ({ pr, tier: m.settled ? 3 : 1, threadId: null, threadHref: null }))),
    ...rows.map((pr) => ({ pr, tier: 2, threadId: pr.threadId, threadHref: pr.threadHref })),
    ...mates.map((pr) => ({ pr, tier: 4, threadId: pr.threadId, threadHref: pr.threadHref })),
  ].toSorted((a, b) => a.tier - b.tier);
  const best = new Map<number, Cand>();
  for (const c of cands) if (!best.has(c.pr.n)) best.set(c.pr.n, c);

  const byId = new Map(members.map((m) => [m.thread.id, m.thread]));
  const mateNumbers = new Set(mates.map((m) => m.n));
  const lanes = data?.lanes ?? [];
  const threadOf = (n: number): GraphThread | null => {
    const linked = members.find((m) => m.prs.some((p) => p.n === n));
    if (linked) return linked.thread;
    const ext = [...rows, ...mates].find((r) => r.n === n && r.threadId && r.threadHref);
    return ext
      ? (byId.get(ext.threadId!) ?? { id: ext.threadId!, href: ext.threadHref!, title: "", status: "", live: false })
      : null;
  };

  const nodes: GraphNode[] = [...best.values()].map(({ pr }) => {
    const lane =
      lanes.find((l) =>
        rowMatches(
          pr,
          l.keys.map((k) => k.key),
        ),
      )?.n ?? null;
    return {
      ...pr,
      key: keyOf(pr.head) ?? keyOf(pr.title) ?? pr.head ?? `#${pr.n}`,
      lane,
      outside: mateNumbers.has(pr.n) || (lane === null && lanes.length > 0),
      thread: threadOf(pr.n),
      col: 1,
      row: 0,
    };
  });

  const baseOf = (node: GraphNode): GraphNode | undefined =>
    nodes
      .filter((p) => p !== node && p.head === node.base)
      .toSorted(
        (a, b) =>
          Number(b.state === "open") - Number(a.state === "open") ||
          Number(b.state === "merged") - Number(a.state === "merged") ||
          b.n - a.n,
      )[0];

  const branches = new Map<string, BranchNode>();
  const edges: Edge[] = [];
  const children = new Map<string, GraphNode[]>();
  const vertex = (n: GraphNode) => `#${n.n}`;
  for (const node of nodes) {
    const dim = node.state !== "open";
    const parent = node.base && node.base !== "main" ? baseOf(node) : undefined;
    if (!node.base || node.base === "main") {
      edges.push({ from: "main", to: node.n, kind: dim ? "dim" : "main" });
      children.set("main", [...(children.get("main") ?? []), node]);
    } else if (parent) {
      const stack = parent.stack && node.stack && parent.stack.number === node.stack.number;
      edges.push({ from: parent.n, to: node.n, kind: dim ? "dim" : stack ? "stack" : "base" });
      children.set(vertex(parent), [...(children.get(vertex(parent)) ?? []), node]);
    } else {
      if (!branches.has(node.base)) {
        branches.set(node.base, { branch: node.base, col: 1, row: 0 });
        edges.push({ from: "main", to: { branch: node.base }, kind: "main" });
      }
      edges.push({ from: { branch: node.base }, to: node.n, kind: dim ? "dim" : "base" });
      children.set(`b:${node.base}`, [...(children.get(`b:${node.base}`) ?? []), node]);
    }
  }

  const order = (a: GraphNode, b: GraphNode) =>
    (a.lane ?? Infinity) - (b.lane ?? Infinity) || (a.stack?.pos ?? Infinity) - (b.stack?.pos ?? Infinity) || a.n - b.n;
  const seen = new Set<GraphNode>();
  let next = 0;
  const place = (kids: GraphNode[], branchKids: BranchNode[], col: number, row: number) => {
    const all = [...kids.toSorted(order), ...branchKids];
    all.forEach((k, i) => {
      const r = i === 0 ? row : ++next;
      if ("branch" in k) {
        k.col = col;
        k.row = r;
        place(children.get(`b:${k.branch}`) ?? [], [], col + 1, r);
      } else if (!seen.has(k)) {
        seen.add(k);
        k.col = col;
        k.row = r;
        place(children.get(vertex(k)) ?? [], [], col + 1, r);
      }
    });
  };
  place(
    children.get("main") ?? [],
    [...branches.values()].toSorted((a, b) => a.branch.localeCompare(b.branch)),
    1,
    0,
  );
  for (const n of nodes) {
    if (!seen.has(n)) {
      n.col = 1;
      n.row = ++next;
    }
  }

  return {
    nodes,
    branches: [...branches.values()],
    edges,
    anomalies: [],
    noPr: members.filter((m) => m.prs.length === 0).map((m) => m.thread),
  };
}
