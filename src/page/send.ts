import type { BriefAction } from "../shared/brief.ts";
import type { SendError } from "../shared/send.ts";
import { allThreads, type Branch, type Status, type ThreadNode } from "../shared/tree.ts";

/** Statuses in which a sent message waits for the thread's next turn. */
const BUSY: Status[] = ["working", "starting", "waiting"];

export const isBusy = (s: Status) => BUSY.includes(s);

/** Identifies a step across briefs of the same run. */
export const markKey = (a: BriefAction) => JSON.stringify([a.kind, a.title, a.threadIds]);

export type Result = { ok: true } | { ok: false; err: SendError };

async function post(path: string, body: object): Promise<Result> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
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

export const postStart = (projectId: string, title: string, message: string) =>
  post("/t3/start", { projectId, title, message });

/** Branch ids of projects are `p:<projectId>`. */
export const projectIdOf = (b: Branch) => b.id.replace(/^p:/, "");

/** The project of the first live step thread, else the first project. The title leads with the issue key of the step's first thread. */
export function startDefaults(
  a: BriefAction,
  live: Map<string, ThreadNode>,
  projects: Branch[],
): { projectId: string; title: string } {
  const holder = a.threadIds.find((id) => live.has(id));
  const project = projects.find((p) => holder && allThreads(p).some((t) => t.id === holder)) ?? projects[0];
  const key = live.get(a.threadIds[0])?.key;
  return { projectId: project ? projectIdOf(project) : "", title: key ? `${key} ${a.title}` : a.title };
}
