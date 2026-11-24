/**
 * The T3 shell stream: `orchestration.subscribeShell` over Effect RPC with JSON frames.
 * All protocol knowledge lives here, so a protocol change breaks only this module.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import type { Conn, Label } from "../shared/tree.ts";

export const USERDATA = join(homedir(), ".t3", "userdata");

export type Pr = {
  n: number;
  url: string;
  host: string;
  repository: string;
  /** Snapshot `updatedAt`; empty before the first sync. */
  updatedAt: string;
  source: string;
  state: string;
  draft: boolean | null;
  checks: string | null;
  review: string | null;
  mergeability: string | null;
  stackBase: string | null;
  /** Open PR numbers of the stack, base first, as T3 reports them. */
  stackLayers: number[] | null;
  title: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
};

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  parentThreadId: string | null;
  sideChat: boolean;
  pending: { kind: string | null; createdAt: string | null; blocking: boolean | null } | null;
  guestMessages: number | null;
  activityRunStatus: string | null;
  blockedOnThreadWait: boolean;
  hasPlan: boolean;
  interactionMode: string | null;
  latestRunCompletedAt: string | null;
  lastVisitedAt: string | null;
  activityRunStartedAt: string | null;
  latestRunStartedAt: string | null;
  settledAt: string | null;
  snoozedUntil: string | null;
  updatedAt: string;
  gone: boolean;
  prs: Pr[];
  lastError: string | null;
  lastErrorClass: string | null;
  lastErrorCode: string | null;
  limitResetAt: string | null;
  autoResume: boolean;
  stopRequested: boolean;
  model: string | null;
  branch: string | null;
  worktreePath: string | null;
  forkedFromThreadId: string | null;
  delegatedFromTitle: string | null;
  linkLabel: string | null;
  createdBy: string | null;
  creationSource: string | null;
  createdAt: string | null;
  goal: { objective: string; status: string } | null;
  tags: string[];
  pinned: boolean;
  /** Set on a step thread: the run, its workflow and the step it runs. */
  workflowRun: { runId: string; workflow: string; step: string } | null;
};

/** `path` is the project's workspace root. */
export type Project = { title: string; repo: string | null; path?: string };

/** The fields of `WorkflowRunsSnapshot` that the app reads. */
export type RunsSnapshot = {
  runs: {
    runId: string;
    workflow: string;
    title: string;
    status: string;
    detail: string | null;
    retired: boolean;
    resumesAt: string | null;
    updatedAt: string;
    parentRunId: string | null;
    parentStep: string | null;
    startedAt: string;
  }[];
  questions: {
    runId: string;
    name: string;
    title: string;
    choices: string[];
    askedAt: string;
    thread: { threadId: string; environmentId: string | null } | null;
  }[];
  /** The newest version of each registered workflow. */
  workflows?: { name: string; version: number; triggers: string[] }[];
  /** `definition.revision`: goes up when T3 loads the workflow files again. Null when the snapshot has none. */
  revision?: number | null;
};

export type StreamEvent =
  /** `fresh` marks the first snapshot of a connection, which replaces all state. Later snapshot items carry project metadata only. */
  | { kind: "snapshot"; fresh: boolean; threads: Thread[]; projects: [string, Project][] }
  | { kind: "thread"; thread: Thread }
  | { kind: "thread.removed"; id: string }
  | { kind: "project"; id: string; project: Project }
  | { kind: "project.removed"; id: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** Shows the home folder as `~`, only at a path boundary. */
const tilde = (p: string | null): string | null => {
  const home = homedir();
  return p !== null && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p;
};

/** `owner/name` from `repositoryIdentity`, or null when a part is absent. */
const repoOf = (p: Obj): string | null => {
  const r = obj(p.repositoryIdentity);
  const owner = str(r.owner);
  const name = str(r.name);
  return owner && name ? `${owner}/${name}` : null;
};

const projectOf = (p: Obj, id: string): Project => {
  const path = str(p.workspaceRoot);
  return { title: str(p.title) ?? id, repo: repoOf(p), ...(path && { path }) };
};

/** Lenient decode: many shell fields are optional, and unknown fields are ignored. */
export function decodeThread(raw: unknown): Thread | null {
  const t = obj(raw);
  const id = str(t.id);
  if (!id) return null;
  const lineage = obj(t.lineage);
  const pending = t.pendingRuntimeRequest ? obj(t.pendingRuntimeRequest) : null;
  const prs = Array.isArray(t.pullRequests) ? t.pullRequests : [];
  const recovery = obj(t.limitRecovery);
  const goal = obj(t.goal);
  const wf = obj(t.workflowRun);
  const wfRunId = str(wf.runId);
  return {
    id,
    projectId: str(t.projectId) ?? "",
    title: str(t.title) ?? "",
    status: str(t.status) ?? "idle",
    parentThreadId: str(lineage.parentThreadId),
    sideChat: lineage.sideChat === true,
    pending: pending && {
      kind: str(pending.kind),
      createdAt: str(pending.createdAt),
      blocking: bool(pending.blocking),
    },
    guestMessages: num(t.pendingGuestMessageCount),
    activityRunStatus: str(t.activityRunStatus),
    blockedOnThreadWait: t.blockedOnThreadWait === true,
    hasPlan: t.hasActionableProposedPlan === true,
    interactionMode: str(t.interactionMode),
    latestRunCompletedAt: str(t.latestRunCompletedAt),
    lastVisitedAt: str(t.lastVisitedAt),
    activityRunStartedAt: str(t.activityRunStartedAt),
    latestRunStartedAt: str(t.latestRunStartedAt),
    settledAt: str(t.settledAt),
    snoozedUntil: str(t.snoozedUntil),
    updatedAt: str(t.updatedAt) ?? "",
    gone: !!t.archivedAt || !!t.deletedAt,
    prs: prs.flatMap((p) => {
      const o = obj(p);
      const n = typeof o.number === "number" ? o.number : null;
      if (n === null) return [];
      /** A link not synced yet has no snapshot; count it as open. */
      const snap = obj(o.snapshot);
      const state = str(snap.state) ?? "open";
      return [
        {
          n,
          url: str(o.url) ?? "",
          host: str(o.host) ?? "",
          repository: str(o.repository) ?? "",
          updatedAt: str(snap.updatedAt) ?? "",
          source: str(o.source) ?? "",
          state,
          draft: bool(snap.isDraft),
          checks: str(snap.checksState),
          review: str(snap.reviewDecision),
          mergeability: str(snap.mergeability),
          stackBase: str(obj(o.stack).base),
          stackLayers: Array.isArray(obj(o.stack).layers)
            ? (obj(o.stack).layers as unknown[])
                .map(obj)
                .filter((l) => l.state === "open" && typeof l.number === "number")
                .map((l) => l.number as number)
            : null,
          title: str(snap.title),
          additions: num(snap.additions),
          deletions: num(snap.deletions),
          changedFiles: num(snap.changedFiles),
        },
      ];
    }),
    lastError: str(t.lastError),
    lastErrorClass: str(t.lastErrorClass),
    lastErrorCode: str(t.lastErrorCode),
    limitResetAt: str(t.usageLimitResetAt) ?? str(recovery.resetAt),
    autoResume: recovery.autoResume === true,
    stopRequested: t.latestRunStopRequested === true,
    model: str(obj(t.modelSelection).model),
    branch: str(t.branch),
    worktreePath: tilde(str(t.worktreePath)),
    forkedFromThreadId: str(obj(t.forkedFrom).threadId),
    delegatedFromTitle: str(obj(t.delegatedFrom).title),
    linkLabel: str(obj(t.linkOrigin).label),
    createdBy: str(t.createdBy),
    creationSource: str(t.creationSource),
    createdAt: str(t.createdAt),
    goal:
      typeof goal.objective === "string" && typeof goal.status === "string"
        ? { objective: goal.objective, status: goal.status }
        : null,
    tags: Array.isArray(t.tags) ? t.tags.filter((x): x is string => typeof x === "string") : [],
    pinned: typeof t.pinnedAt === "string",
    workflowRun: wfRunId ? { runId: wfRunId, workflow: str(wf.workflow) ?? "", step: str(wf.step) ?? "" } : null,
  };
}

/** Maps one shell stream item to an event. Archived items map to removals: the app never shows them. */
export function decodeItem(raw: unknown): StreamEvent | null {
  const it = obj(raw);
  switch (it.kind) {
    case "snapshot": {
      const s = obj(it.snapshot);
      const threads = (Array.isArray(s.threads) ? s.threads : []).flatMap((t) => decodeThread(t) ?? []);
      const projects = (Array.isArray(s.projects) ? s.projects : []).flatMap((p): [string, Project][] => {
        const o = obj(p);
        const id = str(o.id);
        return id ? [[id, projectOf(o, id)]] : [];
      });
      return { kind: "snapshot", fresh: false, threads, projects };
    }
    case "thread.updated": {
      const thread = decodeThread(it.thread);
      if (!thread) return null;
      return it.location === "archive" ? { kind: "thread.removed", id: thread.id } : { kind: "thread", thread };
    }
    case "thread.removed": {
      const id = str(it.threadId);
      return id ? { kind: "thread.removed", id } : null;
    }
    case "project.updated": {
      const p = obj(it.project);
      const id = str(p.id);
      return id ? { kind: "project", id, project: projectOf(p, id) } : null;
    }
    case "project.removed": {
      const id = str(it.projectId);
      return id ? { kind: "project.removed", id } : null;
    }
  }
  return null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Lenient decode of a `workflows.subscribe` snapshot. Entries without their key fields drop out. */
export function decodeRunsSnapshot(raw: unknown): RunsSnapshot {
  const s = obj(raw);
  return {
    runs: list(s.runs).flatMap((r) => {
      const o = obj(r);
      const runId = str(o.runId);
      return runId
        ? [
            {
              runId,
              workflow: str(o.workflow) ?? "",
              title: str(o.title) ?? "",
              status: str(o.status) ?? "",
              detail: str(o.detail),
              retired: o.retired === true,
              resumesAt: str(o.resumesAt),
              updatedAt: str(o.updatedAt) ?? "",
              parentRunId: str(o.parentRunId),
              parentStep: str(o.parentStep),
              startedAt: str(o.startedAt) ?? "",
            },
          ]
        : [];
    }),
    questions: list(s.questions).flatMap((q) => {
      const o = obj(q);
      const runId = str(o.runId);
      const name = str(o.name);
      const askedAt = str(o.askedAt);
      if (!runId || !name || !askedAt) return [];
      const request = obj(o.request);
      const thread = obj(o.thread);
      const threadId = str(thread.threadId);
      return [
        {
          runId,
          name,
          title: str(request.title) ?? name,
          choices: list(request.choices).filter((c): c is string => typeof c === "string"),
          askedAt,
          thread: threadId ? { threadId, environmentId: str(thread.environmentId) } : null,
        },
      ];
    }),
    workflows: list(s.workflows).flatMap((w) => {
      const o = obj(w);
      const name = str(o.name);
      return name
        ? [{ name, version: num(o.version) ?? 0, triggers: list(o.triggers).filter((x) => typeof x === "string") }]
        : [];
    }),
    revision: num(obj(s.definition).revision),
  };
}

/** Lenient decode of a `workflows.getDefinition` result: the source of each file and the `name@version` of its workflows. */
export const decodeDefinitionFiles = (raw: unknown): { source: string; workflows: string[] }[] =>
  list(obj(raw).files).flatMap((f) => {
    const o = obj(f);
    const source = str(o.source);
    return source === null ? [] : [{ source, workflows: list(o.workflows).filter((x) => typeof x === "string") }];
  });

/** Lenient decode of a `workflows.get` result: the steps in start order. Entries without a name drop out. */
export type RunStepsRaw = { name: string; status: string; threadId: string | null }[];
export const decodeRunSteps = (raw: unknown): RunStepsRaw =>
  list(obj(raw).steps).flatMap((x) => {
    const o = obj(x);
    const name = str(o.name);
    return name ? [{ name, status: str(o.status) ?? "", threadId: str(o.threadId) }] : [];
  });

export const readEnvironmentId = async (): Promise<string> =>
  (await Bun.file(join(USERDATA, "environment-id")).text()).trim();

const readOrigin = async (): Promise<string | null> => {
  try {
    return str(obj(await Bun.file(join(USERDATA, "server-runtime.json")).json()).origin);
  } catch {
    return null;
  }
};

/** A failure frame holds `exit.cause[0].error.message`. Else the frame as JSON. */
function failureText(frame: Obj): string {
  const cause = obj(frame.exit).cause;
  const message = Array.isArray(cause) ? str(obj(obj(cause[0]).error).message) : null;
  return message ?? JSON.stringify(frame).slice(0, 300);
}

/** Id of the `workflows.subscribe` request. The unary calls count up from 2. */
const RUNS_ID = "w";

/**
 * Holds the shell stream and the workflows stream. Retries every 3 s while T3 is down or the token is rejected.
 * Each new connection starts with a fresh snapshot.
 */
export function connectShell(opts: {
  token: () => string | undefined;
  onEvent: (e: StreamEvent) => void;
  onConn: (c: Conn) => void;
  /** A full workflows snapshot, with the T3 origin. An empty one when the stream ends. */
  onRuns: (snapshot: RunsSnapshot, origin: string) => void;
}) {
  let ws: WebSocket | null = null;
  let seq = 1;
  const pending = new Map<string, { sock: WebSocket; resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  /** Counts `reconnect` calls. A report from an older generation describes an old token, so it is dropped. */
  let gen = 0;
  let waiters: ((c: Conn) => void)[] = [];
  const report = (c: Conn, g: number) => {
    if (g !== gen) return;
    opts.onConn(c);
    const done = waiters;
    waiters = [];
    for (const w of done) w(c);
  };

  const attempt = async () => {
    if (ws) return;
    const g = gen;
    const origin = await readOrigin();
    /** A `reconnect` during an await makes this attempt stale: it must not report or open a socket. */
    if (g !== gen) return;
    if (!origin) return report("down", g);
    const token = opts.token();
    if (!token) return report("no-token", g);
    const url = `${origin}/ws?orchestrationProtocol=2`;
    const headers = { Authorization: `Bearer ${token}` };
    /** A WebSocket upgrade failure hides the HTTP status, so probe it with a plain GET first. */
    try {
      const probe = await fetch(url, { headers });
      if (g !== gen) return;
      if (probe.status === 401 || probe.status === 403) return report("unauthorized", g);
    } catch {
      return report("down", g);
    }
    if (g !== gen) return;
    /** Bun accepts `{ headers }` here; the DOM lib type only knows protocols. */
    const sock = new WebSocket(url.replace(/^http/, "ws"), { headers } as unknown as string[]);
    ws = sock;
    let ping: ReturnType<typeof setInterval> | undefined;
    let fresh = true;
    const send = (m: unknown) => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify(m));
    sock.onopen = () => {
      send({
        _tag: "Request",
        id: "1",
        tag: "orchestration.subscribeShell",
        payload: { omitIdleSubagents: false, omitOlderSettled: false },
        headers: [],
      });
      send({ _tag: "Request", id: RUNS_ID, tag: "workflows.subscribe", payload: {}, headers: [] });
      ping = setInterval(() => send({ _tag: "Ping" }), 5000);
    };
    sock.onmessage = (ev) => {
      const parsed: unknown = JSON.parse(String(ev.data));
      for (const m of (Array.isArray(parsed) ? parsed : [parsed]).map(obj)) {
        if (m._tag === "Chunk") {
          const values = Array.isArray(m.values) ? m.values : [];
          if (m.requestId === RUNS_ID) {
            /** Each value is a full snapshot, so the last one wins. */
            if (values.length > 0) opts.onRuns(decodeRunsSnapshot(values.at(-1)), origin);
          } else {
            report("up", g);
            for (const v of values) {
              const e = decodeItem(v);
              if (e?.kind === "snapshot") {
                e.fresh = fresh;
                fresh = false;
              }
              if (e) opts.onEvent(e);
            }
          }
          /** The server sends the next chunk only after an Ack. */
          send({ _tag: "Ack", requestId: m.requestId });
        } else if (m._tag === "Exit" && m.requestId === RUNS_ID) {
          /** An older T3 has no workflows. The shell stream goes on. */
          console.error("[t3] workflows stream ended:", JSON.stringify(m).slice(0, 500));
          opts.onRuns({ runs: [], questions: [], workflows: [], revision: null }, origin);
        } else if (m._tag === "Exit" && typeof m.requestId === "string" && pending.has(m.requestId)) {
          const call = pending.get(m.requestId)!;
          pending.delete(m.requestId);
          if (obj(m.exit)._tag === "Success") call.resolve(obj(m.exit).value);
          else call.reject(new Error(failureText(m)));
        } else if (
          (m._tag === "Exit" && m.requestId === "1") ||
          m._tag === "Defect" ||
          m._tag === "ClientProtocolError"
        ) {
          console.error("[t3] stream ended:", JSON.stringify(m).slice(0, 500));
          sock.close();
        }
      }
    };
    sock.onclose = () => {
      clearInterval(ping);
      for (const [id, call] of pending) {
        if (call.sock !== sock) continue;
        pending.delete(id);
        call.reject(new Error("T3 is not connected"));
      }
      /** A socket that `reconnect` dropped reports nothing. */
      if (ws !== sock) return;
      ws = null;
      report("down", g);
    };
    sock.onerror = () => sock.close();
  };

  void attempt();
  setInterval(attempt, 3000);
  /** One unary call on the open socket. Resolves with the `Exit` value. */
  const request = (tag: string, payload: unknown): Promise<unknown> => {
    if (ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("T3 is not connected"));
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("timed out"));
      }, 30_000);
      pending.set(id, {
        sock: ws!,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      ws!.send(JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] }));
    });
  };

  return {
    /** One `workflows.answer`, `workflows.resume` or `workflows.cancel` call. */
    workflow: (tag: string, payload: unknown): Promise<unknown> => request(tag, payload),
    /** Sends one orchestration command and resolves when T3 accepts it. */
    dispatch: (command: Record<string, unknown>): Promise<void> =>
      request("orchestration.dispatchCommand", { ...command, commandId: crypto.randomUUID() }).then(() => {}),
    /** The labels and `updatedAt` of one PR, fresh from the host. */
    async detail(ref: {
      projectId: string;
      host: string;
      repository: string;
      number: number;
    }): Promise<{ labels: Label[]; updatedAt: string }> {
      const v = obj(await request("pullRequests.detail", { ...ref, allowStale: false }));
      return {
        labels: (Array.isArray(v.labels) ? v.labels : []).flatMap((l) => {
          const o = obj(l);
          return typeof o.name === "string" ? [{ name: o.name, color: str(o.color) }] : [];
        }),
        updatedAt: str(v.updatedAt) ?? "",
      };
    },
    /** Drops the open socket and connects again with the current token. Resolves with the first outcome. */
    reconnect(): Promise<Conn> {
      gen++;
      return new Promise<Conn>((resolve) => {
        waiters.push(resolve);
        const old = ws;
        ws = null;
        old?.close();
        void attempt();
      });
    },
  };
}
