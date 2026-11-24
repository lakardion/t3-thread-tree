/** The placed tree that the backend pushes and the page renders. */
import type { ModelPick } from "./model.ts";
import type { RunItem } from "./runs.ts";
import type { Workflow } from "./workflow-start.ts";

export type Status =
  | "needs-input"
  | "working"
  | "starting"
  | "waiting"
  | "plan-ready"
  | "your-turn"
  | "done"
  | "failed"
  | "interrupted"
  | "snoozed"
  | "idle";

export type Label = { name: string; color: string | null };

export type PrNode = {
  n: number;
  url: string;
  state: string;
  draft: boolean;
  checks: "passing" | "failing" | "pending" | null;
  review: "approved" | "changes-requested" | "review-required" | null;
  conflicting: boolean;
  title: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  /** Only the labels the connection watches. */
  labels: Label[];
};

export type Detail = {
  request: string | null;
  error: { class: string | null; code: string | null; text: string | null } | null;
  limitResetAt: string | null;
  autoResume: boolean;
  stopRequested: boolean;
  model: string | null;
  planMode: boolean;
  branch: string | null;
  worktreePath: string | null;
  launchedBy: { title: string; href: string } | null;
  origin: string | null;
  startedBy: string | null;
  createdAt: string | null;
  goal: { objective: string; status: string } | null;
  tags: string[];
  pinned: boolean;
  /** Set when the thread is in the map thread file. */
  mapMarked?: true;
};

/** The one-line read of a waiting thread. `did`, `ask`, `options` and `doneLike` are set when `state` is `done`. `question` is the raw last question, set when `state` is `done` or `failed`. */
export type CatchUp = {
  state: "queued" | "running" | "done" | "failed";
  did?: string;
  ask?: string | null;
  options?: string[];
  doneLike?: boolean;
  question?: string | null;
  pick: ModelPick;
};

/** One line of a run row: a step, and the node id of the step thread or child run that it shows. */
export type RunStep = { name: string; state: "done" | "now" | "failed" | "pending"; child: string | null };

/** Set on a run node. Its `children` are its step threads and child runs. */
export type RunInfo = {
  runId: string;
  workflow: string;
  state: "running" | "asks" | "paused" | "done";
  steps: RunStep[];
  detail: string | null;
};

export type ThreadNode = {
  id: string;
  href: string;
  title: string;
  /** The issue key of the title, for the fold. */
  key: string | null;
  /** Linear data of `key`. Null with no key, no answer yet, or no `linear=1`. */
  linear: LinearIssue | null;
  status: Status;
  phrase: string;
  /** Start of the elapsed time in the phrase. */
  since: string | null;
  /** Raw T3 status, for the icon tooltip. */
  raw: string;
  updatedAt: string;
  /** Newest of the working run start, the latest run start and the latest run end. Not `updatedAt`, which ticks while a thread works. */
  lastRun: string | null;
  settled: boolean;
  /** A request with `blocking: false` is pending. */
  input: boolean;
  snoozedUntil: string | null;
  /** `pos` is null when the thread created no PR in the stack. */
  stack: { pos: number | null; total: number } | null;
  prs: PrNode[];
  detail: Detail;
  children: ThreadNode[];
  /** Set while the server holds a Catch-up for the thread's newest message and request. */
  catchUp?: CatchUp;
  /** Reply intent ids for the send dialog chips, in pool order. Set only on a waiting top-level thread with a complete assistant message. */
  suggestedReplies?: string[];
  /** The T3 project. Set only in the Linear tree, and on a step thread from another project than its run. */
  t3Project?: { id: string; label: string };
  /** Set on a run node, which is not a thread. */
  run?: RunInfo;
  /** The step that a step thread or a child run serves. */
  step?: string;
  /** Set on the head of a Map group. Its `children` are the members, or one Map header for each map of a map thread that anchors several. */
  map?: MapInfo;
  /** Set on a member that sits in a stack rail inside a Map group. Consecutive children with one `rail.id` share the rail. */
  rail?: Branch["stack"];
};

/** `header`: a Map header, which is not a thread. `href` is the map thread link, null with no map thread. */
export type MapInfo = { name: string; header: boolean; href: string | null };

export type Branch = {
  id: string;
  label: string;
  /** Project branches only: `owner/name`. */
  repo?: string;
  /** Project branches only: the workspace root. */
  path?: string;
  /** Key groups in a PR stack. Adjacent groups with the same `id` share one rail. */
  stack?: { id: string; total: number; base: string | null; number?: number };
  /** Top-level and milestone branches of the Linear tree. `url`: project link. `date`: milestone target date. */
  linear?: { url?: string; date?: string | null };
  branches: Branch[];
  threads: ThreadNode[];
};

/** Labels of the two project groups that stay after the key groups. */
export const REVIEWS = "Reviews";
export const NO_KEY = "No issue key";
/** Labels of the Linear tree: the fallback project and the fallback milestone. */
export const NO_PROJECT = "No project";
export const NO_MILESTONE = "No milestone";

/** Fallback groups of the Linear tree have ids with the `lf:` prefix. */
export const isFallback = (b: Branch): boolean => b.id.startsWith("lf:");
/** The id of the Reviews group of the Linear tree. */
export const LINEAR_REVIEWS = "lf:reviews";
export const isLinearReviews = (b: Branch): boolean => b.id === LINEAR_REVIEWS;
/** The id of the keyless threads of the Linear tree. They show as loose rows, with no header. */
export const LINEAR_LOOSE = "lf:loose";

/** `connecting`: the server is up but has no tree yet. */
export type Conn = "connecting" | "up" | "down" | "no-token" | "unauthorized";

export type Tree = {
  conn: Conn;
  lastUpdate: string | null;
  /** Set when the server knows the Linear workspace. No teams: every issue key links. */
  linear: Linear | null;
  /** State of the Linear API key. */
  linearKey: LinearKeyState;
  /** Changes when the settled threads change, so the page refetches its Settled list. Empty with none. */
  settled: string;
  projects: Branch[];
  /** Run questions and Paused runs. Null until the first workflows snapshot, so the page takes no empty list as its baseline. */
  runs: RunItem[] | null;
  /** The workflows that the server can start. Null until the first workflows snapshot. */
  workflows: Workflow[] | null;
  /** Why the server cannot read the workflow files. Null when it can, or has not tried. */
  workflowScan: string | null;
  /** The T3 web origin. Null until the first workflows snapshot. */
  t3Origin: string | null;
};

export type Linear = { workspace: string; teams: string[] };

/** The Linear project and milestone of one issue. Null means the issue has none. */
export type LinearIssue = {
  project: { id: string; name: string; url: string } | null;
  milestone: { id: string; name: string; targetDate: string | null } | null;
};

/** `"no-key"`: no API key saved. `"rejected"`: Linear refused the key. */
export type LinearKeyState = "ok" | "no-key" | "rejected";

/** The Linear config from a workspace slug or any linear.app URL, and a comma list of team keys. Null with no workspace. */
export function parseLinear(workspace = "", teams = ""): Linear | null {
  const ws = workspace.trim().match(/linear\.app\/([^/?#\s]+)/)?.[1] ?? workspace.trim();
  if (!ws) return null;
  return {
    workspace: ws,
    teams: teams
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  };
}

/** Label names from a comma list: trimmed, empty names dropped. */
export const parseLabels = (s = ""): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** A run node and a Map header are not threads. */
export const isThread = (t: ThreadNode): boolean => !t.run && !t.map?.header;

/** The threads of a node, subthreads at any depth. A node that is not a thread adds only its children. */
export const flat = (t: ThreadNode): ThreadNode[] => [...(isThread(t) ? [t] : []), ...t.children.flatMap(flat)];
export const allThreads = (b: Branch): ThreadNode[] => [...b.branches.flatMap(allThreads), ...b.threads.flatMap(flat)];
/** The run nodes of a node and its children, at any depth. */
export const runsOf = (t: ThreadNode): ThreadNode[] => [...(t.run ? [t] : []), ...t.children.flatMap(runsOf)];
/** The run nodes of a branch, at any depth. */
export const allRuns = (b: Branch): ThreadNode[] => [...b.branches.flatMap(allRuns), ...b.threads.flatMap(runsOf)];

/** Oldest `since` first, `null` last. ISO timestamps sort the same as text. */
export const bySince = (a: string | null, b: string | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
