import { allThreads, type Branch, type Label, type PrNode, type ThreadNode, type Tree } from "../shared/tree.ts";

/** Adjacent branches with the same stack id form one run. A branch with no stack is a run of one. */
export function stackRuns(bs: Branch[]): Branch[][] {
  const runs: Branch[][] = [];
  for (const b of bs) {
    const last = runs.at(-1);
    if (b.stack && last?.[0]?.stack?.id === b.stack.id) last.push(b);
    else runs.push([b]);
  }
  return runs;
}

/** The PR a stack group opened: the first PR of its thread with a stack position. */
export const ownPr = (g: Branch): PrNode | undefined => allThreads(g).find((t) => t.stack?.pos)?.prs[0];

/** The stack position of the PR a stack group opened, or undefined when no thread of it has one. */
export const ownPos = (g: Branch): number | undefined =>
  allThreads(g).find((t) => t.stack?.pos)?.stack?.pos ?? undefined;

/** The label of a stack stop: its position, with " of total" when the run hides some PRs of the stack. */
export const stopLabel = (n: number | undefined, total: number, partial: boolean): string =>
  n === undefined ? "" : partial ? `${n} of ${total}` : `${n}`;

type RailStop = { id: string; label: string; p: PrNode | undefined; n: number | undefined };
type RailRow = { t: ThreadNode; chip: string | undefined; stop: RailStop; n: number | undefined };

/**
 * The stops and rows of one stack run. Each thread with a stack position is a stop, in position order;
 * a group with no such thread is one stop. A row with no stop of its own takes its group's first stop.
 * A stop's number is its stack position, so it stays right when a filter hides other stops.
 */
export function railRows(run: Branch[]): { stops: RailStop[]; rows: RailRow[] } {
  const stops: RailStop[] = [];
  const rows: RailRow[] = [];
  for (const g of run) {
    const chip = isKeyGroup(g) ? g.label : undefined;
    const byPos = g.threads.filter((t) => t.stack?.pos).toSorted((a, b) => a.stack!.pos! - b.stack!.pos!);
    const own = new Map(byPos.map((t) => [t.id, { id: t.id, label: g.label, p: t.prs[0], n: t.stack!.pos! }]));
    const first = own.values().next().value ?? { id: g.id, label: g.label, p: ownPr(g), n: ownPos(g) };
    stops.push(...(own.size ? own.values() : [first]));
    [...byPos, ...g.threads.filter((x) => !own.has(x.id))].forEach((t, j) => {
      const stop = own.get(t.id);
      const numbered = stop ?? (!own.size && j === 0 ? first : undefined);
      rows.push({ t, chip, stop: stop ?? first, n: numbered?.n });
    });
  }
  return { stops, rows };
}

/**
 * The rail color of a stack PR: grey when draft or unknown, red when blocked, green when approved, blue otherwise.
 * The `-fg` tokens keep 4.5:1 contrast against `--background` text in both themes.
 */
export function prTone(p: PrNode | undefined): string {
  if (!p || p.draft) return "var(--muted-foreground)";
  if (p.checks === "failing" || p.conflicting || p.review === "changes-requested") return "var(--status-failed-fg)";
  if (p.review === "approved") return "var(--status-done-fg)";
  return "var(--status-working-fg)";
}

/** "now" below 1 minute, then "12m", "3h", "2d". */
export function ago(iso: string, now: number): string {
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** The phrase with its elapsed time: "Working 12m", "Approval · 3m". */
export function phraseWith(t: Pick<ThreadNode, "status" | "phrase" | "since">, now: number): string {
  if (!t.since) return t.phrase;
  return `${t.phrase}${t.status === "needs-input" ? " ·" : ""} ${ago(t.since, now)}`;
}

/** The title without its key prefix and the separators after it. */
export function stripKey(title: string, key: string): string {
  if (!title.startsWith(key)) return title;
  return title.slice(key.length).replace(/^[\s·:-]+/, "") || title;
}

/** True for a group whose top-level threads all carry the group label as their key. "Reviews" and "No issue key" are not key groups. */
export const isKeyGroup = (b: Branch): boolean => b.threads.length > 0 && b.threads.every((t) => t.key === b.label);

/** The one thread of a key group that folds into its row, else null. */
export const folded = (b: Branch): ThreadNode | null => (isKeyGroup(b) && b.threads.length === 1 ? b.threads[0] : null);

/** The Linear issue URL, else null. With teams set, only a key of a listed team links. */
export function linearHref(key: string, linear: Tree["linear"]): string | null {
  if (!linear || (linear.teams.length && !linear.teams.includes(key.slice(0, key.lastIndexOf("-"))))) return null;
  return `https://linear.app/${linear.workspace}/issue/${key}`;
}

/** The fold ids of a group and of the groups in it. A group that folds into its one thread has none. */
export const groupIds = (g: Branch): string[] => (folded(g) ? [] : [g.id, ...g.branches.flatMap(groupIds)]);

/** The fold ids of the rows in a project: its groups and its PR stacks. */
export const foldIds = (project: Branch): string[] =>
  stackRuns(project.branches).flatMap((run) => (run[0].stack ? [`rail:${run[0].stack.id}`] : groupIds(run[0])));

/** Initials of the first three words of a label name: "ready-for-review" gives "RFR". */
export const initials = (name: string): string =>
  name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");

/** Black or white text for a label color of six hex digits. */
export const ink = (hex: string): string => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000" : "#fff";
};

/**
 * The Label pill of a row: its first watched label in list order, the count of the other names, and the tooltip.
 * Only the open PRs of the row count. Null for a settled row or with no match.
 */
export function labelPill(t: ThreadNode, watched: string[]): { label: Label; more: number; tip: string } | null {
  if (t.settled || !watched.length) return null;
  const order = watched.map((w) => w.toLowerCase());
  const hits = t.prs
    .filter((p) => p.state === "open")
    .flatMap((p) => p.labels.filter((l) => order.includes(l.name.toLowerCase())).map((l) => ({ l, n: p.n })))
    .toSorted((a, b) => order.indexOf(a.l.name.toLowerCase()) - order.indexOf(b.l.name.toLowerCase()));
  if (!hits.length) return null;
  const names = new Set(hits.map((h) => h.l.name.toLowerCase()));
  return {
    label: hits[0].l,
    more: names.size - 1,
    tip: hits.map((h) => `${h.l.name}: #${h.n}`).join(" · "),
  };
}
