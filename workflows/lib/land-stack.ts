export type Layer = { number: number; state: "open" | "closed" | "merged" };

export type View = {
  state: string;
  isDraft: boolean;
  reviewDecision: string | null;
  mergeStateStatus: string;
  mergeable: string;
  headRefOid: string;
  headRefName: string;
  baseRefName: string;
};

export type Gate = "merged" | "closed" | "draft" | "changes" | "conflict" | "behind" | "ready";

export type Next = { kind: "done" } | { kind: "land"; n: number } | { kind: "closed"; n: number };

type ApiPull = { number: number; state: string; merged_at: string | null };

/**
 * Reads the answer of the stacks API for the PR `top`: the number of the stack that holds it, and its layers from the
 * bottom up to `top`. A layer above `top` is never landed. Null when no stack holds `top`.
 */
export function layersOf(json: unknown, top: number): { stack: number; layers: Layer[] } | null {
  const stacks = Array.isArray(json) ? (json as { number: number; pull_requests: ApiPull[] }[]) : [];
  for (const s of stacks) {
    const at = s.pull_requests.findIndex((p) => p.number === top);
    if (at < 0) continue;
    const layers = s.pull_requests.slice(0, at + 1).map((p): Layer => ({
      number: p.number,
      state: p.state === "closed" ? (p.merged_at ? "merged" : "closed") : "open",
    }));
    return { stack: s.number, layers };
  }
  return null;
}

/**
 * The lowest layer that is not merged, from the first layer that is in the start list `prs`. A layer between two
 * start layers is landed. When no layer is in `prs`, nothing is left to land.
 */
export function nextLayer(layers: Layer[], prs: number[]): Next {
  const from = layers.findIndex((l) => prs.includes(l.number));
  if (from < 0) return { kind: "done" };
  const layer = layers.slice(from).find((l) => l.state !== "merged");
  if (!layer) return { kind: "done" };
  return { kind: layer.state === "open" ? "land" : "closed", n: layer.number };
}

/** The first rule that holds for the PR. `ignoreReview` skips the draft and changes-requested rules. */
export function gateOf(v: View, ignoreReview: boolean): Gate {
  if (v.state === "MERGED") return "merged";
  if (v.state === "CLOSED") return "closed";
  if (!ignoreReview) {
    if (v.isDraft) return "draft";
    if (v.reviewDecision === "CHANGES_REQUESTED") return "changes";
  }
  if (v.mergeable === "CONFLICTING" || v.mergeStateStatus === "DIRTY") return "conflict";
  if (v.mergeStateStatus === "BEHIND") return "behind";
  return "ready";
}

/** The progress of layer `n` in the list at the start, or an empty string for a layer that is not in it. */
export function progress(prs: number[], n: number): string {
  const k = prs.indexOf(n) + 1;
  return k ? ` (${k}/${prs.length})` : "";
}

export const titleOf = (repo: string, prs: number[], n: number): string =>
  `Land ${repo} #${prs[0]}→#${prs[prs.length - 1]}${progress(prs, n)}`;
