/** The shared model runner: run one Model pick with a feature's guide, input and JSON schema, and parse its answer. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ModelPick } from "../shared/brief.ts";

export type LocalConfig = { baseUrl: string; model: string };
export type ModelResult = { answer: unknown } | { error: string; detail: string };
export type ModelRun = { done: Promise<ModelResult | null>; cancel(): void };

const CLIS: Record<ModelPick, { label: string; status: string[] }> = {
  claude: { label: "Claude Haiku", status: ["claude", "auth", "status"] },
  codex: { label: "Codex Luna", status: ["codex", "login", "status"] },
};

/** Model picks on `PATH` and logged in. Free and local: no model call. */
async function detect(): Promise<{ id: ModelPick; label: string }[]> {
  const ok = await Promise.all(
    (Object.keys(CLIS) as ModelPick[]).map(async (id) => {
      try {
        return (await Bun.spawn(CLIS[id].status, { stdout: "ignore", stderr: "ignore" }).exited) === 0;
      } catch {
        return false;
      }
    }),
  );
  return (Object.keys(CLIS) as ModelPick[]).filter((_, i) => ok[i]).map((id) => ({ id, label: CLIS[id].label }));
}

function cliArgs(pick: ModelPick, guide: string, schema: object, schemaFile: string, cwd: string): string[] {
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
export function stdinFor(pick: ModelPick, guide: string, input: string): string {
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
export function parseOutput(pick: ModelPick, stdout: string): { answer: unknown } | { error: string } | null {
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

/** `localConfig` is the config of the local adapter. */
export function createModels(_o: { localConfig: () => LocalConfig | null }) {
  const detected = detect();
  return {
    offered: () => detected,
    /** One run. `done` gives `null` after `cancel()`. */
    run(pick: ModelPick, job: { guide: string; input: string; schema: object }): ModelRun {
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
