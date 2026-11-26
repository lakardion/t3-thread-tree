import type { MapLane } from "../server/map-md.ts";
import type { PrNode } from "./tree.ts";

/** The answer of `GET /map-graph`: the parts of the PR graph that the tree does not hold. */
export type MapGraphData = {
  /** ISO time of the slow calls. */
  at: string;
  lanes: MapLane[] | null;
  /** `## Stacks` chains, bottom first. Null with no such section. */
  stacks: { prs: number[] }[] | null;
  /** The settled and archived members. */
  settled: { id: string; title: string; status: string; createdAt: string | null; href: string; prs: PrNode[] }[];
  /** The key query rows that passed the filter. */
  rows: (PrNode & { threadId: string | null; threadHref: string | null })[];
  /** Stack slots of member PRs that no member links and no row holds. */
  mates: (PrNode & { threadId: string | null; threadHref: string | null })[];
  /** PR number to `behindBy`, only for answers that came. */
  behind: Record<number, number>;
  /** The key queries that failed. */
  errors: { key: string; text: string }[];
};
