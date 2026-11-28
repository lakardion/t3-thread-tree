/** Response types of the `/t3/*` send routes. */
export type CliStatus = { available: boolean; path: string };

export const DELIVERIES = ["started", "queued", "steered", "restarted"] as const;

export type Delivery = (typeof DELIVERIES)[number];

export type SendOk = { delivery: Delivery };

export type StartOk = { threadId: string };

export type WorkflowStartOk = { runId: string };

export type SendError = { error: string; exitCode: number | null; stderrTail: string };

/** One stored value of `GET /t3/workflows/settings`. */
export type StoreValue = { key: string; value: unknown };
