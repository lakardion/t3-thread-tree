import type { BriefAction } from "../shared/brief.ts";
import type { SendError } from "../shared/send.ts";
import type { Status } from "../shared/tree.ts";

/** Statuses in which a sent message waits for the thread's next turn. */
const BUSY: Status[] = ["working", "starting", "waiting"];

export const isBusy = (s: Status) => BUSY.includes(s);

/** Identifies a step across briefs of the same run. */
export const markKey = (a: BriefAction) => JSON.stringify([a.kind, a.title, a.threadIds]);

export async function postSend(
  threadId: string,
  message: string,
): Promise<{ ok: true } | { ok: false; err: SendError }> {
  let r: Response;
  try {
    r = await fetch("/t3/send", { method: "POST", body: JSON.stringify({ threadId, message }) });
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
