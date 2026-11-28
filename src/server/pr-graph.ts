/** The slow calls behind the PR graph of a scope: key queries, behind-base details, `map.md`, root branches. */
import { parseScope, type GroupGraphPart, type PrGraphData, type Scope } from "../shared/pr-graph-data.ts";
import { prId, rowMatches } from "../shared/pr-graph.ts";
import type { PrNode } from "../shared/tree.ts";
import { issueKey, prNode, statusOf } from "./build-tree.ts";
import { parseMapMd, type MapLane } from "./map-md.ts";
import { mapsOf } from "./maps.ts";
import type { ListRow, Thread } from "./t3.ts";

const LINEAR = /^[A-Z][A-Z0-9]*-\d+$/;
const FRESH_MS = 60_000;

/** The PRs of a thread that count as links: not the stack syncs. */
export const memberLink = (p: Thread["prs"][number]) => p.source !== "stack" && p.source !== "stack-dismissed";

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
  /** The graph members. At map and lineage scope also the settled and archived ones. */
  members: Thread[];
  /** The projects whose roots the answer carries. `none` is No project, with no path. */
  projects: { id: string; path: string | null }[];
  threadOf: (repository: string, n: number) => string | null;
  hrefOf: (id: string) => string;
  /**
   * Set only at map and lineage scope. `mapKey` is the map to read `map.md` of, null at lineage scope. `projectOf` gives
   * the T3 project for the query of a key.
   */
  group: { mapKey: string | null; projectOf: (key: string) => string } | null;
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

/** The default branch of the repository at `cwd`, from local git. Null when git has none. */
export async function gitRoot(cwd: string): Promise<string | null> {
  try {
    const p = Bun.spawn(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = (await new Response(p.stdout).text()).trim();
    return (await p.exited) === 0 && out ? out.replace(/^origin\//, "") : null;
  } catch {
    return null;
  }
}

/**
 * The threads of a lineage graph: the root, the members of its Lineage group and the keyless stack mates that join
 * it, oldest first. Null when `root` is no known thread, has a spawner, or has no member and no mate.
 */
export function lineageMembers(o: {
  root: string;
  threads: Thread[];
  spawnerOf: (id: string) => string | null | undefined;
  known: (id: string) => boolean;
  isStep: (id: string) => boolean;
  createdKey: (id: string) => string;
  /** The PR stacks of the threads, each lowest first. */
  stacks: string[][];
  issueKeyOf: (id: string) => boolean;
}): Thread[] | null {
  const maps = mapsOf({ ids: o.threads.map((t) => t.id), keyOf: () => null, ...o });
  if (!o.known(o.root) || maps.rootOf(o.root) !== o.root) return null;
  const mates = [...maps.mates].filter(([, r]) => r === o.root).map(([id]) => id);
  const group = maps.groups.get(o.root) ?? [];
  if (group.length === 0 && mates.length === 0) return null;
  const wanted = new Set([o.root, ...group, ...mates]);
  return o.threads
    .filter((t) => wanted.has(t.id))
    .toSorted((a, b) => o.createdKey(a.id).localeCompare(o.createdKey(b.id)));
}

export function prGraph(o: {
  list: (projectId: string, query: string) => Promise<{ rows: ListRow[]; error: string | null }>;
  detail: (ref: Ref) => Promise<PrDetail>;
  archived: () => Promise<Thread[]>;
  /** The text of `<key>/map.md`. Null for a key that is no folder, or when the file is missing. */
  readMap: (key: string) => Promise<string | null>;
  /** The root branch of the repository at a project path. */
  root: (path: string) => Promise<string | null>;
  now: () => number;
}) {
  const queue = limit(4);
  const cache = new Map<string, { at: number; data: PrGraphData }>();
  const running = new Map<string, Promise<PrGraphData | null>>();

  /** The key queries, `map.md` and the settled members of a map or lineage scope. */
  async function groupPart(ctx: GraphCtx, g: NonNullable<GraphCtx["group"]>) {
    const text = g.mapKey === null ? null : await o.readMap(g.mapKey);
    const parsed = text === null ? null : parseMapMd(text, g.mapKey!);
    const keys = graphKeys(
      parsed?.lanes ?? [],
      ctx.members.map((t) => t.title),
    );
    const errors: GroupGraphPart["errors"] = [];
    const found = new Map<string, ListRow>();
    await Promise.all(
      keys.map((k) =>
        queue(() => o.list(g.projectOf(k), k)).then(
          ({ rows, error }) => {
            if (error) errors.push({ key: k, text: error });
            else for (const r of rows) if (rowMatches(r, keys)) found.set(prId(r), r);
          },
          (e: Error) => void errors.push({ key: k, text: e.message }),
        ),
      ),
    );
    const now = o.now();
    const part: GroupGraphPart = {
      lanes: parsed?.lanes ?? null,
      stacks: parsed?.stacks ?? null,
      settled: ctx.members
        .filter((t) => t.settledAt || t.gone)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: statusOf(t, now).status,
          createdAt: t.createdAt,
          href: ctx.hrefOf(t.id),
          prs: t.prs.map((p) => prNode(p, [])),
          projectId: t.projectId,
        })),
      rows: [...found.values()].map((r) => {
        const threadId = ctx.threadOf(r.repository, r.n);
        return { ...r, threadId, threadHref: threadId && ctx.hrefOf(threadId) };
      }),
      errors,
    };
    return { part, found };
  }

  /** The stack mates and the behind-base counts of the graph PRs and the key rows. */
  async function details(ctx: GraphCtx, found: Map<string, ListRow>) {
    const graphIds = new Set([...ctx.members.flatMap((t) => t.prs.filter(memberLink).map(prId)), ...found.keys()]);
    const slots = new Map<string, { t: Thread; p: Thread["prs"][number]; n: number; stack: PrNode["stack"] }>();
    for (const t of ctx.members)
      for (const p of t.prs)
        for (const [i, n] of (p.stackSlots ?? []).entries()) {
          const id = prId({ repository: p.repository, n });
          if (p.stackNumber !== null && !graphIds.has(id) && !slots.has(id))
            slots.set(id, {
              t,
              p,
              n,
              stack: { number: p.stackNumber, pos: i + 1, total: p.stackSlots!.length },
            });
        }
    const links = ctx.members.flatMap((t) => t.prs).filter((l) => l.source === "stack" && l.head !== null);
    const mates: PrGraphData["mates"] = [];
    const addMate = (node: PrNode) => {
      const threadId = ctx.threadOf(node.repository, node.n);
      mates.push({ ...node, threadId, threadHref: threadId && ctx.hrefOf(threadId) });
    };

    const refs = new Map<string, Ref>();
    const behind: Record<string, number> = {};
    const calls: Promise<void>[] = [];
    const detailed = new Set<string>();
    for (const [id, { t, p, n, stack }] of slots) {
      const link = links.find((l) => l.repository === p.repository && l.n === n);
      if (link) addMate({ ...prNode(link, []), stack });
      else {
        detailed.add(id);
        calls.push(
          queue(() => o.detail({ projectId: t.projectId, host: p.host, repository: p.repository, number: n })).then(
            (d) => {
              addMate({
                repository: p.repository,
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
              });
              if (d.state === "open" && d.behindBy !== null) behind[id] = d.behindBy;
            },
            () => {},
          ),
        );
      }
    }
    for (const t of ctx.members)
      for (const p of t.prs)
        if (p.state === "open" && p.stackNumber !== null && !detailed.has(prId(p)))
          refs.set(prId(p), {
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
          (d) =>
            void (d.behindBy !== null && (behind[prId({ repository: ref.repository, n: ref.number })] = d.behindBy)),
          () => {},
        ),
      ),
    ]);

    return { mates, behind };
  }

  async function build(scope: Scope, ctxOf: (archived: Thread[]) => GraphCtx | null): Promise<PrGraphData | null> {
    const ctx = ctxOf(scope.kind === "map" || scope.kind === "lineage" ? await queue(o.archived).catch(() => []) : []);
    if (!ctx) return null;
    const part = ctx.group ? await groupPart(ctx, ctx.group) : null;
    const { mates, behind } = await details(ctx, part?.found ?? new Map());
    const roots: PrGraphData["roots"] = {};
    await Promise.all(
      ctx.projects.map(async (p) => {
        const root = p.path && (await o.root(p.path));
        if (root) roots[p.id] = root;
      }),
    );
    return { at: new Date(o.now()).toISOString(), roots, mates, behind, group: part?.part ?? null };
  }

  return {
    /** The graph data of a scope, null when the scope has no member. A running call for the scope id is shared. */
    get(
      scopeId: string,
      scope: Scope,
      ctxOf: (archived: Thread[]) => GraphCtx | null,
      refresh: boolean,
    ): Promise<PrGraphData | null> {
      const hit = cache.get(scopeId);
      if (hit && isFresh(hit, o.now(), refresh)) return Promise.resolve(hit.data);
      let call = running.get(scopeId);
      if (!call) {
        call = build(scope, ctxOf)
          .then((data) => {
            if (data) cache.set(scopeId, { at: o.now(), data });
            return data;
          })
          .finally(() => running.delete(scopeId));
        running.set(scopeId, call);
      }
      return call;
    },
  };
}

/** `GET /pr-graph?scope=<scope id>[&refresh=1]`. 404 with a bad scope or no member, 503 while T3 is not up. */
export function prGraphRoutes(o: {
  up: () => boolean;
  get: (scopeId: string, scope: Scope, refresh: boolean) => Promise<PrGraphData | null>;
  timeout: (req: Request) => void;
}) {
  return {
    "/pr-graph": {
      GET: async (req: Request) => {
        /** The calls can take longer than the idle timeout. */
        o.timeout(req);
        const params = new URL(req.url).searchParams;
        const scopeId = params.get("scope");
        const scope = parseScope(scopeId);
        if (!scopeId || !scope) return new Response(null, { status: 404 });
        if (!o.up()) return new Response(null, { status: 503 });
        const data = await o.get(scopeId, scope, params.get("refresh") === "1");
        return data ? Response.json(data) : new Response(null, { status: 404 });
      },
    },
  };
}
