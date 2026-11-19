import type { SendError } from "../shared/send.ts";
import type { Status } from "../shared/tree.ts";

/** Statuses in which a sent message waits for the thread's next turn. */
const BUSY: Status[] = ["working", "starting", "waiting"];

export const isBusy = (s: Status) => BUSY.includes(s);

export type Result = { ok: true } | { ok: false; err: SendError };

async function post(path: string, body: object): Promise<Result> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, err: { error: "The server did not answer.", exitCode: null, stderrTail: "" } };
  }
  if (r.ok) return { ok: true };
  try {
    return { ok: false, err: (await r.json()) as SendError };
  } catch {
    return { ok: false, err: { error: `HTTP ${r.status}`, exitCode: null, stderrTail: "" } };
  }
}

export const postSend = (threadId: string, message: string) => post("/t3/send", { threadId, message });

export const postSettle = (threadId: string, settled: boolean) => post("/t3/settle", { threadId, settled });
