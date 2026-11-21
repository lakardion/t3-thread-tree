/** The Suggested reply pool: each Reply intent with its chip texts, in pool order. The chip text is also the sent text. */
export const REPLY_POOL = [
  { id: "run-app", chips: ["run the app and tell me what to test"] },
  { id: "ship", chips: ["commit push", "commit push pr"] },
  { id: "push", chips: ["push"] },
  { id: "handoff", chips: ["$t3-handoff"] },
  { id: "retry", chips: ["retry"] },
  { id: "agree-all", chips: ["agreed to all"] },
  { id: "merged", chips: ["merged"] },
  { id: "refresh-pr", chips: ["$refresh-pr"] },
] as const;

/** The chip texts of intent ids, in the given order. An unknown id gives no chip. */
export const chipsOf = (ids: readonly string[]): string[] =>
  ids.flatMap((id) => REPLY_POOL.find((r) => r.id === id)?.chips ?? []);
