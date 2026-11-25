import type { Status } from "./tree.ts";

/** The statuses in which the agent works on the thread. */
export const BUSY = ["working", "starting", "blocked"] as const satisfies Status[];

/** The thread statuses of Needs you and of the Open next queue. */
export const NEEDS_YOU = ["needs-input", "plan-ready", "your-turn"] as const satisfies Status[];

/** The statuses that get a Catch-up. */
export const CATCH_UP = [...NEEDS_YOU, "failed"] as const satisfies Status[];

/** The statuses that fire a notification when a thread enters them. */
export const NOTIFY = ["needs-input", "plan-ready", "failed"] as const satisfies Status[];

/** Whether `s` is in `set`. */
export const isIn = <T extends Status>(set: readonly T[], s: Status): s is T => (set as readonly Status[]).includes(s);
