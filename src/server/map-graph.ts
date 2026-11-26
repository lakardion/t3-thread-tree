/** The slow calls behind the PR graph of a map: key queries, behind-base details, `map.md`. */
import type { MapGraphData } from "../shared/map-graph.ts";
import type { PrNode } from "../shared/tree.ts";
import { issueKey, prNode, statusOf } from "./build-tree.ts";
import { parseMapMd, type MapLane } from "./map-md.ts";
import type { ListRow, Thread } from "./t3.ts";

const LINEAR = /^[A-Z][A-Z0-9]*-\d+$/;
const FRESH_MS = 60_000;

/** A row passes when a key equals its head branch or starts it (`abc-12-x`), or the title has the key as a word. */
export function rowMatches(row: { head: string | null; title: string | null }, keys: string[]): boolean {
  const head = row.head?.toLowerCase() ?? "";
  return keys.some(
    (key) =>
      head === key.toLowerCase() ||
      head.startsWith(`${key.toLowerCase()}-`) ||
      new RegExp(`\\b${key}\\b`, "i").test(row.title ?? ""),
  );
}

/** The Linear keys of the lanes, then the issue keys of the member titles, unique. Markdown keys give no query. */
export const graphKeys = (lanes: MapLane[], memberTitles: string[]): string[] => [
  ...new Set([
    ...lanes.flatMap((l) => l.keys.map((k) => k.key)).filter((k) => LINEAR.test(k)),
    ...memberTitles.flatMap((t) => issueKey(t) ?? []),
  ]),
];

export const isFresh = (entry: { at: number }, now: number, refresh: boolean) => !refresh && now - entry.at < FRESH_MS;

/** A queue that runs at most `n` calls at once. */
export function limit(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return <T>(call: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        call()
          .then(resolve, reject)
          .finally(() => {
            active--;
            waiting.shift()?.();
          });
      };
      if (active < n) run();
      else waiting.push(run);
    });
}

export type GraphCtx = {
  /** The live, settled and archived members. */
  members: Thread[];
  /** The T3 project of the map head. */
  project: string;
  threadOf: (repository: string, n: number) => string | null;
  hrefOf: (id: string) => string;
};

type Ref = { projectId: string; host: string; repository: string; number: number };

type PrDetail = {
  behindBy: number | null;
  url: string;
  title: string | null;
  state: string;
  draft: boolean;
  mergeability: string | null;
  head: string | null;
  base: string | null;
};

export function mapGraph(o: {
  list: (projectId: string, query: string) => Promise<{ rows: ListRow[]; error: string | null }>;
  detail: (ref: Ref) => Promise<PrDetail>;
  archived: () => Promise<Thread[]>;
  /** The text of `<key>/map.md`. Null for a key that is no folder, or when the file is missing. */
  readMap: (key: string) => Promise<string | null>;
  now: () => number;
}) {
  const queue = limit(4);
  const cache = new Map<string, { at: number; data: MapGraphData }>();
  const running = new Map<string, Promise<MapGraphData | null>>();

  async function build(key: string, ctxOf: (archived: Thread[]) => GraphCtx | null): Promise<MapGraphData | null> {
    const ctx = ctxOf(await queue(o.archived).catch(() => []));
    if (!ctx) return null;
    const text = await o.readMap(key);
    const map = text === null ? null : parseMapMd(text, key);
    const keys = graphKeys(
      map?.lanes ?? [],
      ctx.members.map((t) => t.title),
    );
    const errors: MapGraphData["errors"] = [];
    const found = new Map<string, ListRow>();
    await Promise.all(
      keys.map((k) =>
        queue(() => o.list(ctx.project, k)).then(
          ({ rows, error }) => {
            if (error) errors.push({ key: k, text: error });
            else for (const r of rows) if (rowMatches(r, keys)) found.set(`${r.repository}#${r.n}`, r);
          },
          (e: Error) => void errors.push({ key: k, text: e.message }),
        ),
      ),
    );

    const graphNumbers = new Set([
      ...ctx.members.flatMap((t) =>
        t.prs.filter((p) => p.source !== "stack" && p.source !== "stack-dismissed").map((p) => p.n),
      ),
      ...[...found.values()].map((r) => r.n),
    ]);
    const slots = new Map<string, { t: Thread; p: Thread["prs"][number]; n: number; stack: PrNode["stack"] }>();
    for (const t of ctx.members)
      for (const p of t.prs)
        for (const [i, n] of (p.stackSlots ?? []).entries())
          if (p.stackNumber !== null && !graphNumbers.has(n) && !slots.has(`${p.repository}#${n}`))
            slots.set(`${p.repository}#${n}`, {
              t,
              p,
              n,
              stack: { number: p.stackNumber, pos: i + 1, total: p.stackSlots!.length },
            });
    const links = ctx.members.flatMap((t) => t.prs).filter((l) => l.source === "stack" && l.head !== null);
    const mates: MapGraphData["mates"] = [];
    const addMate = (node: PrNode, repository: string) => {
      const threadId = ctx.threadOf(repository, node.n);
      mates.push({ ...node, threadId, threadHref: threadId && ctx.hrefOf(threadId) });
    };

    const refs = new Map<string, Ref>();
    const behind: Record<number, number> = {};
    const calls: Promise<void>[] = [];
    const detailed = new Set<string>();
    for (const [id, { t, p, n, stack }] of slots) {
      const link = links.find((l) => l.repository === p.repository && l.n === n);
      if (link) addMate({ ...prNode(link, []), stack }, p.repository);
      else {
        detailed.add(id);
        calls.push(
          queue(() => o.detail({ projectId: t.projectId, host: p.host, repository: p.repository, number: n })).then(
            (d) => {
              addMate(
                {
                  n,
                  url: d.url,
                  state: d.state,
                  draft: d.draft,
                  checks: null,
                  review: null,
                  conflicting: d.mergeability === "conflicting",
                  title: d.title,
                  head: d.head,
                  base: d.base,
                  stack,
                  additions: null,
                  deletions: null,
                  changedFiles: null,
                  labels: [],
                },
                p.repository,
              );
              if (d.state === "open" && d.behindBy !== null) behind[n] = d.behindBy;
            },
            () => {},
          ),
        );
      }
    }
    for (const t of ctx.members)
      for (const p of t.prs)
        if (p.state === "open" && p.stackNumber !== null && !detailed.has(`${p.repository}#${p.n}`))
          refs.set(`${p.repository}#${p.n}`, {
            projectId: t.projectId,
            host: p.host,
            repository: p.repository,
            number: p.n,
          });
    for (const [id, r] of found)
      if (r.state === "open" && r.stack)
        refs.set(id, { projectId: r.projectId, host: r.host, repository: r.repository, number: r.n });
    await Promise.all([
      ...calls,
      ...[...refs.values()].map((ref) =>
        queue(() => o.detail(ref)).then(
          (d) => void (d.behindBy !== null && (behind[ref.number] = d.behindBy)),
          () => {},
        ),
      ),
    ]);

    const now = o.now();
    return {
      at: new Date(now).toISOString(),
      lanes: map?.lanes ?? null,
      stacks: map?.stacks ?? null,
      settled: ctx.members
        .filter((t) => t.settledAt || t.gone)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: statusOf(t, now).status,
          createdAt: t.createdAt,
          href: ctx.hrefOf(t.id),
          prs: t.prs.map((p) => prNode(p, [])),
        })),
      rows: [...found.values()].map((r) => {
        const threadId = ctx.threadOf(r.repository, r.n);
        return { ...r, threadId, threadHref: threadId && ctx.hrefOf(threadId) };
      }),
      mates,
      behind,
      errors,
    };
  }

  return {
    /** The graph data of a map key, null when the key has no member. A running call for the key is shared. */
    get(key: string, ctxOf: (archived: Thread[]) => GraphCtx | null, refresh: boolean): Promise<MapGraphData | null> {
      const hit = cache.get(key);
      if (hit && isFresh(hit, o.now(), refresh)) return Promise.resolve(hit.data);
      let call = running.get(key);
      if (!call) {
        call = build(key, ctxOf)
          .then((data) => {
            if (data) cache.set(key, { at: o.now(), data });
            return data;
          })
          .finally(() => running.delete(key));
        running.set(key, call);
      }
      return call;
    },
  };
}

/** `GET /map-graph?key=<map key>[&refresh=1]`. 404 with no key or no member, 503 while T3 is not up. */
export function mapGraphRoutes(o: {
  up: () => boolean;
  get: (key: string, refresh: boolean) => Promise<MapGraphData | null>;
  timeout: (req: Request) => void;
}) {
  return {
    "/map-graph": {
      GET: async (req: Request) => {
        /** The calls can take longer than the idle timeout. */
        o.timeout(req);
        const params = new URL(req.url).searchParams;
        const key = params.get("key");
        if (!key) return new Response(null, { status: 404 });
        if (!o.up()) return new Response(null, { status: 503 });
        const data = await o.get(key, params.get("refresh") === "1");
        return data ? Response.json(data) : new Response(null, { status: 404 });
      },
    },
  };
}
