import { homedir } from "node:os";
import { join } from "node:path";

import index from "./page/index.html";
import { briefInput, briefService, detectClis, lastMessageRoutes } from "./server/brief.ts";
import { buildTree } from "./server/build-tree.ts";
import { mayBeLaunched, needsScan, openLineage } from "./server/lineage.ts";
import { checkCli, cliPath, sendService } from "./server/send.ts";
import { connectShell, readEnvironmentId, type Project, type Thread } from "./server/t3.ts";
import { parseToken, readToken, writeToken } from "./server/token.ts";
import { parseLinear, type Conn, type Tree } from "./shared/tree.ts";

const threads = new Map<string, Thread>();
const projects = new Map<string, Project>();
let conn: Conn = "connecting";
let lastUpdate: string | null = null;
const environmentId = await readEnvironmentId();

const log = (m: string) => console.log(`thread tree: ${m}`);
let gotSnapshot = false;
let ready = false;
/** Ready once T3 answered: with a snapshot, or as down or unauthorized. */
function checkReady() {
  if (ready || conn === "connecting" || (conn === "up" && !gotSnapshot)) return;
  ready = true;
  log(conn === "up" ? `ready on ${server.url}` : `ready on ${server.url} (T3 ${conn})`);
  changed();
}

const lineage = openLineage();
const spawners = new Map<string, string | null>();
/** Launched threads whose initial message was not written yet, with the retries left. */
const unresolved = new Map<string, number>();
/** Launched threads without a sender message. Only the full scan of launch tool calls can resolve them. */
const unscanned = new Set<string>();

let scanning = false;
/** The full scan takes seconds on a cold disk, so it runs in a Worker, and only when a requested view needs it. The worker path resolves from cwd in dev and from the bundle root in the binary. */
function scanIfNeeded() {
  const settledView = [...clients].some((c) => c.settled);
  if (scanning || !needsScan(unscanned, threads.values(), (id) => spawners.get(id), settledView)) return;
  scanning = true;
  const ids = [...unscanned];
  const started = performance.now();
  const scan = new Worker("./src/server/lineage-scan.ts");
  scan.onmessage = (e: MessageEvent<[string, string][]>) => {
    scan.terminate();
    scanning = false;
    lineage.seed(e.data);
    log(`launch lineage scanned in ${Math.round(performance.now() - started)} ms`);
    for (const id of ids) {
      spawners.set(id, lineage.spawner(id));
      unscanned.delete(id);
    }
    changed();
    scanIfNeeded();
  };
}

let retry: ReturnType<typeof setTimeout> | undefined;
function resolveSpawners() {
  for (const t of threads.values()) {
    if (t.parentThreadId || spawners.has(t.id) || unresolved.has(t.id) || !mayBeLaunched(t.id)) continue;
    const s = lineage.spawner(t.id);
    if (s) spawners.set(t.id, s);
    else unresolved.set(t.id, 3);
  }
  if (unresolved.size === 0 || retry) return;
  retry = setTimeout(() => {
    retry = undefined;
    for (const [id, left] of unresolved) {
      const s = lineage.spawner(id);
      if (s || left <= 1) {
        spawners.set(id, s);
        unresolved.delete(id);
      } else unresolved.set(id, left - 1);
      if (!s && left <= 1) unscanned.add(id);
    }
    changed();
    resolveSpawners();
    scanIfNeeded();
  }, 2000);
}

type Client = { settled: boolean; nest: boolean; send: (data: string, event?: string) => void };
const clients = new Set<Client>();

const linear = parseLinear(process.env.LINEAR_WORKSPACE, process.env.LINEAR_TEAMS);

const treeFor = (settled: boolean, nest = false): Tree => ({
  conn: ready ? conn : "connecting",
  lastUpdate,
  linear,
  projects: buildTree({
    threads: threads.values(),
    projects,
    spawnerOf: (id) => spawners.get(id),
    environmentId,
    settled,
    nest,
    now: Date.now(),
  }),
});

let timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const cache = new Map<string, string>();
    for (const c of clients) {
      const key = `${c.settled}:${c.nest}`;
      if (!cache.has(key)) cache.set(key, JSON.stringify(treeFor(c.settled, c.nest)));
      c.send(cache.get(key)!);
    }
  }, 150);
}
/** Snoozes end on a clock, not on a stream event. */
setInterval(changed, 30_000);

/** The page saves the token here. `T3_TOKEN` is the fallback when the file has none. */
const tokenFile = process.env.T3_TOKEN_FILE ?? join(homedir(), ".config", "t3-thread-tree", "token");
let token = readToken(tokenFile) ?? parseToken(process.env.T3_TOKEN) ?? undefined;

log("connecting to T3…");
const shell = connectShell({
  token: () => token,
  onConn: (c) => {
    if (c !== conn && c !== "up")
      log(
        c === "down"
          ? "T3 not running, retrying every 3 s"
          : c === "no-token"
            ? "no T3 token set"
            : "T3 rejected the token",
      );
    if (c !== conn) {
      conn = c;
      changed();
    }
    checkReady();
  },
  onEvent: (e) => {
    lastUpdate = new Date().toISOString();
    switch (e.kind) {
      case "snapshot":
        if (e.fresh) {
          threads.clear();
          projects.clear();
        }
        gotSnapshot = true;
        for (const t of e.threads) threads.set(t.id, t);
        for (const [id, project] of e.projects) projects.set(id, project);
        break;
      case "thread":
        threads.set(e.thread.id, e.thread);
        break;
      case "thread.removed":
        threads.delete(e.id);
        break;
      case "project":
        projects.set(e.id, e.project);
        break;
      case "project.removed":
        projects.delete(e.id);
        break;
    }
    resolveSpawners();
    changed();
    checkReady();
  },
});

const brief = briefService({
  clis: detectClis(),
  input: (settled) => briefInput(treeFor(settled).projects, lineage.lastMessages, Date.now()),
  onChange: () => {
    const data = JSON.stringify(brief.state());
    for (const c of clients) c.send(data, "brief");
  },
});

const t3Cli = checkCli(cliPath());
void t3Cli.then((c) => c.available || log(`no t3 CLI at ${c.path}, sending is off`));
const send = sendService({
  cli: t3Cli,
  hasThread: (id) => threads.get(id)?.gone === false,
  hasProject: (id) => projects.has(id),
});

const server = Bun.serve({
  /** Above the 30 s CLI timeout, so a slow send still gets its 502 body. */
  idleTimeout: 40,
  hostname: "127.0.0.1",
  port: Number(process.env.PORT) || 4773,
  routes: {
    "/": index,
    ...brief.routes,
    ...send.routes,
    ...lastMessageRoutes({ read: (id) => lineage.lastMessages([id]).get(id) ?? null, has: (id) => threads.has(id) }),
    "/token": {
      /** JSON only: a cross-site form cannot send it without a CORS preflight, which this server does not answer. */
      POST: async (req) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
        const next = parseToken(body?.token);
        if (!next) return new Response("Not a valid token", { status: 400 });
        writeToken(tokenFile, next);
        token = next;
        shell.reconnect();
        return new Response(null, { status: 204 });
      },
    },
    "/events": (req) => {
      server.timeout(req, 0);
      const params = new URL(req.url).searchParams;
      const settled = params.get("settled") === "1";
      const nest = params.get("nest") === "1";
      const enc = new TextEncoder();
      let client: Client;
      return new Response(
        new ReadableStream({
          start(ctrl) {
            client = {
              settled,
              nest,
              send: (d, event) => ctrl.enqueue(enc.encode(`${event ? `event: ${event}\n` : ""}data: ${d}\n\n`)),
            };
            clients.add(client);
            if (settled) scanIfNeeded();
            client.send(JSON.stringify(treeFor(settled, nest)));
            client.send(JSON.stringify(brief.state()), "brief");
          },
          cancel() {
            clients.delete(client);
          },
        }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
      );
    },
  },
});
log(`serving on ${server.url}`);
