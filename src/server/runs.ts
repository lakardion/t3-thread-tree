import type { RunItem } from "../shared/runs.ts";
import { hrefOf } from "./build-tree.ts";
import type { RunsSnapshot } from "./t3.ts";

/**
 * The runs that wait for the user: every open question, and every paused run that waits for a person (`resumesAt` null).
 * `origin` is the T3 web origin. `environmentId` stands for a thread of this environment.
 */
export function runItems(snapshot: RunsSnapshot, origin: string, environmentId: string): RunItem[] {
  const byId = new Map(snapshot.runs.map((r) => [r.runId, r]));
  const href = (runId: string) => `${origin}/workflows?run=${encodeURIComponent(runId)}`;
  const questions = snapshot.questions.map((q): RunItem => {
    const run = byId.get(q.runId);
    return {
      kind: "question",
      id: `q:${q.runId}:${q.name}`,
      runId: q.runId,
      workflow: run?.workflow ?? q.runId,
      runTitle: run?.title ?? q.runId,
      title: q.title,
      line: q.title,
      since: q.askedAt,
      href: href(q.runId),
      name: q.name,
      choices: q.choices,
      threadHref: q.thread && hrefOf(q.thread.environmentId ?? environmentId, q.thread.threadId),
    };
  });
  const paused = snapshot.runs
    .filter((r) => r.status === "paused" && r.resumesAt === null)
    .map((r): RunItem => ({
      kind: "paused",
      id: `p:${r.runId}`,
      runId: r.runId,
      workflow: r.workflow,
      runTitle: r.title,
      title: r.title,
      line: r.detail?.split("\n", 1)[0] || r.title,
      since: r.updatedAt,
      href: href(r.runId),
      detail: r.detail,
      retired: r.retired,
    }));
  return [...questions, ...paused];
}
