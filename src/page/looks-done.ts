import { BUSY } from "../shared/status.ts";
import { allThreads, flat, type Branch, type Conn, type Status, type ThreadNode } from "../shared/tree.ts";

export const SKIP_KEY = "thread-tree:looks-done-skip";

const OFFERED: Status[] = ["your-turn", "done", "idle"];
/** A subthread in one of these statuses keeps its thread out of the offer. */
const BUSY_OR_ASKS: Status[] = [...BUSY, "needs-input", "plan-ready"];
const AGE = 3_600_000;

export type Reason = { kind: "prs"; n: number; merged: boolean } | { kind: "catch-up"; did: string };

/** A thread that the user kept. It stays out of the offer until its `lastRun` changes. */
export type Skip = { id: string; lastRun: string | null };

export type Offer = { thread: ThreadNode; reason: Reason; project: string };

function reasonOf(t: ThreadNode): Reason | null {
  if (t.prs.length > 0 && t.prs.every((p) => p.state === "merged" || p.state === "closed"))
    return { kind: "prs", n: t.prs.length, merged: t.prs.every((p) => p.state === "merged") };
  const c = t.catchUp;
  return c?.state === "done" && c.doneLike && c.pick !== "local" ? { kind: "catch-up", did: c.did ?? "" } : null;
}

/**
 * Unsettled threads with status your-turn, done or idle, an old run, and a reason.
 * Subthreads are read from `children`, so they count only while the tree nests them.
 */
export function looksDone(projects: Branch[], { skip, now }: { skip: Skip[]; now: number }): Offer[] {
  return projects.flatMap((p) =>
    allThreads(p).flatMap((thread) => {
      const reason = reasonOf(thread);
      const ok =
        reason &&
        thread.step === undefined &&
        !thread.settled &&
        OFFERED.includes(thread.status) &&
        !thread.children.flatMap(flat).some((c) => BUSY_OR_ASKS.includes(c.status)) &&
        thread.lastRun !== null &&
        now - Date.parse(thread.lastRun) > AGE &&
        !thread.detail.pinned &&
        !skip.some((s) => s.id === thread.id && s.lastRun === thread.lastRun);
      return ok ? [{ thread, reason, project: thread.t3Project?.label ?? p.label }] : [];
    }),
  );
}

export function reasonText(r: Reason): string {
  if (r.kind === "catch-up") return `Catch-up: ${r.did}`;
  const prs = `${r.n} ${r.n === 1 ? "PR" : "PRs"}`;
  return r.merged ? `${prs} merged` : `${prs} merged or closed`;
}

/** The stored skip list from JSON text. Bad JSON or a bad shape gives an empty list. */
export function parseSkip(raw: string | null): Skip[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(data) &&
      data.every(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          typeof s.id === "string" &&
          (typeof s.lastRun === "string" || s.lastRun === null),
      )
      ? (data as Skip[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Drops the entries of gone threads and of threads with a new `lastRun`. Only a live tree prunes.
 * Returns `skip` itself when nothing drops.
 */
export function pruneSkip(skip: Skip[], live: ReadonlyMap<string, ThreadNode>, conn: Conn): Skip[] {
  if (conn !== "up") return skip;
  const kept = skip.filter((s) => live.get(s.id)?.lastRun === s.lastRun);
  return kept.length === skip.length ? skip : kept;
}
