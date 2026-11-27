import type { MapLane } from "../server/map-md.ts";
import type { PrNode } from "./tree.ts";

export type GraphPr = PrNode & { threadId: string | null; threadHref: string | null };

/** The answer of `GET /pr-graph`: the parts of the PR graph that the tree does not hold. */
/** The map part of a `PrGraphData`. */
export type MapGraphPart = {
  lanes: MapLane[] | null;
  /** `## Stacks` chains, bottom first. Null with no such section. */
  stacks: { prs: number[] }[] | null;
  /** The settled and archived members. */
  settled: { id: string; title: string; status: string; createdAt: string | null; href: string; prs: PrNode[] }[];
  /** The key query rows that passed the filter. */
  rows: GraphPr[];
  /** The key queries that failed. */
  errors: { key: string; text: string }[];
};

export type PrGraphData = {
  /** ISO time of the slow calls. */
  at: string;
  /** Project id (`none` for No project) to root branch. No entry when git gave none. */
  roots: Record<string, string>;
  /** Stack slots of graph PRs that are no graph PR. */
  mates: GraphPr[];
  /** PR id to `behindBy`, only for answers that came. */
  behind: Record<string, number>;
  /** Only at map scope. */
  map: MapGraphPart | null;
};

export type Scope = { kind: "all" } | { kind: "project"; id: string } | { kind: "map"; key: string };

/** The scope of a scope id (`all`, `project:<id>`, `map:<key>`). Null for any other string. */
export function parseScope(s: string | null): Scope | null {
  if (s === "all") return { kind: "all" };
  if (s?.startsWith("project:") && s.length > "project:".length)
    return { kind: "project", id: s.slice("project:".length) };
  if (s?.startsWith("map:") && s.length > "map:".length) return { kind: "map", key: s.slice("map:".length) };
  return null;
}

/** The graph member rule at All and project scope. `prs` are the member-link PRs. */
export const isGraphMember = (t: { live: boolean; settled: boolean; step: boolean; prs: readonly unknown[] }) =>
  t.live && !t.settled && !t.step && t.prs.length > 0;
