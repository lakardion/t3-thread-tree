/** The Next-step brief that the backend keeps in memory and the page renders. */
import type { Status, ThreadNode } from "./tree.ts";

export type Cli = "claude" | "codex";

export type ActionKind = "answer" | "merge" | "fix" | "review" | "clean-up" | "unblock";

export type BriefAction = {
  kind: ActionKind;
  title: string;
  reason: string;
  threadIds: string[];
  prompt: string | null;
  /** The PR of a code `fix` or `merge` Action. */
  pr?: number;
};

export type BriefRun =
  | {
      status: "running";
      cli: Cli;
      threadCount: number;
      startedAt: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    }
  | {
      status: "done";
      cli: Cli;
      generatedAt: string;
      rulesOnly?: true;
      actions: BriefAction[];
      titles: Record<string, string>;
    }
  | {
      status: "failed";
      cli: Cli;
      error: string;
      stderrTail: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    };

/** The tree facts at brief time: the status of every thread in the brief, and the `since` of each answer thread. */
export type Snapshot = { statuses: Record<string, Status>; since: Record<string, string | null> };

export type BriefState = { status: "idle" } | (BriefRun & Snapshot);

export type Mark = "done" | "changed";

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The live, unsettled threads of an Action. */
const linkedOf = (a: BriefAction, live: Map<string, ThreadNode>) =>
  a.threadIds.flatMap((id) => {
    const n = live.get(id);
    return n && !n.settled ? [n] : [];
  });

/** The status of a linked thread differs from the snapshot. */
const statusMoved = (n: ThreadNode, snap: Snapshot) => n.id in snap.statuses && snap.statuses[n.id] !== n.status;

/** `done` wins over `changed`. `null` when the Action is still open. */
export function markOf(a: BriefAction, live: Map<string, ThreadNode>, snap: Snapshot): Mark | null {
  const linked = linkedOf(a, live);
  if (linked.length === 0) return "done";
  if (a.kind === "answer") {
    if (!linked.some((n) => n.status === "needs-input" || n.status === "plan-ready")) return "done";
    return linked.some((n) => statusMoved(n, snap) || (n.id in snap.since && snap.since[n.id] !== n.since))
      ? "changed"
      : null;
  }
  if (a.kind === "fix" || a.kind === "merge") {
    const pr = linked.flatMap((n) => n.prs).find((p) => p.n === a.pr);
    if (!pr || pr.state !== "open") return "done";
    const broken = pr.checks === "failing" || pr.conflicting || pr.review === "changes-requested";
    return a.kind === "fix" && !broken ? "done" : null;
  }
  return linked.some((n) => statusMoved(n, snap)) ? "changed" : null;
}

/** Each Action with its place `i` in the brief and its mark. Open first, then changed, then done, stable inside each. */
export function markRows(actions: BriefAction[], live: Map<string, ThreadNode>, snap: Snapshot) {
  const rows = actions.map((a, i) => ({ a, i, mark: markOf(a, live, snap) }));
  return (["open", "changed", "done"] as const).flatMap((m) => rows.filter((r) => (r.mark ?? "open") === m));
}

/** One line per live linked thread whose status differs from the snapshot. */
export function changedLines(a: BriefAction, live: Map<string, ThreadNode>, snap: Snapshot, at: string) {
  return linkedOf(a, live).flatMap((n) =>
    statusMoved(n, snap) ? [`Changed since ${hhmm(at)}: ${n.title} was ${snap.statuses[n.id]}, now ${n.status}`] : [],
  );
}

type Row = { a: BriefAction; i: number; mark: Mark | null };

/** The first 3 open rows, or every row with `all`. */
export const shortRows = (rows: Row[], all: boolean) => (all ? rows : rows.filter((r) => !r.mark).slice(0, 3));

/** Some row stays behind "Show all". */
export const hasMore = (rows: Row[]) => rows.length > 3 || rows.some((r) => r.mark);

/** The folded head, for example "10 Actions · 3 done · 1 changed". A zero count is left out. */
export function foldHead(rows: Row[]) {
  const count = (m: Mark) => rows.filter((r) => r.mark === m).length;
  return [
    `${rows.length} Action${rows.length === 1 ? "" : "s"}`,
    count("done") && `${count("done")} done`,
    count("changed") && `${count("changed")} changed`,
  ]
    .filter(Boolean)
    .join(" · ");
}
