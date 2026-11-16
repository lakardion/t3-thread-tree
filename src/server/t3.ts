/**
 * The T3 shell stream: `orchestration.subscribeShell` over Effect RPC with JSON frames.
 * All protocol knowledge lives here, so a protocol change breaks only this module.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import * as v from "valibot";

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

/** Every field below falls back instead of failing: the protocol is internal and changes. */
const S = v.fallback(v.nullable(v.string()), null);
const N = v.fallback(v.nullable(v.number()), null);
const B = v.fallback(v.nullable(v.boolean()), null);
const Any = v.optional(v.unknown());
const Id = v.pipe(v.string(), v.minLength(1));

/** An object whose fields all fall back; anything that is not an object decodes as `{}`. */
const obj = <E extends v.ObjectEntries>(entries: E) => {
  const schema = v.object(entries);
  return v.fallback(schema, () => v.parse(schema, {}));
};

/** An array that drops items failing `item`; anything that is not an array decodes as `[]`. */
const listOf = <T extends v.GenericSchema>(item: T) =>
  v.pipe(
    v.fallback(v.array(v.unknown()), []),
    v.transform((a) =>
      a.flatMap((x) => {
        const r = v.safeParse(item, x);
        return r.success ? [r.output] : [];
      }),
    ),
  );

/** Shows the home folder as `~`, only at a path boundary. */
const tilde = (p: string | null): string | null => {
  const home = homedir();
  return p !== null && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p;
};

const PrSchema = v.pipe(
  v.object({
    number: v.number(),
    url: S,
    source: S,
    stack: obj({ base: S }),
    snapshot: obj({
      state: S,
      isDraft: B,
      checksState: S,
      reviewDecision: S,
      mergeability: S,
      title: S,
      additions: N,
      deletions: N,
      changedFiles: N,
    }),
  }),
  v.transform(({ number, url, source, stack, snapshot: s }): Pr => ({
    n: number,
    url: url ?? "",
    source: source ?? "",
    /** A link not synced yet has no snapshot; count it as open. */
    state: s.state ?? "open",
    draft: s.isDraft,
    checks: s.checksState,
    review: s.reviewDecision,
    mergeability: s.mergeability,
    stackBase: stack.base,
    title: s.title,
    additions: s.additions,
    deletions: s.deletions,
    changedFiles: s.changedFiles,
  })),
);

const PendingSchema = obj({ kind: S, createdAt: S, blocking: B });

/** Lenient decode: many shell fields are optional, and unknown fields are ignored. */
const ThreadSchema = v.pipe(
  v.object({
    id: Id,
    projectId: S,
    title: S,
    status: S,
    lineage: obj({ parentThreadId: S, sideChat: Any }),
    pendingRuntimeRequest: Any,
    pendingGuestMessageCount: N,
    activityRunStatus: S,
    blockedOnThreadWait: Any,
    hasActionableProposedPlan: Any,
    interactionMode: S,
    latestRunCompletedAt: S,
    lastVisitedAt: S,
    activityRunStartedAt: S,
    latestRunStartedAt: S,
    settledAt: S,
    snoozedUntil: S,
    updatedAt: S,
    archivedAt: Any,
    deletedAt: Any,
    pullRequests: listOf(PrSchema),
    lastError: S,
    lastErrorClass: S,
    lastErrorCode: S,
    usageLimitResetAt: S,
    limitRecovery: obj({ resetAt: S, autoResume: Any }),
    latestRunStopRequested: Any,
    modelSelection: obj({ model: S }),
    branch: S,
    worktreePath: S,
    forkedFrom: obj({ threadId: S }),
    delegatedFrom: obj({ title: S }),
    linkOrigin: obj({ label: S }),
    createdBy: S,
    creationSource: S,
    createdAt: S,
    goal: v.fallback(v.nullable(v.object({ objective: v.string(), status: v.string() })), null),
    tags: listOf(v.string()),
    pinnedAt: S,
  }),
  v.transform((t): Thread => ({
    id: t.id,
    projectId: t.projectId ?? "",
    title: t.title ?? "",
    status: t.status ?? "idle",
    parentThreadId: t.lineage.parentThreadId,
    sideChat: t.lineage.sideChat === true,
    pending: t.pendingRuntimeRequest ? v.parse(PendingSchema, t.pendingRuntimeRequest) : null,
    guestMessages: t.pendingGuestMessageCount,
    activityRunStatus: t.activityRunStatus,
    blockedOnThreadWait: t.blockedOnThreadWait === true,
    hasPlan: t.hasActionableProposedPlan === true,
    interactionMode: t.interactionMode,
    latestRunCompletedAt: t.latestRunCompletedAt,
    lastVisitedAt: t.lastVisitedAt,
    activityRunStartedAt: t.activityRunStartedAt,
    latestRunStartedAt: t.latestRunStartedAt,
    settledAt: t.settledAt,
    snoozedUntil: t.snoozedUntil,
    updatedAt: t.updatedAt ?? "",
    gone: !!t.archivedAt || !!t.deletedAt,
    prs: t.pullRequests,
    lastError: t.lastError,
    lastErrorClass: t.lastErrorClass,
    lastErrorCode: t.lastErrorCode,
    limitResetAt: t.usageLimitResetAt ?? t.limitRecovery.resetAt,
    autoResume: t.limitRecovery.autoResume === true,
    stopRequested: t.latestRunStopRequested === true,
    model: t.modelSelection.model,
    branch: t.branch,
    worktreePath: tilde(t.worktreePath),
    forkedFromThreadId: t.forkedFrom.threadId,
    delegatedFromTitle: t.delegatedFrom.title,
    linkLabel: t.linkOrigin.label,
    createdBy: t.createdBy,
    creationSource: t.creationSource,
    createdAt: t.createdAt,
    goal: t.goal,
    tags: t.tags,
    pinned: t.pinnedAt !== null,
  })),
);

/** A project as `[id, project]`; `repo` is `owner/name` from `repositoryIdentity`, or null when a part is absent. */
const ProjectSchema = v.pipe(
  v.object({ id: Id, title: S, repositoryIdentity: obj({ owner: S, name: S }) }),
  v.transform(({ id, title, repositoryIdentity: { owner, name } }): [string, Project] => [
    id,
    { title: title ?? id, repo: owner && name ? `${owner}/${name}` : null },
  ]),
);

/** One shell stream item as an event. Archived items map to removals: the app never shows them. */
const ItemSchema = v.variant("kind", [
  v.pipe(
    v.object({
      kind: v.literal("snapshot"),
      snapshot: obj({ threads: listOf(ThreadSchema), projects: listOf(ProjectSchema) }),
    }),
    v.transform(({ snapshot }): StreamEvent => ({ kind: "snapshot", fresh: false, ...snapshot })),
  ),
  v.pipe(
    v.object({ kind: v.literal("thread.updated"), location: Any, thread: ThreadSchema }),
    v.transform(({ location, thread }): StreamEvent =>
      location === "archive" ? { kind: "thread.removed", id: thread.id } : { kind: "thread", thread },
    ),
  ),
  v.pipe(
    v.object({ kind: v.literal("thread.removed"), threadId: Id }),
    v.transform(({ threadId }): StreamEvent => ({ kind: "thread.removed", id: threadId })),
  ),
  v.pipe(
    v.object({ kind: v.literal("project.updated"), project: ProjectSchema }),
    v.transform(({ project: [id, project] }): StreamEvent => ({ kind: "project", id, project })),
  ),
  v.pipe(
    v.object({ kind: v.literal("project.removed"), projectId: Id }),
    v.transform(({ projectId }): StreamEvent => ({ kind: "project.removed", id: projectId })),
  ),
]);

/** Returns null when the thread has no usable id. */
export function decodeThread(raw: unknown): Thread | null {
  const r = v.safeParse(ThreadSchema, raw);
  return r.success ? r.output : null;
}

/** Returns null for an unknown kind or an item without its required id. */
export function decodeItem(raw: unknown): StreamEvent | null {
  const r = v.safeParse(ItemSchema, raw);
  return r.success ? r.output : null;
}

const FrameSchema = v.variant("_tag", [
  v.object({ _tag: v.literal("Chunk"), requestId: Any, values: listOf(ItemSchema) }),
  v.object({ _tag: v.picklist(["Exit", "Defect", "ClientProtocolError"]) }),
]);

export const readEnvironmentId = async (): Promise<string> =>
  (await Bun.file(join(USERDATA, "environment-id")).text()).trim();

const readOrigin = async (): Promise<string | null> => {
  try {
    return v.parse(obj({ origin: S }), await Bun.file(join(USERDATA, "server-runtime.json")).json()).origin;
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
      for (const raw of [parsed].flat()) {
        const r = v.safeParse(FrameSchema, raw);
        if (!r.success) continue;
        const m = r.output;
        if (m._tag === "Chunk") {
          opts.onConn("up");
          for (const e of m.values) {
            if (e.kind === "snapshot") {
              e.fresh = fresh;
              fresh = false;
            }
            opts.onEvent(e);
          }
          /** The server sends the next chunk only after an Ack. */
          send({ _tag: "Ack", requestId: m.requestId });
        } else {
          console.error("[t3] stream ended:", JSON.stringify(raw).slice(0, 500));
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

  void attempt();
  setInterval(attempt, 3000);
}
