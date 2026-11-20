/** The shared model runner: run one Model pick with a feature's guide, input and JSON schema, and parse its answer. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as v from "valibot";

import type { LocalConfig, LocalState, ModelPick } from "../shared/brief.ts";
import { writeToken } from "./token.ts";

export type ModelResult = { answer: unknown } | { error: string; detail: string };
export type ModelRun = { done: Promise<ModelResult | null>; cancel(): void };

type CliPick = Exclude<ModelPick, "local">;

const LocalConfigSchema = v.object({
  baseUrl: v.pipe(
    v.string(),
    v.trim(),
    v.url(),
    v.regex(/^https?:\/\//),
    v.transform((u) => u.replace(/\/+$/, "")),
  ),
  model: v.pipe(v.string(), v.trim(), v.regex(/^[^\r\n]+$/)),
});

/** The saved Local model config, or `null` when the file is missing or invalid. */
export function readLocalConfig(file: string): LocalConfig | null {
  try {
    const r = v.safeParse(LocalConfigSchema, JSON.parse(readFileSync(file, "utf8")));
    return r.success ? r.output : null;
  } catch {
    return null;
  }
}

/** Asks the runtime for its model list. */
export async function localState(c: LocalConfig | null): Promise<LocalState> {
  if (!c) return "unset";
  try {
    const res = await fetch(`${c.baseUrl}/models`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return "down";
    const body = (await res.json()) as { data?: { id?: string }[] };
    return body.data?.some((m) => m.id === c.model) ? "ok" : "missing";
  } catch {
    return "down";
  }
}

/** The `/local-model` routes: `GET` gives the config and its state, `PUT` saves a new config. JSON only, like `/token`. */
export function localModelRoutes(file: string) {
  const reply = async () => {
    const config = readLocalConfig(file);
    return Response.json({ config, state: await localState(config) });
  };
  return {
    "/local-model": {
      GET: reply,
      PUT: async (req: Request) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const r = v.safeParse(LocalConfigSchema, await req.json().catch(() => null));
        if (!r.success) return new Response("Not a valid config", { status: 400 });
        writeToken(file, JSON.stringify(r.output));
        return reply();
      },
    },
  };
}

const PickFileSchema = v.object({
  pick: v.optional(v.nullable(v.picklist(["claude", "codex", "local"]))),
  catchUp: v.optional(v.boolean()),
});

export type PickSettings = { pick: ModelPick | null; catchUp: boolean };

const readRaw = (file: string): v.InferOutput<typeof PickFileSchema> => {
  try {
    const r = v.safeParse(PickFileSchema, JSON.parse(readFileSync(file, "utf8")));
    return r.success ? r.output : {};
  } catch {
    return {};
  }
};

/** The saved pick and Catch-up switch. A missing or invalid file gives no pick. An unset switch is on for `claude` and `codex`, off for `local`. No pick means off. */
export function readPickFile(file: string): PickSettings {
  const { pick = null, catchUp } = readRaw(file);
  return { pick, catchUp: pick !== null && (catchUp ?? pick !== "local") };
}

/** The `/model-pick` routes: `GET` gives the saved settings, `PUT` merges `{ pick?, catchUp? }` into them, then calls `onSave`. JSON only, like `/local-model`. */
export function pickRoutes(file: string, onSave: () => void) {
  const reply = () => Response.json(readPickFile(file));
  return {
    "/model-pick": {
      GET: reply,
      PUT: async (req: Request) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const r = v.safeParse(PickFileSchema, await req.json().catch(() => null));
        if (!r.success) return new Response("Not valid settings", { status: 400 });
        writeToken(file, JSON.stringify({ ...readRaw(file), ...r.output }));
        onSave();
        return reply();
      },
    },
  };
}

const CLIS: Record<CliPick, { label: string; status: string[] }> = {
  claude: { label: "Claude Haiku", status: ["claude", "auth", "status"] },
  codex: { label: "Codex Luna", status: ["codex", "login", "status"] },
};

/** Model picks on `PATH` and logged in. Free and local: no model call. */
async function detect(): Promise<{ id: CliPick; label: string }[]> {
  const ok = await Promise.all(
    (Object.keys(CLIS) as CliPick[]).map(async (id) => {
      try {
        return (await Bun.spawn(CLIS[id].status, { stdout: "ignore", stderr: "ignore" }).exited) === 0;
      } catch {
        return false;
      }
    }),
  );
  return (Object.keys(CLIS) as CliPick[]).filter((_, i) => ok[i]).map((id) => ({ id, label: CLIS[id].label }));
}

function cliArgs(pick: CliPick, guide: string, schema: object, schemaFile: string, cwd: string): string[] {
  if (pick === "claude")
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
      JSON.stringify(schema),
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

/** Exported for tests. Codex has no system prompt flag, so the guide goes before the input on stdin. */
export function stdinFor(pick: CliPick, guide: string, input: string): string {
  return pick === "claude" ? input : `${guide}\n\n## Input\n\n${input}`;
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

/** Exported for tests. The answer object, or the CLI's own error text. */
export function parseOutput(pick: CliPick, stdout: string): { answer: unknown } | { error: string } | null {
  const lines = jsonLines(stdout);
  if (pick === "claude") {
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

const TIMEOUT_MS = 60_000;
const TAIL = 2048;

/** One fixed empty working folder, and the schema file for this schema, written when missing. */
function workDirs(schema: object) {
  const root = join(tmpdir(), "t3-thread-tree-model");
  const cwd = join(root, "cwd");
  mkdirSync(cwd, { recursive: true });
  const json = JSON.stringify(schema);
  const file = join(root, `schema-${Bun.hash(json)}.json`);
  if (!existsSync(file)) writeFileSync(file, json);
  return { cwd, schemaFile: file };
}

/** One Local model run. `null` config means the file was removed after the pick was offered. */
function runLocal(
  c: LocalConfig | null,
  job: { guide: string; input: string; schema: object },
  timeoutMs: number,
): ModelRun {
  const ctl = new AbortController();
  let cancelled = false;
  let timedOut = false;
  const done = (async (): Promise<ModelResult | null> => {
    if (!c) return { error: "The Local model is not set up.", detail: "" };
    const timer = setTimeout(() => ((timedOut = true), ctl.abort()), timeoutMs);
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctl.signal,
        body: JSON.stringify({
          model: c.model,
          messages: [
            { role: "system", content: job.guide },
            { role: "user", content: job.input },
          ],
          response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: job.schema } },
          reasoning_effort: "none",
          keep_alive: "30m",
          max_tokens: 2000,
        }),
      });
      const text = await res.text();
      const detail = text.slice(-TAIL);
      if (res.status === 501)
        return { error: "The runtime cannot enforce the schema. Install the Ollama app build.", detail };
      if (res.status === 404) return { error: `Model ${c.model} is not in the runtime.`, detail };
      if (!res.ok) return { error: `The local runtime answered HTTP ${res.status}.`, detail };
      try {
        const choice = JSON.parse(text).choices[0];
        if (choice.finish_reason !== "length") return { answer: JSON.parse(choice.message.content) };
      } catch {}
      return { error: "The local model gave no valid brief.", detail };
    } catch (e) {
      if (cancelled) return null;
      if (timedOut) return { error: "timed out", detail: "" };
      return { error: `Local model not reachable at ${c.baseUrl}.`, detail: (e as Error).message };
    } finally {
      clearTimeout(timer);
    }
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      ctl.abort();
    },
  };
}

/** `localConfig` is the saved Local model config, read on each call. `timeoutMs` is the Local model run timeout. */
export function createModels(o: { localConfig: () => LocalConfig | null; timeoutMs?: number }) {
  const detected = detect();
  return {
    offered: async (): Promise<{ id: ModelPick; label: string }[]> => {
      const c = o.localConfig();
      return [...(await detected), ...(c ? [{ id: "local" as const, label: `Local · ${c.model}` }] : [])];
    },
    /** One run. `done` gives `null` after `cancel()`. */
    run(pick: ModelPick, job: { guide: string; input: string; schema: object }): ModelRun {
      if (pick === "local") return runLocal(o.localConfig(), job, o.timeoutMs ?? TIMEOUT_MS);
      let cancelled = false;
      let proc: ReturnType<typeof Bun.spawn> | undefined;
      const done = (async (): Promise<ModelResult | null> => {
        const { cwd, schemaFile } = workDirs(job.schema);
        try {
          proc = Bun.spawn(cliArgs(pick, job.guide, job.schema, schemaFile, cwd), {
            cwd,
            stdin: Buffer.from(stdinFor(pick, job.guide, job.input)),
            stdout: "pipe",
            stderr: "pipe",
          });
        } catch (e) {
          return { error: `Cannot start ${pick}: ${(e as Error).message}`, detail: "" };
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
        const detail = stderr.slice(-TAIL);
        if (timedOut) return { error: "timed out", detail };
        const parsed = parseOutput(pick, stdout);
        if (!parsed)
          return { error: code === 0 ? "The CLI gave no answer." : `${pick} exited with code ${code}.`, detail };
        if ("error" in parsed) return { error: parsed.error, detail };
        return parsed;
      })();
      return {
        done,
        cancel() {
          cancelled = true;
          proc?.kill("SIGTERM");
        },
      };
    },
  };
}

export type Models = ReturnType<typeof createModels>;
