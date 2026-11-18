/**
 * The T3 shell stream: `orchestration.subscribeShell` over Effect RPC with JSON frames.
 * All protocol knowledge lives here, so a protocol change breaks only this module.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import type { Conn } from "../shared/tree.ts";

export const USERDATA = join(homedir(), ".t3", "userdata");

export type Pr = {
  n: number;
  url: string;
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
};

export type Project = { title: string; repo: string | null };

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
        return id ? [[id, { title: str(o.title) ?? id, repo: repoOf(o) }]] : [];
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
      return id ? { kind: "project", id, project: { title: str(p.title) ?? id, repo: repoOf(p) } } : null;
    }
    case "project.removed": {
      const id = str(it.projectId);
      return id ? { kind: "project.removed", id } : null;
    }
  }
  return null;
}

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

/**
 * Holds the shell stream. Retries every 3 s while T3 is down or the token is rejected.
 * Each new connection starts with a fresh snapshot.
 */
export function connectShell(opts: {
  token: () => string | undefined;
  onEvent: (e: StreamEvent) => void;
  onConn: (c: Conn) => void;
}) {
  let ws: WebSocket | null = null;
  let seq = 1;
  const pending = new Map<string, { sock: WebSocket; resolve: () => void; reject: (e: Error) => void }>();
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
      ping = setInterval(() => send({ _tag: "Ping" }), 5000);
    };
    sock.onmessage = (ev) => {
      const parsed: unknown = JSON.parse(String(ev.data));
      for (const m of (Array.isArray(parsed) ? parsed : [parsed]).map(obj)) {
        if (m._tag === "Chunk") {
          report("up", g);
          for (const v of Array.isArray(m.values) ? m.values : []) {
            const e = decodeItem(v);
            if (e?.kind === "snapshot") {
              e.fresh = fresh;
              fresh = false;
            }
            if (e) opts.onEvent(e);
          }
          /** The server sends the next chunk only after an Ack. */
          send({ _tag: "Ack", requestId: m.requestId });
        } else if (m._tag === "Exit" && typeof m.requestId === "string" && pending.has(m.requestId)) {
          const call = pending.get(m.requestId)!;
          pending.delete(m.requestId);
          if (obj(m.exit)._tag === "Success") call.resolve();
          else call.reject(new Error(failureText(m)));
        } else if (m._tag === "Exit" || m._tag === "Defect" || m._tag === "ClientProtocolError") {
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
  return {
    /** Sends one orchestration command and resolves when T3 accepts it. */
    dispatch(command: Record<string, unknown>): Promise<void> {
      if (ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error("T3 is not connected"));
      const id = String(++seq);
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("timed out"));
        }, 30_000);
        pending.set(id, {
          sock: ws!,
          resolve: () => (clearTimeout(timer), resolve()),
          reject: (e) => (clearTimeout(timer), reject(e)),
        });
        ws!.send(
          JSON.stringify({
            _tag: "Request",
            id,
            tag: "orchestration.dispatchCommand",
            payload: { ...command, commandId: crypto.randomUUID() },
            headers: [],
          }),
        );
      });
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
