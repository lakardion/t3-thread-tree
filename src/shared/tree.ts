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
  children: ThreadNode[];
};

export type Branch = {
  id: string;
  label: string;
  /** Project branches only: `owner/name`. */
  repo?: string;
  branches: Branch[];
  threads: ThreadNode[];
};

export type Conn = "up" | "down" | "unauthorized";

export type Tree = { conn: Conn; lastUpdate: string | null; projects: Branch[] };

const flat = (t: ThreadNode): ThreadNode[] => [t, ...t.children.flatMap(flat)];
export const allThreads = (b: Branch): ThreadNode[] => [
  ...b.branches.flatMap(allThreads),
  ...b.threads.flatMap(flat),
];
