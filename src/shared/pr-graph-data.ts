import type { MapLane } from "../server/map-md.ts";
import type { PrNode } from "./tree.ts";

export type GraphPr = PrNode & { threadId: string | null; threadHref: string | null };

/** The group part of a `PrGraphData`. */
export type GroupGraphPart = {
  lanes: MapLane[] | null;
  /** `## Stacks` chains, bottom first. Null with no such section. */
  stacks: { prs: number[] }[] | null;
  /** The settled and archived members. */
  settled: {
    id: string;
    title: string;
    status: string;
    createdAt: string | null;
    href: string;
    prs: PrNode[];
    /** The T3 project of the thread, for its band at lineage scope. */
    projectId: string;
  }[];
  /** The key query rows that passed the filter, each with the project of its key query. */
  rows: (GraphPr & { projectId: string })[];
  /** The key queries that failed. */
  errors: { key: string; text: string }[];
};

/** The answer of `GET /pr-graph`: the parts of the PR graph that the tree does not hold. */
export type PrGraphData = {
  /** ISO time of the slow calls. */
  at: string;
  /** Project id (`none` for No project) to root branch. No entry when git gave none. */
  roots: Record<string, string>;
  /** Stack slots of graph PRs that are no graph PR. */
  mates: GraphPr[];
  /** PR id to `behindBy`, only for answers that came. */
  behind: Record<string, number>;
  /** Only at map and lineage scope. */
  group: GroupGraphPart | null;
};

export type Scope =
  | { kind: "all" }
  | { kind: "project"; id: string }
  | { kind: "map"; key: string }
  | { kind: "lineage"; id: string };

/** The scope of a scope id (`all`, `project:<id>`, `map:<key>`, `lineage:<id>`). Null for any other string. */
export function parseScope(s: string | null): Scope | null {
  if (s === "all") return { kind: "all" };
  if (s?.startsWith("project:") && s.length > "project:".length)
    return { kind: "project", id: s.slice("project:".length) };
  if (s?.startsWith("map:") && s.length > "map:".length) return { kind: "map", key: s.slice("map:".length) };
  if (s?.startsWith("lineage:") && s.length > "lineage:".length)
    return { kind: "lineage", id: s.slice("lineage:".length) };
  return null;
}

/** The graph member rule at All and project scope. `prs` are the member-link PRs. */
export const isGraphMember = (t: { live: boolean; settled: boolean; step: boolean; prs: readonly unknown[] }) =>
  t.live && !t.settled && !t.step && t.prs.length > 0;
