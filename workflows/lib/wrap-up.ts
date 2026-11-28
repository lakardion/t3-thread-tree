/** The pure rules of the wrap-up workflow: what each thread allows, what the question shows and what the summary says. */

/** What the read step learns about one thread. */
export type Facts = {
  id: string;
  title: string;
  projectId: string;
  /** Null for a thread in the main checkout. */
  worktreePath: string | null;
  branch: string | null;
  /** No active run, no pending request and no pending background task. */
  idle: boolean;
  /** The absolute common git dir of the worktree. */
  gitDir: string | null;
  /** The ref that HEAD points to, null when HEAD is detached. */
  head: string | null;
  /** `git status --porcelain --untracked-files=all` is not empty. */
  dirty: boolean;
  /** The first of `rebase-merge`, `rebase-apply`, `MERGE_HEAD` and `BISECT_LOG` that exists. */
  busy: string | null;
  /** The commit of `refs/heads/<branch>`. */
  tip: string | null;
  /** The PR of the branch, null when there is none. */
  merge: { state: string; headRefOid: string } | null;
  /** Ignored files and folders of the worktree. */
  ignored: string[];
  /** The message of a read that failed. */
  error: string | null;
};

/** The state of a worktree right before a removal. */
export type Now = { idle: boolean; head: string | null; dirty: boolean; tip: string | null };

export type Removal = {
  worktreePath: string;
  gitDir: string;
  branch: string;
  /** The head commit of the merged PR. */
  headRefOid: string;
  threadIds: string[];
  titles: string[];
  ignored: string[];
};

export type Kept = { id: string; title: string; reason: string };

export type Plan = { removals: Removal[]; kept: Kept[] };

/** What the cleanup steps did. `remove` and `branch` hold one entry for each removal, in order. */
export type Results = {
  remove: string[];
  branch: (string | null)[];
  settled: string[];
  failed: { id: string; reason: string }[];
};

/** The ids of the unsettled threads in a `t3 thread list` result that are not in the payload, or null when the result is not a list. */
export function otherThreadIds(list: unknown, payloadIds: string[]): string[] | null {
  if (!Array.isArray(list)) return null;
  return list.flatMap((t) =>
    t && typeof t.threadId === "string" && !t.settled && !payloadIds.includes(t.threadId) ? [t.threadId] : [],
  );
}

const SHARED = "shares the worktree with a thread that keeps it";
const MAX_IGNORED = 20;

/** The first failed check of a thread, or null when the thread passes. */
export function keepReason(f: Facts): string | null {
  if (f.error) return f.error;
  if (!f.worktreePath || !f.branch) return "main checkout";
  if (!f.idle) return "still running";
  if (f.head !== `refs/heads/${f.branch}`) return `HEAD is not on ${f.branch}`;
  if (f.busy) return `${f.busy} in progress`;
  if (f.dirty) return "uncommitted changes";
  if (!f.merge) return "no PR";
  if (f.merge.state !== "MERGED") return `PR is ${f.merge.state.toLowerCase()}`;
  if (f.merge.headRefOid !== f.tip) return "branch has commits after the merged PR head";
  return null;
}

/** The late check before a removal: null means go, else the reason to keep the worktree. */
export function recheck(now: Now, removal: Pick<Removal, "branch" | "headRefOid">): string | null {
  if (!now.idle) return "still running";
  if (now.head !== `refs/heads/${removal.branch}`) return `HEAD is not on ${removal.branch}`;
  if (now.dirty) return "uncommitted changes";
  if (now.tip !== removal.headRefOid) return "branch moved";
  return null;
}

/**
 * Groups the checked threads by worktree. A worktree goes only when every checked thread on it passes and no other
 * thread uses it. `usedByOthers` and `unknown` are worktree paths.
 */
export function planWrapUp(facts: Facts[], usedByOthers: string[], unknown: string[]): Plan {
  const kept: Kept[] = [];
  const groups = new Map<string, Facts[]>();
  for (const f of facts) {
    if (f.worktreePath) groups.set(f.worktreePath, [...(groups.get(f.worktreePath) ?? []), f]);
    else kept.push({ id: f.id, title: f.title, reason: keepReason(f) ?? "main checkout" });
  }

  const removals: Removal[] = [];
  for (const [worktreePath, threads] of groups) {
    const reasons = threads.map(keepReason);
    const own = usedByOthers.includes(worktreePath)
      ? "another thread uses this worktree"
      : unknown.includes(worktreePath)
        ? "cannot tell if another thread uses this worktree"
        : null;
    const first = threads[0];
    if (!own && reasons.every((r) => r === null) && first.gitDir && first.branch && first.merge) {
      removals.push({
        worktreePath,
        gitDir: first.gitDir,
        branch: first.branch,
        headRefOid: first.merge.headRefOid,
        threadIds: threads.map((t) => t.id),
        titles: threads.map((t) => t.title),
        ignored: first.ignored,
      });
      continue;
    }
    const anyFails = reasons.some((r) => r !== null);
    threads.forEach((t, i) => {
      kept.push({ id: t.id, title: t.title, reason: own ?? reasons[i] ?? (anyFails ? SHARED : "cannot remove") });
    });
  }
  return { removals, kept };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The title and data of the one question. `n` is the checked thread count. */
export function question(plan: Plan, n: number) {
  const k = plan.removals.length;
  const goes =
    k === 0
      ? "No worktree or branch goes."
      : `${plural(k, "worktree", "worktrees")} and ${k === 1 ? "branch goes" : "branches go"}.`;
  return {
    title: `Wrap up ${plural(n, "thread", "threads")}? ${goes}`,
    data: {
      remove: plan.removals.map((r) => ({
        worktree: r.worktreePath,
        branch: r.branch,
        threads: r.titles,
        ignoredFiles:
          r.ignored.length > MAX_IGNORED
            ? [...r.ignored.slice(0, MAX_IGNORED), `and ${r.ignored.length - MAX_IGNORED} more`]
            : r.ignored,
      })),
      keep: plan.kept.map((t) => ({ thread: t.title, reason: t.reason })),
    },
  };
}

const keptReason = (result: string | null) => (result?.startsWith("kept: ") ? result.slice(6) : null);

/** A short Markdown summary of the run. */
export function summary(plan: Plan, results: Results): string {
  const lines: string[] = [];
  const removed: string[] = [];
  const deleted: string[] = [];
  const stopped: string[] = [];
  plan.removals.forEach((r, i) => {
    const worktree = results.remove[i];
    if (worktree === "removed") removed.push(`\`${r.worktreePath}\``);
    else stopped.push(`Worktree \`${r.worktreePath}\` kept: ${keptReason(worktree) ?? "not removed"}`);
    const branch = results.branch[i];
    if (branch === "deleted") deleted.push(`\`${r.branch}\``);
    else if (branch) stopped.push(`Branch \`${r.branch}\` kept: ${keptReason(branch) ?? branch}`);
  });
  lines.push(`**Worktrees removed:** ${removed.length ? removed.join(", ") : "none"}`);
  lines.push(`**Branches deleted:** ${deleted.length ? deleted.join(", ") : "none"}`);
  lines.push(`**Threads settled:** ${results.settled.length}`);
  for (const f of results.failed) lines.push(`- Not settled: ${f.id}: ${f.reason}`);
  if (plan.kept.length) {
    lines.push("", "**Threads kept:**");
    for (const t of plan.kept) lines.push(`- ${t.title}: ${t.reason}`);
  }
  if (stopped.length) {
    lines.push("", "**Stopped at the late check:**");
    for (const s of stopped) lines.push(`- ${s}`);
  }
  return lines.join("\n");
}
