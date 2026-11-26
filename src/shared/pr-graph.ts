/** The pure model of the PR graph of a wayfinder map: nodes, edges, lanes and layout. */
import type { MapLane } from "../server/map-md.ts";
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

type AnomalyCtx = {
  nodes: GraphNode[];
  edges: Edge[];
  data: MapGraphData | null;
  mateNumbers: Set<number>;
  memberKeys: string[];
};

const open = (n: GraphNode) => n.state === "open";
const nums = (ns: GraphNode[]) => ns.map((n) => n.n);
const refs = (ns: GraphNode[]) => nums(ns).map((n) => `#${n}`);

const fanOut = ({ nodes, data }: AnomalyCtx): Anomaly[] =>
  Object.entries(
    Object.groupBy(
      nodes.filter((n) => open(n) && n.base && n.base !== "main"),
      (n) => n.base!,
    ),
  ).flatMap(([base, kids = []]) =>
    kids.length < 2
      ? []
      : [
          {
            text: `${base} has ${kids.length} open children${
              kids.every((k) =>
                data?.lanes?.some((l) => l.keys.some((key) => key.base === base && rowMatches(k, [key.key]))),
              )
                ? " (planned)"
                : ""
            }`,
            prs: nums(kids),
          },
        ],
  );

const closedParent = ({ nodes, edges }: AnomalyCtx): Anomaly[] =>
  edges.flatMap((e) => {
    const parent = nodes.find((n) => n.n === e.from);
    const child = nodes.find((n) => n.n === e.to);
    return parent?.state === "closed" && child && open(child)
      ? [{ text: `#${parent.n} is closed, but #${child.n} builds on it`, prs: [parent.n, child.n] }]
      : [];
  });

const conflicts = ({ nodes }: AnomalyCtx): Anomaly[] =>
  nodes.filter((n) => open(n) && n.conflicting).map((n) => ({ text: `#${n.n} has conflicts`, prs: [n.n] }));

const foreignBase = ({ nodes, edges }: AnomalyCtx): Anomaly[] =>
  edges.flatMap((e) => {
    const node = typeof e.from === "object" && nodes.find((n) => n.n === e.to);
    return node ? [{ text: `#${node.n} is based on ${node.base}, which is not main or a map PR`, prs: [node.n] }] : [];
  });

const behindBase = ({ nodes, data }: AnomalyCtx): Anomaly[] =>
  nodes
    .filter((n) => open(n) && n.stack && (data?.behind[n.n] ?? 0) > 0)
    .map((n) => ({ text: `#${n.n} is ${data!.behind[n.n]} commits behind its base`, prs: [n.n] }));

const noThread = ({ nodes, mateNumbers }: AnomalyCtx): Anomaly[] =>
  nodes
    .filter((n) => open(n) && !n.thread && !mateNumbers.has(n.n))
    .map((n) => ({ text: `#${n.n} has no thread`, prs: [n.n] }));

const stoppedThread = ({ nodes }: AnomalyCtx): Anomaly[] =>
  nodes
    .filter((n) => open(n) && n.thread?.live && ["failed", "interrupted"].includes(n.thread.status))
    .map((n) => ({ text: `#${n.n}: its thread stopped`, prs: [n.n] }));

/** The key of the node in an explicit lane, with the base that its lane gives. */
const laneKeyOf = (node: GraphNode, lanes: MapLane[]) => {
  const lane = lanes.find((l) => l.n === node.lane && l.explicit);
  const key = lane?.keys.find((k) => rowMatches(node, [k.key]));
  return lane && key ? { lane, key } : null;
};

const offLaneChain = ({ nodes, data }: AnomalyCtx): Anomaly[] => {
  const live = (k: string) => nodes.filter((n) => n.state !== "closed" && rowMatches(n, [k]));
  return nodes.flatMap((node) => {
    const found = open(node) && laneKeyOf(node, data?.lanes ?? []);
    if (!found) return [];
    const { lane, key } = found;
    const base = node.base ?? "main";
    const prev = lane.keys.some((k) => k.key === key.base) ? live(key.base) : null;
    const ok = [
      ...live(key.key)
        .filter((n) => n !== node)
        .map((n) => n.head),
      ...(prev ? prev.map((n) => n.head) : [key.base]),
      ...(key.base === "main" || prev?.every((n) => n.state === "merged") ? ["main"] : []),
    ];
    return ok.includes(base)
      ? []
      : [{ text: `#${node.n} is based on ${base}; the lane says ${key.base}`, prs: [node.n] }];
  });
};

const stackAcrossLanes = ({ nodes, data }: AnomalyCtx): Anomaly[] =>
  Object.values(
    Object.groupBy(
      nodes.filter((n) => n.stack && laneKeyOf(n, data?.lanes ?? [])),
      (n) => n.stack!.number,
    ),
  ).flatMap((group = []) => {
    const lanes = [...new Set(group.map((n) => n.lane!))].toSorted((a, b) => a - b);
    return lanes.length < 2
      ? []
      : [
          {
            text: `Stack #${group[0].stack!.number} spans lanes ${lanes.map((l) => `L${l}`).join(", ")}`,
            prs: nums(group),
          },
        ];
  });

const keyWithSeveralPrs = ({ nodes, data, memberKeys }: AnomalyCtx): Anomaly[] =>
  [...new Set([...(data?.lanes ?? []).flatMap((l) => l.keys.map((k) => k.key.toUpperCase())), ...memberKeys])].flatMap(
    (key) => {
      const all = nodes.filter((n) => rowMatches(n, [key]));
      const live = all.filter((n) => n.state !== "closed");
      const closed = all.filter((n) => n.state === "closed");
      return live.length < 2
        ? []
        : [
            {
              text: `${key} has ${live.length} PRs: ${refs(live).join(", ")}${closed.length ? ` (closed: ${refs(closed).join(", ")})` : ""}`,
              prs: nums(all),
            },
          ];
    },
  );

const missingFromStacks = ({ nodes, data }: AnomalyCtx): Anomaly[] =>
  data?.stacks
    ? nodes
        .filter((n) => open(n) && n.stack && !data.stacks!.some((s) => s.prs.includes(n.n)))
        .map((n) => ({ text: `#${n.n} is in a stack, but not in Stacks`, prs: [n.n] }))
    : [];

const findAnomalies = (ctx: AnomalyCtx): Anomaly[] =>
  [
    fanOut,
    closedParent,
    conflicts,
    foreignBase,
    behindBase,
    noThread,
    stoppedThread,
    offLaneChain,
    stackAcrossLanes,
    keyWithSeveralPrs,
    missingFromStacks,
  ].flatMap((rule) => rule(ctx));

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

  /** The merged members of each stack, in stack order. They share the spot of the last one, ahead of the open rest. */
  const piles = Map.groupBy(
    nodes.filter((n) => n.state === "merged" && n.stack).toSorted((a, b) => a.stack!.pos - b.stack!.pos),
    (n) => n.stack!.number,
  );

  /** A merged pile member is hidden behind the top of its pile, which owns the pile's edges. */
  const pileTop = (n: GraphNode) => {
    const pile = n.stack && piles.get(n.stack.number);
    return pile?.includes(n) ? pile.at(-1)! : n;
  };

  const branches = new Map<string, BranchNode>();
  const edges: Edge[] = [];
  const children = new Map<string, GraphNode[]>();
  const vertex = (n: GraphNode) => `#${n.n}`;
  for (const node of nodes) {
    const pile = node.stack ? piles.get(node.stack.number) : undefined;
    const top = pile?.at(-1);
    const inPile = pile?.includes(node);
    if (inPile && node !== top) continue;
    const dim = node.state !== "open";
    const toMain = inPile || !node.base || node.base === "main";
    const found = toMain ? undefined : baseOf(node);
    const parent = top && !inPile && toMain ? top : found && pileTop(found);
    if (!parent && toMain) {
      edges.push({ from: "main", to: node.n, kind: dim ? "dim" : "main" });
      children.set("main", [...(children.get("main") ?? []), node]);
    } else if (parent) {
      const stack = parent.stack && node.stack && parent.stack.number === node.stack.number;
      edges.push({ from: parent.n, to: node.n, kind: dim ? "dim" : stack ? "stack" : "base" });
      children.set(vertex(parent), [...(children.get(vertex(parent)) ?? []), node]);
    } else {
      const base = node.base!;
      if (!branches.has(base)) {
        branches.set(base, { branch: base, col: 1, row: 0 });
        edges.push({ from: "main", to: { branch: base }, kind: "main" });
      }
      edges.push({ from: { branch: base }, to: node.n, kind: dim ? "dim" : "base" });
      children.set(`b:${base}`, [...(children.get(`b:${base}`) ?? []), node]);
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
  for (const pile of piles.values()) {
    for (const n of pile) {
      Object.assign(n, { col: pile.at(-1)!.col, row: pile.at(-1)!.row });
      seen.add(n);
    }
  }
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
    anomalies: findAnomalies({
      nodes,
      edges,
      data,
      mateNumbers,
      memberKeys: members.map((m) => keyOf(m.thread.title)).filter((k) => k !== undefined),
    }),
    noPr: members.filter((m) => m.prs.length === 0).map((m) => m.thread),
  };
}

/** Card height. */
export const NH = 92;
/** Vertical gap between rows. */
export const GY = 14;
/** Gap between the cards of an open pile. */
export const PILE_GAP = 4;

/** How far an open pile of `count` cards on `row` moves up to center on its deck, without leaving the canvas top. */
export const pileLift = (row: number, count: number): number =>
  Math.min(((count - 1) * (NH + PILE_GAP)) / 2, row * (NH + GY));

/** What hover focuses for a PR: its lane, else the focus of the PR it builds on, else its own chain root. A branch pill has none. */
export function focusOf(graph: PrGraph, to: Edge["to"]): string | null {
  if (typeof to !== "number") return null;
  const own = graph.nodes.find((n) => n.n === to)!.lane;
  if (own !== null) return `L${own}`;
  const from = graph.edges.find((e) => e.to === to)?.from;
  return typeof from === "number" ? focusOf(graph, from) : `#${to}`;
}
