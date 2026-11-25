import type { Status } from "./tree.ts";

/** The statuses in which the agent works on the thread. */
export const BUSY = ["working", "starting", "blocked"] as const satisfies Status[];

/** The thread statuses of Needs you. */
export const NEEDS_YOU = ["needs-input", "plan-ready"] as const satisfies Status[];

/** The thread statuses of the Open next queue. */
export const OPEN_NEXT = ["needs-input", "plan-ready", "your-turn"] as const satisfies Status[];

/** The statuses that get a Catch-up. */
export const CATCH_UP = [...OPEN_NEXT, "failed"] as const satisfies Status[];

/** The statuses that fire a notification when a thread enters them. */
export const NOTIFY = ["needs-input", "plan-ready", "failed"] as const satisfies Status[];

/** Whether `s` is in `set`. */
export const isIn = <T extends Status>(set: readonly T[], s: Status): s is T => (set as readonly Status[]).includes(s);
