/** Send a message to a thread and start a thread, by running the T3 CLI. */
import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { type CliStatus, DELIVERIES, type Delivery, type SendError } from "../shared/send.ts";
import type { SettingType } from "../shared/workflow-start.ts";
import { oldCli } from "./workflow-start.ts";

const TIMEOUT_MS = 30_000;
const TAIL = 2048;

export const cliPath = (env: Record<string, string | undefined> = process.env) =>
  env.T3_BIN?.trim() || join(homedir(), ".t3", "bin", "t3");

export async function checkCli(path: string): Promise<CliStatus> {
  try {
    await access(path, constants.X_OK);
    return { available: true, path };
  } catch {
    return { available: false, path };
  }
}

/** The message goes on stdin, never in argv. */
export const sendArgs = (bin: string, threadId: string) => [bin, "thread", "send", "--json", threadId, "-"];

/** One `--title=` item, so a title that starts with `-` is not read as a flag. */
export const startArgs = (bin: string, projectId: string, title: string) => [
  bin,
  "thread",
  "start",
  "--json",
  `--title=${title}`,
  projectId,
  "-",
];

/** The input and the key are single argv items, so a value that starts with `-` is not read as a flag. */
export const workflowStartArgs = (bin: string, name: string, input: object, key: string) => [
  bin,
  "workflow",
  "start",
  "--json",
  `--input=${JSON.stringify(input)}`,
  `--key=${key}`,
  name,
];

/**
 * A JSON value that starts with `-` (a negative number) gets a leading space, so the CLI does not read it as a flag.
 */
export const storeSetArgs = (bin: string, key: string, value: string | number | boolean) => {
  const json = JSON.stringify(value);
  return [bin, "workflow", "store", "set", key, json.startsWith("-") ? ` ${json}` : json];
};

export const storeDeleteArgs = (bin: string, key: string) => [bin, "workflow", "store", "delete", key];

export const storeListArgs = (bin: string) => [bin, "workflow", "store", "list", "--json", "settings/"];

export type CliRun = (
  argv: string[],
  stdin: string,
) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>;

/** Spawn errors (`ENOENT`, `EACCES`) throw. */
export const runCli: CliRun = async (argv, stdin) => {
  const proc = Bun.spawn(argv, { stdin: Buffer.from(stdin), stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), proc.kill("SIGTERM")), TIMEOUT_MS);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code: timedOut ? null : code, stdout, stderr, timedOut };
};

const fail = (status: number, error: string, exitCode: number | null = null, stderr = "") =>
  Response.json({ error, exitCode, stderrTail: stderr.slice(-TAIL) } satisfies SendError, { status });

const lastLine = (s: string) =>
  s
    .split("\n")
    .findLast((l) => l.trim())
    ?.trim();

const field = (out: unknown, name: string) => (out as Record<string, unknown> | null)?.[name];

/** The projects a thread can start in, sorted by label. The project whose `path` is `root` comes first. */
export const projectChoices = (projects: Map<string, { title: string; path?: string }>, root: string) =>
  [...projects]
    .map(([id, p]) => ({ id, label: p.title, own: p.path === root }))
    .toSorted((a, b) => Number(b.own) - Number(a.own) || a.label.localeCompare(b.label))
    .map(({ id, label }) => ({ id, label }));

/** The send routes. `hasThread` and `hasProject` check the live maps. `projectList` feeds `GET /t3/projects`. */
export function sendService(o: {
  cli: Promise<CliStatus>;
  hasThread: (id: string) => boolean;
  hasProject: (id: string) => boolean;
  projectList?: () => { id: string; label: string }[];
  /** The scanned type of a settings key. Without it, every set is `400`. */
  settingType?: (key: string) => SettingType | null;
  run?: CliRun;
}) {
  const run = o.run ?? runCli;

  /**
   * Run the CLI and map the outcome to a response. `pick` reads the success field. A null `pick` expects plain text
   * output and answers `204`. `failText` may replace the stderr line.
   */
  async function exec(
    argv: (bin: string) => string[],
    stdin: string,
    pick: ((out: unknown) => object | null) | null,
    failText?: (stderr: string) => string | undefined,
  ) {
    const { available, path } = await o.cli;
    const missing = () => fail(503, `No t3 CLI at ${path}. Set T3_BIN in .env.`);
    if (!available) return missing();
    let r: Awaited<ReturnType<CliRun>>;
    try {
      r = await run(argv(path), stdin);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EACCES") return missing();
      throw e;
    }
    if (r.timedOut) return fail(502, "timed out", null, r.stderr);
    if (r.code !== 0)
      return fail(
        502,
        failText?.(r.stderr) ??
          lastLine(r.stderr) ??
          (r.code === null ? "t3 was killed by a signal" : `t3 exited with code ${r.code}`),
        r.code,
        r.stderr,
      );
    if (!pick) return new Response(null, { status: 204 });
    let out: unknown;
    try {
      out = JSON.parse(r.stdout);
    } catch (e) {
      return fail(502, `Cannot parse the CLI output: ${(e as Error).message}`, null, r.stderr);
    }
    const ok = pick(out);
    return ok ? Response.json(ok) : fail(502, "The CLI output has no expected field.", null, r.stderr);
  }

  /** Validate the body and check the id, then run the CLI. */
  async function handle(
    req: Request,
    k: {
      idField: "threadId" | "projectId";
      has: (id: string) => boolean;
      notFound: string;
      titled: boolean;
      argv: (bin: string, id: string, title: string) => string[];
      pick: (out: unknown) => Record<string, string> | null;
    },
  ) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return fail(400, "Invalid JSON");
    const values: Record<string, string> = {};
    const texts = k.titled ? ["title", "message"] : ["message"];
    for (const f of [k.idField, ...texts]) {
      const v = body[f];
      if (typeof v !== "string") return fail(400, `Missing ${f}`);
      values[f] = v;
    }
    for (const f of texts) if (!values[f].trim()) return fail(400, `Empty ${f}`);
    const id = values[k.idField];
    if (!k.has(id)) return fail(404, k.notFound);
    return exec((bin) => k.argv(bin, id, values.title?.trim() ?? ""), values.message, k.pick);
  }

  /** `{ workflow, input, key }`: starts one run. The workflow name is checked by T3, not here. */
  async function startWorkflow(req: Request) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return fail(400, "Invalid JSON");
    const { workflow, input, key } = body;
    if (typeof workflow !== "string" || !workflow.trim() || workflow.startsWith("-"))
      return fail(400, "Missing workflow");
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "Missing input");
    if (typeof key !== "string" || !key.trim()) return fail(400, "Missing key");
    return exec(
      (bin) => workflowStartArgs(bin, workflow, input, key),
      "",
      (out) => {
        const runId = field(field(out, "run"), "runId");
        return typeof runId === "string" ? { runId } : null;
      },
      (stderr) => (oldCli(stderr) ? "Update T3 Code to use workflows" : undefined),
    );
  }

  /** `{ key, value }`: `value` null deletes the key. Else the value must fit the scanned type of the key. */
  async function writeSetting(req: Request) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return fail(400, "Invalid JSON");
    const { key, value } = body;
    if (typeof key !== "string" || !key.startsWith("settings/")) return fail(400, "Missing key");
    if (value === null) return exec((bin) => storeDeleteArgs(bin, key), "", null);
    const type = o.settingType?.(key);
    if (!type || type === "other") return fail(400, "Unknown setting");
    const fits = type === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === type;
    if (!fits) return fail(400, `The value must be a ${type}`);
    return exec((bin) => storeSetArgs(bin, key, value as string | number | boolean), "", null);
  }

  return {
    routes: {
      "/t3/cli": { GET: async () => Response.json(await o.cli) },
      "/t3/projects": { GET: () => Response.json(o.projectList?.() ?? []) },
      "/t3/send": {
        POST: (req: Request) =>
          handle(req, {
            idField: "threadId",
            has: o.hasThread,
            notFound: "Unknown thread",
            titled: false,
            argv: sendArgs,
            pick: (out) => {
              const delivery = field(out, "delivery");
              return DELIVERIES.includes(delivery as Delivery) ? { delivery: delivery as Delivery } : null;
            },
          }),
      },
      "/t3/workflows/start": { POST: startWorkflow },
      "/t3/workflows/settings": {
        GET: () =>
          exec(
            storeListArgs,
            "",
            (out) => (Array.isArray(out) ? out : null),
            (stderr) => (oldCli(stderr) ? "Update T3 Code to use workflows" : undefined),
          ),
        POST: writeSetting,
      },
      "/t3/start": {
        POST: (req: Request) =>
          handle(req, {
            idField: "projectId",
            has: o.hasProject,
            notFound: "Unknown project",
            titled: true,
            argv: startArgs,
            pick: (out) => {
              const threadId = field(out, "threadId");
              return typeof threadId === "string" ? { threadId } : null;
            },
          }),
      },
    },
  };
}
