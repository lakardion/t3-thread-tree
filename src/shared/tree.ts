/** The placed tree that the backend pushes and the page renders. */
export type Status = "needs-input" | "running" | "completed" | "cancelled" | "idle" | "snoozed";

export type ThreadNode = {
  id: string;
  href: string;
  title: string;
  status: Status;
  /** Raw T3 status, for the dot tooltip. */
  raw: string;
  snoozedUntil: string | null;
  /** `pos` is null when the thread created no PR in the stack. */
  stack: { pos: number | null; total: number } | null;
  prs: { n: number; url: string; state: string }[];
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
