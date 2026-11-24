import type { SendError, WorkflowStartOk } from "../shared/send.ts";
import type { Status } from "../shared/tree.ts";

/** Statuses in which a sent message waits for the thread's next turn. */
const BUSY: Status[] = ["working", "starting", "waiting"];

export const isBusy = (s: Status) => BUSY.includes(s);

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; err: SendError };

async function post<T extends object = object>(path: string, body: object): Promise<Result<T>> {
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
  if (r.ok) return { ok: true, ...((await r.json().catch(() => ({}))) as T) };
  try {
    return { ok: false, err: (await r.json()) as SendError };
  } catch {
    return { ok: false, err: { error: `HTTP ${r.status}`, exitCode: null, stderrTail: "" } };
  }
}

export const postSend = (threadId: string, message: string) => post("/t3/send", { threadId, message });

export const postStart = (projectId: string, title: string, message: string) =>
  post<{ threadId: string }>("/t3/start", { projectId, title, message });

export const postSettle = (threadId: string, settled: boolean) => post("/t3/settle", { threadId, settled });

export const postMapThread = (id: string, marked: boolean) => post("/map-threads", { id, marked });

export const postSnooze = (threadId: string, snoozedUntil: string) => post("/t3/snooze", { threadId, snoozedUntil });

export const postAnswer = (runId: string, name: string, choice: string, reason: string) =>
  post("/t3/workflows/answer", { runId, name, choice, reason });

export const postResume = (runId: string) => post("/t3/workflows/resume", { runId });

/** A 202 (T3 has not confirmed yet) is `ok`: the next snapshot settles it. */
export const postCancel = (runId: string) => post("/t3/workflows/cancel", { runId });

export const postWorkflowStart = (workflow: string, input: object, key: string) =>
  post<WorkflowStartOk>("/t3/workflows/start", { workflow, input, key });
