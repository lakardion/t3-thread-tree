/** The placement rules in default chain order. `on`: the default switch. `hint`: the one-line text for Settings. */
export const RULES = [
  {
    id: "lineage",
    label: "Lineage group",
    hint: "Threads that an agent launched go under the thread that started them.",
    on: true,
  },
  { id: "review", label: "Reviews", hint: "Review threads go in one Reviews group.", on: true },
  { id: "stack", label: "PR stack", hint: "Threads with stacked PRs go in their stack.", on: true },
  { id: "key", label: "Issue key", hint: "Threads go in the group of their issue key.", on: true },
] as const;
export type RuleId = (typeof RULES)[number]["id"];
