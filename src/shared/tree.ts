/** The placed tree that the backend pushes and the page renders. */
export type Status =
  | "needs-input" | "working" | "starting" | "waiting" | "plan-ready"
  | "your-turn" | "done" | "failed" | "interrupted" | "snoozed" | "idle";

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
};

export type ThreadNode = {
  id: string;
  href: string;
  title: string;
  /** The issue key of the title, for the fold. */
  key: string | null;
  status: Status;
  phrase: string;
  /** Start of the elapsed time in the phrase. */
  since: string | null;
  /** Raw T3 status, for the icon tooltip. */
  raw: string;
  updatedAt: string;
  settled: boolean;
  /** A request with `blocking: false` is pending. */
  input: boolean;
  snoozedUntil: string | null;
  /** `pos` is null when the thread created no PR in the stack. */
  stack: { pos: number | null; total: number } | null;
  prs: PrNode[];
  detail: Detail;
  children: ThreadNode[];
};

export type Branch = { id: string; label: string; branches: Branch[]; threads: ThreadNode[] };

export type Conn = "up" | "down" | "unauthorized";

export type Tree = { conn: Conn; lastUpdate: string | null; projects: Branch[] };

const flat = (t: ThreadNode): ThreadNode[] => [t, ...t.children.flatMap(flat)];
export const allThreads = (b: Branch): ThreadNode[] => [
  ...b.branches.flatMap(allThreads),
  ...b.threads.flatMap(flat),
];
