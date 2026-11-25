/** The placement rules in default chain order. `on`: the default switch. `hint`: the one-line text for Settings. */
export const RULES = [
  { id: "map", label: "Map group", hint: "Threads of a wayfinder map go under the map.", on: true },
  { id: "review", label: "Reviews", hint: "Review threads go in one Reviews group.", on: true },
  { id: "stack", label: "PR stack", hint: "Threads with stacked PRs go in their stack.", on: true },
  { id: "key", label: "Issue key", hint: "Threads go in the group of their issue key.", on: true },
  { id: "nest", label: "Launch nesting", hint: "A launched thread goes under the thread that launched it.", on: false },
] as const;
export type RuleId = (typeof RULES)[number]["id"];
