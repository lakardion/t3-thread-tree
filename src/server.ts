import { homedir } from "node:os";
import { dirname, join } from "node:path";

import index from "./page/index.html";
import upNext from "./page/up-next.html";
import {
  buildLinearTree,
  buildTree,
  computeStacks,
  defaultRules,
  hrefOf,
  issueKey,
  parseRules,
} from "./server/build-tree.ts";
import { catchUpService } from "./server/catch-up.ts";
import { findRoutes } from "./server/find.ts";
import { labelStore } from "./server/labels.ts";
import { lastMessageRoutes } from "./server/last-message.ts";
import { mayBeLaunched, needsScan, openLineage } from "./server/lineage.ts";
import { fetchLinear } from "./server/linear-api.ts";
import { linearStore } from "./server/linear.ts";
import { mapKey, mapsOf } from "./server/maps.ts";
import {
  appleHelperPath,
  createModels,
  localModelRoutes,
  pickRoutes,
  readLocalConfig,
  readPickFile,
} from "./server/model.ts";
import { gitRoot, lineageMembers, memberLink, prGraph, prGraphRoutes, type GraphCtx } from "./server/pr-graph.ts";
import { runItems } from "./server/runs.ts";
import { checkCli, cliPath, projectChoices, sendService } from "./server/send.ts";
import { settleRoutes } from "./server/settle.ts";
import { settledPage, settledRoutes, settledSignature } from "./server/settled.ts";
import {
  connectShell,
  decodeDefinitionFiles,
  decodeRunSteps,
  readEnvironmentId,
  type Project,
  type RunStepsRaw,
  type RunsSnapshot,
  type Thread,
} from "./server/t3.ts";
import { parseToken, readToken, tokenResponse, writeToken } from "./server/token.ts";
import { launchList, scanFields } from "./server/workflow-start.ts";
import { workflowRoutes } from "./server/workflows.ts";
import { isGraphMember, type Scope } from "./shared/pr-graph-data.ts";
import type { RuleId } from "./shared/rules.ts";
import type { RunItem } from "./shared/runs.ts";
import { allRuns, allThreads, parseLabels, parseLinear, type Conn, type Tree } from "./shared/tree.ts";
import type { Field } from "./shared/workflow-start.ts";

const threads = new Map<string, Thread>();
const projects = new Map<string, Project>();
let runs: RunItem[] | null = null;
let runsSnapshot: RunsSnapshot | null = null;
let runsOrigin: string | undefined;
/** The fields that the workflow files name, by workflow name. Null while unread or when the read failed. */
let fieldScan: Map<string, Field[]> | null = null;
let scanError: string | null = null;
let readingFiles = false;
let latestSnapshot: RunsSnapshot | null = null;
let scannedRevision: number | null | undefined;
/** The fetched steps of each run in the tree, with the run `updatedAt` they were fetched at. */
const runSteps = new Map<string, { at: string; steps: RunStepsRaw }>();
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
function scanIfNeeded(settledView = false) {
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

const rows = new Map<string, ReturnType<typeof lineage.row>>();
/** The thread table row of an id. A missing id stays missing: a spawner row exists before its child. */
function rowOf(id: string) {
  if (!rows.has(id)) rows.set(id, lineage.row(id));
  return rows.get(id)!;
}
/** The id is in the thread table, archived and deleted rows included. */
const known = (id: string) => threads.has(id) || rowOf(id) !== null;

/** The map key of each thread, from its first message. A thread with no user message yet is read again. */
const mapKeys = new Map<string, string | null>();
function mapKeyOf(id: string): string | null {
  if (mapKeys.has(id)) return mapKeys.get(id)!;
  const text = lineage.firstMessage(id);
  if (text === null) return null;
  const key = mapKey(text, projects.get(threads.get(id)?.projectId ?? "")?.path, homedir());
  mapKeys.set(id, key);
  return key;
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

type Client = { rules: RuleId[]; labels: string[]; wantsLinear: boolean; send: (data: string, event?: string) => void };
const clients = new Set<Client>();

const linear = parseLinear(process.env.LINEAR_WORKSPACE, process.env.LINEAR_TEAMS);

const treeFor = (settled: boolean, rules = defaultRules(), labels: string[] = [], wantsLinear = false): Tree => ({
  conn: ready ? conn : "connecting",
  lastUpdate,
  linear,
  linearKey: linearSource.state(),
  settled: settledSignature(threads.values()),
  runs,
  workflows: runsSnapshot && launchList(runsSnapshot.workflows ?? [], fieldScan),
  workflowScan: scanError,
  t3Origin: runsOrigin ?? null,
  projects: (wantsLinear ? buildLinearTree : buildTree)(
    {
      threads: threads.values(),
      projects,
      spawnerOf: (id) => spawners.get(id),
      environmentId,
      settled,
      now: Date.now(),
      labels,
      labelsOf: store.labelsOf,
      linearOf: wantsLinear ? linearSource.of : undefined,
      catchUpOf: (id) => catchUp.of(id),
      lastMessagesOf: lineage.lastMessages,
      runs: runsSnapshot,
      stepsOf: (runId) => runSteps.get(runId)?.steps,
      origin: runsOrigin,
      mapKeyOf,
      rowOf,
    },
    rules,
  ),
});

const active = () => [...clients].some((c) => c.labels.length > 0);
const store = labelStore({
  detail: (r) =>
    shell.detail(r).catch((e: Error) => (e.message === "T3 is not connected" ? "dropped" : Promise.reject(e))),
  onChange: () => changed(),
});

const linearSource = linearStore({ fetch: fetchLinear, every: 600_000, onChange: () => changed() });

/** Tells the Linear source every issue key of the visible threads. It learns them even when no page wants Linear data. */
function syncLinear() {
  const keys = new Set<string>();
  for (const t of threads.values()) {
    const key = issueKey(t.title);
    if (key && !t.parentThreadId && !t.sideChat && !t.gone && !t.settledAt) keys.add(key);
  }
  /** The Issue key of each settled ancestor in the spawner chain of a visible thread: its header needs Linear data. */
  for (const t of threads.values()) {
    if (t.parentThreadId || t.sideChat || t.gone || t.settledAt) continue;
    const seen = new Set([t.id]);
    for (let id = spawnerOf(t.id); id && !seen.has(id); id = spawnerOf(id)) {
      seen.add(id);
      const a = threads.get(id);
      const title = a ? (a.settledAt || a.gone ? a.title : null) : rowOf(id)?.title;
      const key = title ? issueKey(title) : null;
      if (key) keys.add(key);
    }
  }
  const withSteps = new Set([...threads.values()].flatMap((t) => (t.workflowRun ? [t.workflowRun.runId] : [])));
  for (const r of runsSnapshot?.runs ?? []) {
    const key = withSteps.has(r.runId) ? issueKey(r.title) : null;
    if (key) keys.add(key);
  }
  linearSource.sync(
    keys,
    [...clients].some((c) => c.wantsLinear),
  );
}

/** Fetches the steps of each run in the tree again when its `updatedAt` changed. A failed fetch keeps the old steps. */
function syncSteps(nodes: ReturnType<typeof allRuns>) {
  const live = new Set(nodes.map((n) => n.run!.runId));
  for (const id of runSteps.keys()) if (!live.has(id)) runSteps.delete(id);
  for (const n of nodes) {
    const { runId } = n.run!;
    const at = n.updatedAt;
    if (runSteps.get(runId)?.at === at) continue;
    runSteps.set(runId, { at, steps: runSteps.get(runId)?.steps ?? [] });
    shell.workflow("workflows.get", { runId }).then(
      (r) => {
        if (runSteps.get(runId)?.at !== at) return;
        runSteps.set(runId, { at, steps: decodeRunSteps(r) });
        changed();
      },
      (e: Error) => log(`could not read run ${runId}: ${e.message}`),
    );
  }
}

/** A failure of the connection, not of the read: the last scan stays and the next snapshot retries. */
const TRANSIENT = /not connected|timed out/i;

/**
 * Reads the workflow files when `revision` changed. A transient failure keeps the last scan and retries on the next
 * snapshot. Any other failure holds until the revision changes.
 */
function syncScan(snapshot: RunsSnapshot) {
  latestSnapshot = snapshot;
  const revision = snapshot.revision ?? null;
  if (readingFiles || (snapshot.workflows ?? []).length === 0 || revision === scannedRevision) return;
  readingFiles = true;
  shell
    .workflow("workflows.getDefinition", {})
    .then(
      (r) => {
        fieldScan = scanFields(decodeDefinitionFiles(r));
        scanError = null;
        scannedRevision = revision;
      },
      (e: Error) => {
        if (TRANSIENT.test(e.message)) return;
        if (e.message !== scanError) log(`could not read the workflow files: ${e.message}`);
        fieldScan = null;
        scanError = e.message;
        scannedRevision = revision;
      },
    )
    .finally(() => {
      readingFiles = false;
      changed();
      if (latestSnapshot && (latestSnapshot.revision ?? null) !== revision) syncScan(latestSnapshot);
    });
}

let timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tree = treeFor(false).projects;
    catchUp.sync(tree.flatMap(allThreads), lineage.lastEntries, Date.now());
    syncSteps(tree.flatMap(allRuns));
    const cache = new Map<string, string>();
    for (const c of clients) {
      const key = `${c.rules.join(",")}|${c.labels.join(",")}|${c.wantsLinear}`;
      if (!cache.has(key)) cache.set(key, JSON.stringify(treeFor(false, c.rules, c.labels, c.wantsLinear)));
      c.send(cache.get(key)!);
    }
  }, 150);
}
/** Snoozes end on a clock, not on a stream event. */
setInterval(changed, 30_000);

/** The page saves the Linear API key here. `LINEAR_API_KEY` is the fallback when the file has none. */
const linearKeyFile = process.env.LINEAR_KEY_FILE ?? join(homedir(), ".config", "t3-thread-tree", "linear-key");
linearSource.setKey(readToken(linearKeyFile) ?? parseToken(process.env.LINEAR_API_KEY) ?? undefined);

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
  onRuns: (snapshot, origin) => {
    runs = runItems(snapshot, origin, environmentId);
    runsSnapshot = snapshot;
    runsOrigin = origin;
    syncScan(snapshot);
    changed();
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
    store.sync(threads.values(), active());
    syncLinear();
    changed();
    checkReady();
  },
});

const graph = prGraph({
  list: (projectId, query) => shell.list(projectId, query),
  detail: (ref) => shell.detail(ref),
  archived: () => shell.archived(),
  readMap: (key) =>
    key.startsWith("/")
      ? Bun.file(join(key, "map.md"))
          .text()
          .catch(() => null)
      : Promise.resolve(null),
  root: gitRoot,
  now: Date.now,
});

/** The spawner of a thread, also of an archived one that the scan never saw. */
const spawnerOf = (id: string) => (spawners.has(id) ? spawners.get(id) : lineage.spawner(id));

const createdKey = (t: Thread) => `${t.createdAt ?? ""} ${t.id}`;

/** The `hrefOf` and `threadOf` of a graph answer: the oldest of `list` that links a PR. */
const linkLookup = (list: Iterable<Thread>): Pick<GraphCtx, "hrefOf" | "threadOf"> => {
  const linking = [...list].toSorted((a, b) => createdKey(a).localeCompare(createdKey(b)));
  return {
    hrefOf: (id) => hrefOf(environmentId, id),
    threadOf: (repository, n) =>
      linking.find((t) => t.prs.some((p) => p.repository === repository && p.n === n))?.id ?? null,
  };
};

/** The members of a map, with the archived threads that the stream leaves out. Null when the map has none. */
const mapCtx = (key: string, archived: Thread[]): GraphCtx | null => {
  const all = new Map([...archived, ...threads.values()].map((t) => [t.id, t]));
  const created = (id: string) => `${all.get(id)?.createdAt ?? ""} ${id}`;
  const pool = [...all.values()].filter((t) => !t.parentThreadId && !t.sideChat && !t.workflowRun);
  const maps = mapsOf({
    ids: pool.map((t) => t.id),
    spawnerOf,
    known,
    isStep: (id) => !!all.get(id)?.workflowRun,
    keyOf: mapKeyOf,
    createdKey: created,
  });
  const members = pool
    .filter((t) => maps.mapOf(t.id) === key)
    .toSorted((a, b) => created(a.id).localeCompare(created(b.id)));
  if (members.length === 0) return null;
  /** The oldest thread with this key as its own and no ancestor with it. Its map thread places the map. */
  const top = members.find((t) => mapKeyOf(t.id) === key && !maps.ancestors(t.id).some((a) => mapKeyOf(a) === key));
  const mapThread = top && maps.threadOf(maps.rootOf(top.id)!, key);
  const project = (mapThread && (all.get(mapThread)?.projectId ?? rowOf(mapThread)?.projectId)) || members[0].projectId;
  return {
    members,
    projects: [{ id: project, path: projects.get(project)?.path ?? null }],
    group: { mapKey: key, projectOf: () => project },
    ...linkLookup(all.values().filter((t) => !t.parentThreadId && !t.sideChat)),
  };
};

/** A thread of an unknown project is in the No project band. */
const bandOf = (t: Thread) => (projects.has(t.projectId) ? t.projectId : "none");

/** The members of a Lineage group, with the archived threads that the stream leaves out. Null when `id` is no group root. */
const lineageCtx = (id: string, archived: Thread[]): GraphCtx | null => {
  const all = new Map([...archived, ...threads.values()].map((t) => [t.id, t]));
  const created = (tid: string) => `${all.get(tid)?.createdAt ?? ""} ${tid}`;
  const pool = [...all.values()].filter((t) => !t.parentThreadId && !t.sideChat && !t.workflowRun);
  const stacks = computeStacks(
    pool.filter((t) => !t.gone && threads.has(t.id)).toSorted((a, b) => created(a.id).localeCompare(created(b.id))),
  ).map((st) => st.threads.map((t) => t.id));
  const members = lineageMembers({
    root: id,
    threads: pool,
    spawnerOf,
    known,
    isStep: (tid) => !!all.get(tid)?.workflowRun,
    createdKey: created,
    stacks,
    issueKeyOf: (tid) => !!issueKey(all.get(tid)?.title ?? ""),
  });
  if (!members) return null;
  return {
    members,
    projects: [...new Set(members.map(bandOf))].map((pid) => ({ id: pid, path: projects.get(pid)?.path ?? null })),
    group: { mapKey: null, projectOf: (k) => members.find((t) => issueKey(t.title) === k)!.projectId },
    ...linkLookup(all.values().filter((t) => !t.parentThreadId && !t.sideChat)),
  };
};

/** The live graph members of All or of one project. Null when a project scope names no project. */
const bandCtx = (scope: Scope): GraphCtx | null => {
  if (scope.kind === "project" && scope.id !== "none" && !projects.has(scope.id)) return null;
  const members = [...threads.values()].filter(
    (t) =>
      isGraphMember({ live: !t.gone, settled: !!t.settledAt, step: !!t.workflowRun, prs: t.prs.filter(memberLink) }) &&
      (scope.kind !== "project" || bandOf(t) === scope.id),
  );
  const ids = scope.kind === "project" ? [scope.id] : [...new Set(members.map(bandOf))];
  return {
    members,
    projects: ids.map((id) => ({ id, path: projects.get(id)?.path ?? null })),
    group: null,
    ...linkLookup(threads.values()),
  };
};

const graphCtx = (scope: Scope) => (archived: Thread[]) =>
  scope.kind === "map"
    ? mapCtx(scope.key, archived)
    : scope.kind === "lineage"
      ? lineageCtx(scope.id, archived)
      : bandCtx(scope);

/** `PUT /local-model` saves the Local model config here. */
const localModelFile = process.env.LOCAL_MODEL_FILE ?? join(homedir(), ".config", "t3-thread-tree", "local-model");
const models = createModels({ localConfig: () => readLocalConfig(localModelFile), appleHelper: appleHelperPath() });
/** `PUT /model-pick` saves the pick and the Catch-up switch here. */
const pickFile = process.env.MODEL_PICK_FILE ?? join(homedir(), ".config", "t3-thread-tree", "model-pick");
const catchUp = catchUpService({
  run: (pick, job) => models.run(pick, job),
  settings: () => readPickFile(pickFile),
  onChange: () => changed(),
});
const t3Cli = checkCli(cliPath());
void t3Cli.then((c) => c.available || log(`no t3 CLI at ${c.path}, sending is off`));
const send = sendService({
  cli: t3Cli,
  hasThread: (id) => threads.get(id)?.gone === false,
  hasProject: (id) => projects.has(id),
  projectList: () => projectChoices(projects, dirname(import.meta.dir)),
});

const server = Bun.serve({
  /** Above the 30 s CLI timeout, so a slow send still gets its 502 body. */
  idleTimeout: 40,
  hostname: "127.0.0.1",
  port: Number(process.env.PORT) || 4773,
  routes: {
    "/": index,
    "/up-next": upNext,
    "/models": { GET: async () => Response.json(await models.offered()) },
    ...send.routes,
    ...localModelRoutes(localModelFile),
    ...pickRoutes(pickFile, () => {
      if (!readPickFile(pickFile).catchUp) catchUp.clear();
      changed();
    }),
    ...workflowRoutes({ call: (tag, payload) => shell.workflow(tag, payload) }),
    ...settleRoutes({ dispatch: (c) => shell.dispatch(c), hasThread: (id) => threads.get(id)?.gone === false }),
    ...findRoutes(() => treeFor(true).projects),
    ...settledRoutes({
      page: (after, limit) => {
        scanIfNeeded(true);
        return settledPage(treeFor(true).projects, threads, after, limit);
      },
    }),
    ...prGraphRoutes({
      up: () => conn === "up",
      get: (scopeId, scope, refresh) => {
        scanIfNeeded(true);
        return graph.get(scopeId, scope, graphCtx(scope), refresh);
      },
      timeout: (req) => server.timeout(req, 0),
    }),
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
        scannedRevision = undefined;
        let waitTimer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<"timeout">((r) => (waitTimer = setTimeout(() => r("timeout"), 15_000)));
        const c = await Promise.race([shell.reconnect(), timeout]);
        clearTimeout(waitTimer);
        return tokenResponse(c);
      },
    },
    "/linear-key": {
      /** JSON only, like `/token`. The key is never sent back. */
      POST: async (req) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
        const next = parseToken(body?.key);
        if (!next) return new Response("Not a valid key", { status: 400 });
        writeToken(linearKeyFile, next);
        linearSource.setKey(next);
        return new Response(null, { status: 204 });
      },
    },
    "/events": (req) => {
      server.timeout(req, 0);
      const params = new URL(req.url).searchParams;
      const rules = parseRules(params.get("rules"));
      const labels = parseLabels(params.get("labels") ?? "");
      const wantsLinear = params.get("linear") === "1";
      const enc = new TextEncoder();
      let client: Client;
      return new Response(
        new ReadableStream({
          start(ctrl) {
            client = {
              rules,
              labels,
              wantsLinear,
              send: (d, event) => ctrl.enqueue(enc.encode(`${event ? `event: ${event}\n` : ""}data: ${d}\n\n`)),
            };
            clients.add(client);
            if (labels.length) store.sync(threads.values(), true);
            syncLinear();
            client.send(JSON.stringify(treeFor(false, rules, labels, wantsLinear)));
          },
          cancel() {
            clients.delete(client);
            store.sync(threads.values(), active());
            syncLinear();
          },
        }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } },
      );
    },
  },
});
log(`serving on ${server.url}`);
