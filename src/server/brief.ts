/** The brief runner: build the input, run one Model pick with its tools off, filter the answer. */
import { ago, phraseWith, stripKey } from "../page/format.ts";
import type { BriefAction, BriefRun, BriefState, ModelPick, Snapshot } from "../shared/brief.ts";
import { allThreads, bySince, type Branch, type ThreadNode } from "../shared/tree.ts";
import type { Models } from "./model.ts";
import guideText from "./next-step-prompt.md" with { type: "text" };

export type InputThread = { id: string; ref: string; title: string; digest: string };

const MSG_TAIL = 600;
const NO_ACTION = new Set(["working", "starting", "waiting", "snoozed"]);

/** The last `MSG_TAIL` characters of a message, with a leading `…` when it was cut. */
export const tailOf = (message: string) => (message.length > MSG_TAIL ? `…${message.slice(-MSG_TAIL)}` : message);

/** `GET /t3/last-message?id=`: the tail of a thread's last message. The id is a query value because ids hold `:`. */
export function lastMessageRoutes(o: { read: (id: string) => string | null; has: (id: string) => boolean }) {
  return {
    "/t3/last-message": {
      GET: (req: Request) => {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return new Response("Missing id.", { status: 400 });
        if (!o.has(id)) return new Response("Unknown thread.", { status: 404 });
        const message = o.read(id);
        return Response.json({ text: message ? tailOf(message) : null });
      },
    },
  };
}

/** One thread as text: a line of facts, then the indented tail of the last assistant message. */
export function digestOf(n: ThreadNode, ref: string, message: string | null, now: number): string {
  const prs = n.prs.map((p) =>
    [`#${p.n}`, p.state !== "open" && p.state, p.draft && "draft", p.review, p.checks, p.conflicting && "conflicting"]
      .filter(Boolean)
      .join(" "),
  );
  const line = [
    ref,
    phraseWith(n, now) + (n.since ? "" : ` ${ago(n.updatedAt, now)}`),
    n.key ? `${n.key} ${stripKey(n.title, n.key)}` : n.title,
    prs.length && `PRs (${prs.join(", ")})`,
    n.stack && (n.stack.pos === null ? `stack of ${n.stack.total}` : `stack ${n.stack.pos}/${n.stack.total}`),
    n.detail.request && `request: ${n.detail.request}`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (!message) return line;
  return `${line}\n${tailOf(message).replace(/^/gm, "  ")}`;
}

const KIND_RANK: BriefAction["kind"][] = ["answer", "fix", "merge"];
const MODEL_KINDS: BriefAction["kind"][] = ["review", "clean-up", "unblock"];

const listOf = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? "");

/** Answer title per request kind, the part of `detail.request` before ` · `. */
const VERB: Record<string, string> = {
  user_input: "Answer the question",
  "mcp-elicitation": "Fill in the form",
  command: "Approve the command",
  "file-change": "Approve the file change",
  "file-read": "Approve the file read",
  permission: "Grant the permission",
  dynamic_tool_call: "Approve the tool call",
};

const QUESTION_MAX = 140;

/** The last question of a message, else its last sentence or line, cut at `QUESTION_MAX`. `null` when the message has no text. */
export function questionOf(message: string): string | null {
  const parts = message
    .replace(/^…/, "")
    .split(/(?<=[.?!])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const hit = parts.findLast((x) => /\?[*_"'`)\]]*$/.test(x)) ?? parts.at(-1);
  if (!hit) return null;
  return hit.length > QUESTION_MAX ? `${hit.slice(0, QUESTION_MAX - 1).trimEnd()}…` : hit;
}

/** The first rule that matches the thread, or `null`. */
function codeAction(n: ThreadNode): BriefAction | null {
  const make = (kind: BriefAction["kind"], title: string, reason: string, prompt: string | null, pr?: number) => ({
    kind,
    title,
    reason,
    threadIds: [n.id],
    prompt,
    ...(pr && { pr }),
  });
  if (n.status === "needs-input") {
    const title =
      n.phrase === "Guest message"
        ? "Reply to the guest"
        : (VERB[n.detail.request?.split(" · ")[0] ?? ""] ?? "Answer the agent");
    return make("answer", title, "The agent waits for your input.", null);
  }
  if (n.status === "plan-ready")
    return make("answer", "Review the plan", "The plan is ready and waits for your approval.", null);
  const broken = n.prs.find(
    (p) => p.state === "open" && (p.checks === "failing" || p.conflicting || p.review === "changes-requested"),
  );
  if (broken) {
    const facts: [boolean, string, string][] = [
      [broken.conflicting, "conflicts", "Rebase on main and resolve the conflicts"],
      [broken.checks === "failing", "failing checks", "fix the failing checks"],
      [broken.review === "changes-requested", "changes requested", "address the review comments"],
    ];
    const hit = facts.filter(([on]) => on);
    return make(
      "fix",
      `Fix PR #${broken.n}`,
      `PR #${broken.n} has ${listOf(hit.map(([, fact]) => fact))}.`,
      `${hit.map(([, , step]) => step).join(", ")}, and push.`,
      broken.n,
    );
  }
  const ready = n.prs.find(
    (p) => p.state === "open" && !p.draft && p.review === "approved" && p.checks === "passing" && !p.conflicting,
  );
  if (ready)
    return make(
      "merge",
      `Merge PR #${ready.n}`,
      `PR #${ready.n} is approved, its checks pass, and it has no conflicts.`,
      null,
      ready.n,
    );
  return null;
}

/** At most one action per thread. Grouped by kind in rank order. Answers go oldest Wait first, the other kinds keep tree order. */
export function codeActions(nodes: ThreadNode[]): { actions: BriefAction[]; covered: Set<string> } {
  const found = nodes.flatMap((n) => {
    const a = codeAction(n);
    return a ? [[n, a] as const] : [];
  });
  return {
    actions: KIND_RANK.flatMap((kind) => {
      const pairs = found.filter(([, a]) => a.kind === kind);
      return (kind === "answer" ? pairs.toSorted(([a], [b]) => bySince(a.since, b.since)) : pairs).map(([, a]) => a);
    }),
    covered: new Set(found.flatMap(([, a]) => a.threadIds)),
  };
}

export type BriefInput = {
  code: { actions: BriefAction[]; titles: Record<string, string> } & Snapshot;
  threads: InputThread[];
};

/** Every thread node of the visible tree, launched threads included, except those that need no action. Code actions cover some; the rest go to the model. */
export function briefInput(
  projects: Branch[],
  lastMessages: (ids: string[]) => Map<string, string | null>,
  now: number,
): BriefInput {
  const nodes = projects.flatMap(allThreads).filter((n) => !NO_ACTION.has(n.status));
  const { actions, covered } = codeActions(nodes);
  const rest = nodes.filter((n) => !covered.has(n.id));
  const answerIds = actions.flatMap((a) => (a.kind === "answer" ? a.threadIds : []));
  const msgs = lastMessages([...rest.map((n) => n.id), ...answerIds]);
  const withReasons = actions.map((a) => {
    const msg = a.kind === "answer" ? msgs.get(a.threadIds[0]) : null;
    return msg ? { ...a, reason: questionOf(tailOf(msg)) ?? a.reason } : a;
  });
  return {
    code: {
      actions: withReasons,
      titles: Object.fromEntries(nodes.filter((n) => covered.has(n.id)).map((n) => [n.id, n.title])),
      statuses: Object.fromEntries(nodes.map((n) => [n.id, n.status])),
      since: Object.fromEntries(nodes.filter((n) => answerIds.includes(n.id)).map((n) => [n.id, n.since])),
    },
    threads: rest.map((n, i) => ({
      id: n.id,
      ref: `t${i + 1}`,
      title: n.title,
      digest: digestOf(n, `t${i + 1}`, msgs.get(n.id) ?? null, now),
    })),
  };
}

/** Strict: Codex `--output-schema` needs every property required and no extra properties. */
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "reason", "threadIds", "prompt"],
        properties: {
          kind: { type: "string", enum: MODEL_KINDS },
          title: { type: "string" },
          reason: { type: "string" },
          threadIds: { type: "array", minItems: 1, items: { type: "string" } },
          prompt: { type: ["string", "null"] },
        },
      },
    },
  },
};

/** Maps each ref back to its thread id, drops unknown refs, then drops actions with none left or with a kind that code makes. Keeps the model's order. */
export function filterAnswer(
  answer: unknown,
  threads: Pick<InputThread, "id" | "ref" | "title">[],
): { actions: BriefAction[]; titles: Record<string, string> } | { error: string } {
  const list = (answer as { actions?: unknown } | null)?.actions;
  if (!Array.isArray(list)) return { error: "The answer has no actions list." };
  const byRef = new Map(threads.map((t) => [t.ref, t]));
  const actions: BriefAction[] = [];
  const titles: Record<string, string> = {};
  for (const a of list as BriefAction[]) {
    const hit = (Array.isArray(a?.threadIds) ? a.threadIds : []).flatMap((r) => byRef.get(r) ?? []);
    if (hit.length === 0 || !MODEL_KINDS.includes(a.kind)) continue;
    for (const t of hit) titles[t.id] = t.title;
    actions.push({
      kind: a.kind,
      title: a.title,
      reason: a.reason,
      threadIds: hit.map((t) => t.id),
      prompt: a.prompt ?? null,
    });
  }
  return { actions, titles };
}

export type Outcome = Extract<BriefRun, { status: "done" | "failed" }>;
export type Run = { done: Promise<Outcome | null>; cancel: () => void };

const threadText = (threads: InputThread[]) => threads.map((t) => t.digest).join("\n\n") || "No threads.";

/** One model run, with the answer filtered. `done` gives `null` after `cancel()`. */
export function runBrief(run: Models["run"], pick: ModelPick, threads: InputThread[], now = () => new Date()): Run {
  const failed = (error: string, stderrTail: string): Outcome => ({
    status: "failed",
    cli: pick,
    error,
    stderrTail,
    actions: [],
    titles: {},
  });
  const r = run(pick, { guide: guideText, input: threadText(threads), schema: SCHEMA });
  return {
    cancel: () => r.cancel(),
    done: r.done.then((res): Outcome | null => {
      if (!res) return null;
      if ("error" in res) return failed(res.error, res.detail);
      const kept = filterAnswer(res.answer, threads);
      if ("error" in kept) return failed(kept.error, "");
      return { status: "done", cli: pick, generatedAt: now().toISOString(), ...kept };
    }),
  };
}

type Offered = { id: ModelPick; label: string }[];

/** The one in-memory brief state, its routes, and one run at a time. */
export function briefService(o: {
  offered: () => Promise<Offered>;
  input: () => BriefInput;
  onChange: () => void;
  run: (pick: ModelPick, threads: InputThread[]) => Run;
}) {
  let state: BriefState = { status: "idle" };
  let active: Run | undefined;
  const set = (s: BriefState) => ((state = s), o.onChange());
  return {
    state: () => state,
    routes: {
      "/models": { GET: async () => Response.json(await o.offered()) },
      "/brief/run": {
        POST: async (req: Request) => {
          const { cli } = ((await req.json().catch(() => null)) ?? {}) as { cli?: ModelPick };
          if (!(await o.offered()).some((c) => c.id === cli))
            return new Response("This model is not offered.", { status: 400 });
          if (active) return new Response("A run is active.", { status: 409 });
          const { code, threads } = o.input();
          const cliId = cli!;
          if (threads.length === 0) {
            set({ status: "done", cli: cliId, generatedAt: new Date().toISOString(), rulesOnly: true, ...code });
            return new Response(null, { status: 202 });
          }
          const before = state;
          const r = (active = o.run(cliId, threads));
          set({
            status: "running",
            cli: cliId,
            threadCount: threads.length,
            startedAt: new Date().toISOString(),
            ...code,
          });
          void r.done
            .catch((e): Outcome => ({
              status: "failed",
              cli: cliId,
              error: String(e?.message ?? e),
              stderrTail: "",
              actions: [],
              titles: {},
            }))
            .then((out) => {
              active = undefined;
              set(
                !out
                  ? before
                  : out.status === "done"
                    ? {
                        ...out,
                        statuses: code.statuses,
                        since: code.since,
                        actions: [...code.actions, ...out.actions],
                        titles: { ...code.titles, ...out.titles },
                      }
                    : { ...out, ...code },
              );
            });
          return new Response(null, { status: 202 });
        },
      },
      "/brief/cancel": {
        POST: () => {
          active?.cancel();
          return new Response(null, { status: 204 });
        },
      },
    },
  };
}
