import { arrayMove } from "@dnd-kit/helpers";

import type { Rule } from "./prefs.ts";

const OFF = {
  map: "Map members leave their map and go to the next rule.",
  review: "Review threads go to their stack or key group, or stay loose.",
  stack: "Stacked threads no longer group by stack.",
  key: "Threads with a key no longer group by key.",
} as const;

/** One line for each difference from the default placement; empty means the default. */
export const ruleChanges = (rules: Rule[], linear: boolean): string[] => {
  const at = (id: Rule["id"]) => rules.findIndex((r) => r.id === id);
  const on = (id: Rule["id"]) => rules[at(id)].on;
  const out: string[] = [];
  if (on("review") && on("stack") && at("review") > at("stack"))
    out.push("A review thread in a PR stack shows in its stack, not in Reviews.");
  if (on("key") && on("stack") && at("key") < at("stack"))
    out.push(
      `A stack thread with a key goes to ${linear ? "its own milestone" : "its key group"}. Stack mates without a key stay in the stack.`,
    );
  for (const id of ["map", "review", "stack", "key"] as const) if (!on(id)) out.push(OFF[id]);
  if (on("nest")) out.push("Launched threads nest under their spawner.");
  return out;
};

/** Moves a middle rule from position `from` to `to` (0 to 2); `map` stays first and `nest` last. */
export const moveRule = (rules: Rule[], from: number, to: number): Rule[] => [
  rules[0],
  ...arrayMove(rules.slice(1, -1), from, to),
  rules.at(-1)!,
];
