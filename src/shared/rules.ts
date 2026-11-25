/** The placement rules in default chain order. `on`: the default switch. */
export const RULES = [
  { id: "map", label: "Map group", on: true },
  { id: "review", label: "Reviews", on: true },
  { id: "stack", label: "PR stack", on: true },
  { id: "key", label: "Issue key", on: true },
  { id: "nest", label: "Launch nesting", on: false },
] as const;
export type RuleId = (typeof RULES)[number]["id"];
