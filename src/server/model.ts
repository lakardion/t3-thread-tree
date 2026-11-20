/** The shared model runner: run one Model pick with a feature's guide, input and JSON schema, and parse its answer. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import * as v from "valibot";

import type { LocalConfig, LocalState, ModelPick } from "../shared/model.ts";
import { writeToken } from "./token.ts";

export type ModelResult = { answer: unknown } | { error: string; detail: string };
export type ModelRun = { done: Promise<ModelResult | null>; cancel(): void };

type CliPick = Exclude<ModelPick, "local" | "apple">;

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
  pick: v.optional(v.nullable(v.picklist(["claude", "codex", "apple", "local"]))),
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

/** The saved pick and Catch-up switch. A missing or invalid file gives no pick. An unset switch is on for `claude` and `codex`, off for `local` and `apple`. No pick means off. */
export function readPickFile(file: string): PickSettings {
  const { pick = null, catchUp } = readRaw(file);
  return { pick, catchUp: pick !== null && (catchUp ?? (pick !== "local" && pick !== "apple")) };
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
      return { error: "The local model gave no valid answer.", detail };
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

/** The Apple model helper: the file beside the executable, else the dev build. `null` when neither exists. */
export function appleHelperPath(): string | null {
  return (
    [join(dirname(process.execPath), "apple-model"), "dist/sidecar/apple-model"].find((p) => existsSync(p)) ?? null
  );
}

type Json = Record<string, unknown>;

const isNullable = (s: unknown): boolean =>
  Array.isArray((s as Json)?.type) && ((s as Json).type as unknown[]).includes("null");

/** The helper's schema form: each object gets `title` and `x-order`, and a nullable type becomes its non-null type and leaves `required`. */
export function appleSchema(schema: object, title = "Answer"): Json {
  const out: Json = { ...schema };
  if (Array.isArray(out.type)) out.type = out.type.find((t) => t !== "null");
  if (out.items) out.items = appleSchema(out.items, title);
  const props = out.properties as Record<string, Json> | undefined;
  if (props) {
    out.title = title;
    out["x-order"] = Object.keys(props);
    out.properties = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, appleSchema(p, k)]));
    if (Array.isArray(out.required)) out.required = out.required.filter((k: string) => !isNullable(props[k]));
  }
  return out;
}

/** Sets each nullable key that the answer leaves out to `null`, following the original schema. */
function fillNulls(schema: object, value: unknown): unknown {
  const s = schema as Json;
  if (Array.isArray(value)) return value.map((x) => fillNulls((s.items as Json) ?? {}, x));
  if (typeof value !== "object" || value === null) return value;
  const props = (s.properties ?? {}) as Record<string, Json>;
  const out = { ...(value as Json) };
  for (const [k, p] of Object.entries(props)) {
    if (k in out) out[k] = fillNulls(p, out[k]);
    else if (isNullable(p)) out[k] = null;
  }
  return out;
}

const APPLE_TEXT: Record<string, string> = {
  contextWindow: "The thread did not fit in the Apple model's window.",
  refusal: "The Apple model refused the input.",
  guardrail: "The Apple model refused the input.",
  decoding: "The Apple model gave no valid answer.",
  busy: "The Apple model is busy. Try again.",
  locale: "The Apple model does not support this language.",
};

const APPLE_UNAVAILABLE: Record<string, string> = {
  deviceNotEligible: "This Mac cannot run the Apple model.",
  appleIntelligenceNotEnabled: "Turn on Apple Intelligence in System Settings to use the Apple model.",
  modelNotReady: "The Apple model is not ready yet. Try again later.",
  assetsUnavailable: "The Apple model is not ready yet. Try again later.",
};

/** The run error for an exit 1 object of the helper. */
function appleText(out: Json | null): string {
  const e = out?.error;
  if (e === "overflow" && typeof out?.tokens === "number" && typeof out.limit === "number")
    return `The thread is too long for the Apple model: ${out.tokens.toLocaleString("en-US")} of ${out.limit.toLocaleString("en-US")} tokens.`;
  const [table, key] = e === "unavailable" ? [APPLE_UNAVAILABLE, String(out?.reason)] : [APPLE_TEXT, String(e)];
  return Object.hasOwn(table, key) ? table[key] : "The Apple model helper exited with code 1.";
}

const parseJson = (s: string): Json | null => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** One Apple model run. Spawn, timeout and cancel follow the CLI branch of `run()` in `createModels`: fix both together. */
function runApple(
  helper: string | null,
  job: { guide: string; input: string; schema: object },
  timeoutMs: number,
): ModelRun {
  let cancelled = false;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  const done = (async (): Promise<ModelResult | null> => {
    try {
      if (!helper) throw new Error("no helper");
      proc = Bun.spawn([helper, "run"], {
        stdin: Buffer.from(JSON.stringify({ ...job, schema: appleSchema(job.schema) })),
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (e) {
      return { error: "Cannot start the Apple model helper.", detail: (e as Error).message };
    }
    if (cancelled) proc.kill("SIGTERM");
    let timedOut = false;
    const timer = setTimeout(() => ((timedOut = true), proc!.kill("SIGTERM")), timeoutMs);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (cancelled) return null;
    const detail = stderr.slice(-TAIL);
    if (timedOut) return { error: "timed out", detail };
    const out = parseJson(stdout);
    if (code === 0) {
      if (!out || !("answer" in out)) return { error: "The Apple model gave no valid answer.", detail };
      return { answer: fillNulls(job.schema, out.answer) };
    }
    return { error: code === 1 ? appleText(out) : `The Apple model helper exited with code ${code}.`, detail };
  })();
  return {
    done,
    cancel() {
      cancelled = true;
      proc?.kill("SIGTERM");
    },
  };
}

/** The Apple model when `check` says it is available, else `null` with the reason logged. Free: no model call. */
async function appleOffered(helper: string): Promise<{ id: "apple"; label: string } | null> {
  let why: string;
  try {
    const proc = Bun.spawn([helper, "check"], { stdout: "pipe", stderr: "ignore" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), proc.exited]);
    const out = parseJson(stdout);
    if (code !== 0) why = `exit code ${code}`;
    else if (out?.available === true) return { id: "apple", label: "Apple model" };
    else why = out && "available" in out ? String(out.reason) : "bad output";
  } catch (e) {
    why = (e as Error).message;
  }
  console.log(`thread tree: Apple model hidden: ${why}`);
  return null;
}

/** `localConfig` is the saved Local model config, read on each call. `appleHelper` is the helper path, or `null` for none. `timeoutMs` is the Local and Apple model run timeout. */
export function createModels(o: {
  localConfig: () => LocalConfig | null;
  appleHelper: string | null;
  timeoutMs?: number;
}) {
  const detected = detect();
  return {
    offered: async (): Promise<{ id: ModelPick; label: string }[]> => {
      const c = o.localConfig();
      /** ponytail: `check` has no timeout, so a hung helper blocks `GET /models`; add one if a hang is seen. */
      const apple = o.appleHelper ? await appleOffered(o.appleHelper) : null;
      return [
        ...(await detected),
        ...(apple ? [apple] : []),
        ...(c ? [{ id: "local" as const, label: `Local · ${c.model}` }] : []),
      ];
    },
    /** One run. `done` gives `null` after `cancel()`. */
    run(pick: ModelPick, job: { guide: string; input: string; schema: object }): ModelRun {
      if (pick === "local") return runLocal(o.localConfig(), job, o.timeoutMs ?? TIMEOUT_MS);
      if (pick === "apple") return runApple(o.appleHelper, job, o.timeoutMs ?? TIMEOUT_MS);
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
