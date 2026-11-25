import type { Group, ThreadNode } from "../shared/tree.ts";
import type { Thread } from "./t3.ts";

/** Settle time in ms, zero-padded so a string compare orders it, then the id. A bad date sorts first. */
export const settledKey = (t: Thread) => `${String(Date.parse(t.settledAt ?? "") || 0).padStart(16, "0")} ${t.id}`;

const listed = (t: Thread) => !!t.settledAt && !t.workflowRun && !t.parentThreadId && !t.sideChat && !t.gone;

/** Changes when a settled thread appears, leaves or changes: `count:newest settle:newest update`. Empty with none. */
export function settledSignature(threads: Iterable<Thread>): string {
  let count = 0;
  let key = "";
  let updated = 0;
  for (const t of threads) {
    if (!listed(t)) continue;
    count++;
    const k = settledKey(t);
    if (k > key) key = k;
    updated = Math.max(updated, Date.parse(t.updatedAt) || 0);
  }
  return count ? `${count}:${key}:${updated}` : "";
}

const settledIn = (b: Group): ThreadNode[] => [...b.groups.flatMap(settledIn), ...b.threads.filter((t) => t.settled)];

/**
 * One page of settled threads, newest settle first. `projects` is the unnested tree with settled threads.
 * `after` is the `next` of the previous page. `next` is null on the last page.
 */
export function settledPage(projects: Group[], threads: Map<string, Thread>, after: string | null, limit: number) {
  const keyed = projects
    .flatMap((p) =>
      settledIn(p).map((t) => ({
        project: { id: p.id, label: p.label, repo: p.repo, groups: [], threads: [] } as Group,
        t,
        key: settledKey(threads.get(t.id)!),
      })),
    )
    .toSorted((a, b) => (a.key < b.key ? 1 : -1));
  const rest = after === null ? keyed : keyed.filter((k) => k.key < after);
  const page = rest.slice(0, limit);
  return {
    items: page.map(({ project, t }) => ({ project, t })),
    next: rest.length > limit ? page[page.length - 1].key : null,
    total: keyed.length,
  };
}

/** `GET /settled?after=&limit=`: a page of `settledPage`. `limit` defaults to 50 and clamps to 1..1000. */
export function settledRoutes(o: { page: (after: string | null, limit: number) => ReturnType<typeof settledPage> }) {
  return {
    "/settled": {
      GET: (req: Request) => {
        const params = new URL(req.url).searchParams;
        const n = Number.parseInt(params.get("limit") ?? "", 10);
        const limit = Number.isNaN(n) ? 50 : Math.min(Math.max(n, 1), 1000);
        return Response.json(o.page(params.get("after"), limit));
      },
    },
  };
}
