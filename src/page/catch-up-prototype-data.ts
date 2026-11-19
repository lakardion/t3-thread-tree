// Demo-only fixtures. Keep the modeled lines next to the messages they come from.
export const DEMO_MESSAGES: Record<string, string> = {
  "demo-2":
    "The saved cards list works. One open point: should a new card become the default at once, or only when the user picks it?",
  "demo-12":
    "I reproduced the cart badge count failure. The provider rate limit stopped the run before I could verify a fix. The run will resume when the limit resets. No input needed.",
  "demo-15":
    "The retry queue needs a new table. I will run the migration next:\n\nbun run db:migrate --name retry_queue\n\nApprove the command to continue.",
  "demo-20":
    "The pagination plan is ready. It uses a cursor and keeps the current response shape. Please approve the plan before I implement it.",
  "demo-21": "The retry policy change is ready. I need to run the load test script before I confirm the numbers.",
  "demo-17": "I added a first-run example to the CLI guide. Please check that the flags match the current CLI.",
  "demo-22": "I changed the changelog entry to say when the new cache expires. Does the new wording make sense?",
  "demo-24": "I linked the four release PRs. The 4.2 docs are still a draft.",
  "demo-25": "The schema diff is ready. Approve the command to add the new index.",
  m2: "I moved Dialog to the new tokens. Can you check the focus ring in dark mode?",
  dispatch: "I started the cache rollout threads. The cache client goes first.",
  "search-plan": "I mapped the index fields and wrote the plan. The writer thread can start.",
  "search-b": "The backfill can start. Should I use all documents or only documents from the last 30 days?",
};

export function demoLastMessage(id: string, title: string) {
  if (["demo-5", "map", "demo-16", "launched"].includes(id)) return null;
  return DEMO_MESSAGES[id] ?? `I finished the work on "${title}".`;
}

export const DEMO_CATCH_UP: Record<string, { did: string; ask: string }> = {
  "demo-2": {
    did: "The saved cards list works.",
    ask: "Default new cards at once or after selection?",
  },
  "demo-15": { did: "The retry queue needs a new table.", ask: "Approve the migration command?" },
  "demo-20": { did: "The cursor pagination plan is ready.", ask: "Approve the plan?" },
  "demo-17": { did: "The CLI guide has a first-run example.", ask: "Check the flags against the current CLI?" },
  "demo-22": { did: "The changelog now gives the cache expiry.", ask: "Check the wording?" },
  "demo-25": { did: "The schema diff is ready.", ask: "Approve the command to add the index?" },
  m2: { did: "Dialog uses the new tokens.", ask: "Check the focus ring in dark mode?" },
  "search-b": { did: "The backfill can start.", ask: "Backfill all documents or only the last 30 days?" },
};
