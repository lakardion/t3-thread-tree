import index from "./page/index.html";
import type { Conn, Tree } from "./shared/tree.ts";
import { buildTree } from "./server/build-tree.ts";
import { mayBeLaunched, openLineage } from "./server/lineage.ts";
import { connectShell, readEnvironmentId, type Project, type Thread } from "./server/t3.ts";

const threads = new Map<string, Thread>();
const projects = new Map<string, Project>();
let conn: Conn = "down";
let lastUpdate: string | null = null;
const environmentId = await readEnvironmentId();

const lineage = openLineage();
lineage.reload();
const spawners = new Map<string, string | null>();
/** Launched threads whose tool-call row was not written yet, with the retries left. */
const unresolved = new Map<string, number>();

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
    lineage.reload();
    for (const [id, left] of unresolved) {
      const s = lineage.spawner(id);
      if (s || left <= 1) spawners.set(id, s), unresolved.delete(id);
      else unresolved.set(id, left - 1);
    }
    changed();
    resolveSpawners();
  }, 2000);
}

type Client = { settled: boolean; send: (data: string) => void };
const clients = new Set<Client>();

const linearWorkspace = process.env.LINEAR_WORKSPACE?.trim();
const linearTeams = (process.env.LINEAR_TEAMS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const linear: Tree["linear"] = linearWorkspace && linearTeams.length ? { workspace: linearWorkspace, teams: linearTeams } : null;

const treeFor = (settled: boolean): Tree => ({
  conn,
  lastUpdate,
  linear,
  projects: buildTree({
    threads: threads.values(),
    projects,
    spawnerOf: (id) => spawners.get(id),
    environmentId,
    settled,
    now: Date.now(),
  }),
});

let timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const cache = new Map<boolean, string>();
    for (const c of clients) {
      if (!cache.has(c.settled)) cache.set(c.settled, JSON.stringify(treeFor(c.settled)));
      c.send(cache.get(c.settled)!);
    }
  }, 150);
}
/** Snoozes end on a clock, not on a stream event. */
setInterval(changed, 30_000);

connectShell({
  token: process.env.T3_TOKEN,
  onConn: (c) => {
    if (c !== conn) (conn = c), changed();
  },
  onEvent: (e) => {
    lastUpdate = new Date().toISOString();
    switch (e.kind) {
      case "snapshot":
        if (e.fresh) threads.clear(), projects.clear();
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
  },
});

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4773,
  routes: {
    "/": index,
    "/events": (req) => {
      server.timeout(req, 0);
      const settled = new URL(req.url).searchParams.get("settled") === "1";
      const enc = new TextEncoder();
      let client: Client;
      return new Response(
        new ReadableStream({
          start(ctrl) {
            client = { settled, send: (d) => ctrl.enqueue(enc.encode(`data: ${d}\n\n`)) };
            clients.add(client);
            client.send(JSON.stringify(treeFor(settled)));
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
console.log(`thread tree on ${server.url}`);
