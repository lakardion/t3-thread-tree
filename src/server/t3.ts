/**
 * The T3 shell stream: `orchestration.subscribeShell` over Effect RPC with JSON frames.
 * All protocol knowledge lives here, so a protocol change breaks only this module.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { Conn } from "../shared/tree.ts";

export const USERDATA = join(homedir(), ".t3", "userdata");

export type Pr = { n: number; url: string; source: string; state: string };

export type Thread = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  parentThreadId: string | null;
  sideChat: boolean;
  needsInput: boolean;
  pendingKind: string | null;
  settledAt: string | null;
  snoozedUntil: string | null;
  updatedAt: string;
  gone: boolean;
  prs: Pr[];
};

export type StreamEvent =
  /** `fresh` marks the first snapshot of a connection, which replaces all state. Later snapshot items carry project metadata only. */
  | { kind: "snapshot"; fresh: boolean; threads: Thread[]; projects: [string, string][] }
  | { kind: "thread"; thread: Thread }
  | { kind: "thread.removed"; id: string }
  | { kind: "project"; id: string; title: string }
  | { kind: "project.removed"; id: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Lenient decode: many shell fields are optional, and unknown fields are ignored. */
export function decodeThread(raw: unknown): Thread | null {
  const t = obj(raw);
  const id = str(t.id);
  if (!id) return null;
  const lineage = obj(t.lineage);
  const pending = t.pendingRuntimeRequest ? obj(t.pendingRuntimeRequest) : null;
  const prs = Array.isArray(t.pullRequests) ? t.pullRequests : [];
  return {
    id,
    projectId: str(t.projectId) ?? "",
    title: str(t.title) ?? "",
    status: str(t.status) ?? "idle",
    parentThreadId: str(lineage.parentThreadId),
    sideChat: lineage.sideChat === true,
    needsInput: pending !== null,
    pendingKind: pending ? str(pending.kind) : null,
    settledAt: str(t.settledAt),
    snoozedUntil: str(t.snoozedUntil),
    updatedAt: str(t.updatedAt) ?? "",
    gone: !!t.archivedAt || !!t.deletedAt,
    prs: prs.flatMap((p) => {
      const o = obj(p);
      const n = typeof o.number === "number" ? o.number : null;
      if (n === null) return [];
      /** A link not synced yet has no snapshot; count it as open. */
      const state = str(obj(o.snapshot).state) ?? "open";
      return [{ n, url: str(o.url) ?? "", source: str(o.source) ?? "", state }];
    }),
  };
}

/** Maps one shell stream item to an event. Archived items map to removals: the app never shows them. */
export function decodeItem(raw: unknown): StreamEvent | null {
  const it = obj(raw);
  switch (it.kind) {
    case "snapshot": {
      const s = obj(it.snapshot);
      const threads = (Array.isArray(s.threads) ? s.threads : []).flatMap((t) => decodeThread(t) ?? []);
      const projects = (Array.isArray(s.projects) ? s.projects : []).flatMap((p): [string, string][] => {
        const o = obj(p);
        const id = str(o.id);
        return id ? [[id, str(o.title) ?? id]] : [];
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
      return id ? { kind: "project", id, title: str(p.title) ?? id } : null;
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

/**
 * Holds the shell stream. Retries every 3 s while T3 is down or the token is rejected.
 * Each new connection starts with a fresh snapshot.
 */
export function connectShell(opts: {
  token: string | undefined;
  onEvent: (e: StreamEvent) => void;
  onConn: (c: Conn) => void;
}) {
  let ws: WebSocket | null = null;

  const attempt = async () => {
    if (ws) return;
    const origin = await readOrigin();
    if (!origin) return opts.onConn("down");
    if (!opts.token) return opts.onConn("unauthorized");
    const url = `${origin}/ws?orchestrationProtocol=2`;
    const headers = { Authorization: `Bearer ${opts.token}` };
    /** A WebSocket upgrade failure hides the HTTP status, so probe it with a plain GET first. */
    try {
      const probe = await fetch(url, { headers });
      if (probe.status === 401 || probe.status === 403) return opts.onConn("unauthorized");
    } catch {
      return opts.onConn("down");
    }
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
          opts.onConn("up");
          for (const v of Array.isArray(m.values) ? m.values : []) {
            const e = decodeItem(v);
            if (e?.kind === "snapshot") (e.fresh = fresh), (fresh = false);
            if (e) opts.onEvent(e);
          }
          /** The server sends the next chunk only after an Ack. */
          send({ _tag: "Ack", requestId: m.requestId });
        } else if (m._tag === "Exit" || m._tag === "Defect" || m._tag === "ClientProtocolError") {
          console.error("[t3] stream ended:", JSON.stringify(m).slice(0, 500));
          sock.close();
        }
      }
    };
    sock.onclose = () => {
      clearInterval(ping);
      if (ws === sock) ws = null;
      opts.onConn("down");
    };
    sock.onerror = () => sock.close();
  };

  attempt();
  setInterval(attempt, 3000);
}
