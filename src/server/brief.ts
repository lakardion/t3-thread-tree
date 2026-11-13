/** The brief runner: build the input, run one CLI with its tools off, parse and filter the answer. */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ago, phraseWith, stripKey } from "../page/format.ts";
import type { BriefAction, BriefState, Cli } from "../shared/brief.ts";
import { allThreads, type Branch, type ThreadNode } from "../shared/tree.ts";

export const CLIS: Record<Cli, { label: string; status: string[] }> = {
  claude: { label: "Claude Haiku", status: ["claude", "auth", "status"] },
  codex: { label: "Codex Luna", status: ["codex", "login", "status"] },
};

/** CLIs on `PATH` and logged in. Free and local: no model call. */
export async function detectClis(): Promise<{ id: Cli; label: string }[]> {
  const ok = await Promise.all(
    (Object.keys(CLIS) as Cli[]).map(async (id) => {
      try {
        return (await Bun.spawn(CLIS[id].status, { stdout: "ignore", stderr: "ignore" }).exited) === 0;
      } catch {
        return false;
      }
    }),
  );
  return (Object.keys(CLIS) as Cli[]).filter((_, i) => ok[i]).map((id) => ({ id, label: CLIS[id].label }));
}

export type InputThread = { id: string; ref: string; title: string; digest: string };

const MSG_TAIL = 600;
const NO_ACTION = new Set(["working", "starting", "waiting", "snoozed"]);

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
  const tail = message.length > MSG_TAIL ? `…${message.slice(-MSG_TAIL)}` : message;
  return `${line}\n${tail.replace(/^/gm, "  ")}`;
}

/** Every thread node of the visible tree, launched threads included, except those that need no action. */
export function briefInput(
  projects: Branch[],
  lastMessages: (ids: string[]) => Map<string, string | null>,
  now: number,
): InputThread[] {
  const nodes = projects.flatMap(allThreads).filter((n) => !NO_ACTION.has(n.status));
  const msgs = lastMessages(nodes.map((n) => n.id));
  return nodes.map((n, i) => ({
    id: n.id,
    ref: `t${i + 1}`,
    title: n.title,
    digest: digestOf(n, `t${i + 1}`, msgs.get(n.id) ?? null, now),
  }));
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
          kind: { type: "string", enum: ["answer", "merge", "fix", "review", "clean-up", "unblock"] },
          title: { type: "string" },
          reason: { type: "string" },
          threadIds: { type: "array", minItems: 1, items: { type: "string" } },
          prompt: { type: ["string", "null"] },
        },
      },
    },
  },
};

export function cliArgs(cli: Cli, guide: string, schemaFile: string, cwd: string): string[] {
  if (cli === "claude")
    return [
      "claude",
      "-p",
      "--model",
      "haiku",
      "--effort",
      "medium",
      "--tools",
      "",
      "--system-prompt",
      guide,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(SCHEMA),
      "--no-session-persistence",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      "--disable-slash-commands",
    ];
  return [
    "codex",
    "exec",
    "--model",
    "gpt-6-luna",
    "-c",
    "model_reasoning_effort=medium",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    cwd,
    ...[
      "shell_tool",
      "unified_exec",
      "apps",
      "plugins",
      "image_generation",
      "computer_use",
      "browser_use",
      "multi_agent",
      "hooks",
    ].flatMap((f) => ["--disable", f]),
    "-c",
    "web_search=disabled",
    "--output-schema",
    schemaFile,
    "--json",
    "-",
  ];
}

/** Codex has no system prompt flag, so the guide goes before the threads on stdin. */
export function stdinFor(cli: Cli, guide: string, threads: InputThread[]): string {
  const blocks = threads.map((t) => t.digest).join("\n\n") || "No threads.";
  return cli === "claude" ? blocks : `${guide}\n\n## Threads\n\n${blocks}`;
}

/** The fields read from Claude and Codex JSON output lines. */
type JsonLine = {
  type?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  message?: string;
  error?: { message?: string };
  item?: { type?: string; text?: string };
};

const jsonLines = (out: string): JsonLine[] =>
  out.split("\n").flatMap((l) => {
    if (!l.startsWith("{")) return [];
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });

/** The answer object, or the CLI's own error text. */
export function parseAnswer(cli: Cli, stdout: string): { answer: unknown } | { error: string } | null {
  const lines = jsonLines(stdout);
  if (cli === "claude") {
    const r = lines.findLast((l) => l.type === "result");
    if (!r) return null;
    return r.is_error ? { error: r.result ?? "Claude failed." } : { answer: r.structured_output };
  }
  const failed = lines.findLast((l) => l.type === "turn.failed");
  if (failed) return { error: failed.error?.message ?? "Codex failed." };
  const msg = lines.findLast((l) => l.type === "item.completed" && l.item?.type === "agent_message");
  if (!msg) {
    const err = lines.findLast((l) => l.type === "error");
    return err ? { error: String(err.message) } : null;
  }
  try {
    return { answer: JSON.parse(msg.item?.text ?? "") };
  } catch (e) {
    return { error: `Cannot parse the answer: ${(e as Error).message}` };
  }
}

/** Maps each ref back to its thread id, drops unknown refs, then drops actions with none left. Keeps the model's order. */
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
    if (hit.length === 0) continue;
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

const TIMEOUT_MS = 60_000;
const TAIL = 2048;
const GUIDE = new URL("./next-step-prompt.md", import.meta.url);

let dirs: { cwd: string; schema: string } | undefined;
/** One fixed empty working folder and the schema file, made once. */
function workDirs() {
  if (dirs) return dirs;
  const root = join(tmpdir(), "t3-thread-tree-brief");
  const cwd = join(root, "cwd");
  mkdirSync(cwd, { recursive: true });
  const schema = join(root, "schema.json");
  writeFileSync(schema, JSON.stringify(SCHEMA));
  return (dirs = { cwd, schema });
}

export type Outcome = Extract<BriefState, { status: "done" | "failed" }>;
export type Run = { done: Promise<Outcome | null>; cancel: () => void };

/** One CLI run. `done` gives `null` after `cancel()`. */
export function runBrief(cli: Cli, threads: InputThread[], now = () => new Date()): Run {
  const failed = (error: string, stderrTail = ""): Outcome => ({ status: "failed", cli, error, stderrTail });
  let cancelled = false;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  const done = (async (): Promise<Outcome | null> => {
    const guide = await Bun.file(GUIDE).text();
    const { cwd, schema } = workDirs();
    try {
      proc = Bun.spawn(cliArgs(cli, guide, schema, cwd), {
        cwd,
        stdin: Buffer.from(stdinFor(cli, guide, threads)),
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (e) {
      return failed(`Cannot start ${cli}: ${(e as Error).message}`);
    }
    if (cancelled) proc.kill("SIGTERM");
    let timedOut = false;
    const timer = setTimeout(() => ((timedOut = true), proc!.kill("SIGTERM")), TIMEOUT_MS);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (cancelled) return null;
    const tail = stderr.slice(-TAIL);
    if (timedOut) return failed("timed out", tail);
    const parsed = parseAnswer(cli, stdout);
    if (!parsed) return failed(code === 0 ? "The CLI gave no answer." : `${cli} exited with code ${code}.`, tail);
    if ("error" in parsed) return failed(parsed.error, tail);
    const kept = filterAnswer(parsed.answer, threads);
    if ("error" in kept) return failed(kept.error, tail);
    return { status: "done", cli, generatedAt: now().toISOString(), ...kept };
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      proc?.kill("SIGTERM");
    },
  };
}

type Offered = { id: Cli; label: string }[];

/** The one in-memory brief state, its routes, and one run at a time. */
export function briefService(o: {
  clis: Promise<Offered>;
  input: (settled: boolean) => InputThread[];
  onChange: () => void;
  run?: (cli: Cli, threads: InputThread[]) => Run;
}) {
  const run = o.run ?? runBrief;
  let state: BriefState = { status: "idle" };
  let active: Run | undefined;
  const set = (s: BriefState) => ((state = s), o.onChange());
  return {
    state: () => state,
    routes: {
      "/brief/clis": { GET: async () => Response.json(await o.clis) },
      "/brief/run": {
        POST: async (req: Request) => {
          const { cli } = ((await req.json().catch(() => null)) ?? {}) as { cli?: Cli };
          if (!(await o.clis).some((c) => c.id === cli))
            return new Response("This CLI is not offered.", { status: 400 });
          if (active) return new Response("A run is active.", { status: 409 });
          const threads = o.input(new URL(req.url).searchParams.get("settled") === "1");
          const before = state;
          const r = (active = run(cli!, threads));
          set({ status: "running", cli: cli!, threadCount: threads.length, startedAt: new Date().toISOString() });
          void r.done
            .catch((e): Outcome => ({ status: "failed", cli: cli!, error: String(e?.message ?? e), stderrTail: "" }))
            .then((out) => {
              active = undefined;
              set(out ?? before);
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
