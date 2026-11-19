/** PROTOTYPE, throwaway: Haiku vs local Qwen on captured Next-step brief inputs. `bun scripts/proto-brief-bench/bench.ts <dir>` */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliArgs, parseAnswer, SCHEMA, stdinFor, type InputThread } from "../../src/server/brief.ts";
import guide from "../../src/server/next-step-prompt.md" with { type: "text" };

const dir = process.argv[2]!;
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const MODELS = (process.env.MODELS ?? "haiku,qwen3.5:4b-nvfp4,qwen3.5:9b-nvfp4").split(",");
const live: InputThread[] = JSON.parse(readFileSync(join(dir, "live.json"), "utf8"));

/** Distinct slices, so no input is a prefix of another; re-ref t1..tn. */
const slices: [string, number, number][] = [["n2", 0, 2], ["n4", 2, 6], ["n7", 6, 13], ["n10", 5, 15], ["n15", 0, 15]];
const inputs = slices.map(([name, a, b]) => ({
  name,
  threads: live.slice(a, b).map((t, i) => ({ ...t, ref: `t${i + 1}`, digest: t.digest.replace(/^t\d+/, `t${i + 1}`) })),
}));

const KINDS = ["review", "clean-up", "unblock"];
function check(ans: any, refs: Set<string>) {
  const errs: string[] = [];
  const acts = ans?.actions;
  if (!Array.isArray(acts)) return { valid: false, errs: ["no actions"], invented: [] as string[] };
  if (acts.length > 7) errs.push("more than 7");
  for (const a of acts) {
    for (const k of ["kind", "title", "reason", "threadIds", "prompt"]) if (!(k in a)) errs.push(`missing ${k}`);
    if (!KINDS.includes(a.kind)) errs.push(`kind ${a.kind}`);
    if (!Array.isArray(a.threadIds) || a.threadIds.length === 0) errs.push("threadIds");
    if (!(a.prompt === null || typeof a.prompt === "string")) errs.push("prompt type");
  }
  const invented = acts.flatMap((a: any) => (a.threadIds ?? []).filter((r: string) => !refs.has(r)));
  return { valid: errs.length === 0, errs, invented };
}

const cwd = join(dir, "cwd");
mkdirSync(cwd, { recursive: true });
const schemaFile = join(dir, "schema.json");
writeFileSync(schemaFile, JSON.stringify(SCHEMA));

async function haiku(threads: InputThread[]) {
  const p = Bun.spawn(cliArgs("claude", guide, schemaFile, cwd), { cwd, stdin: Buffer.from(stdinFor("claude", guide, threads)), stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  const r = parseAnswer("claude", out);
  const usage = out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).findLast((l: any) => l.type === "result")?.usage;
  return { answer: r && "answer" in r ? r.answer : null, error: r && "error" in r ? r.error : r ? null : "no result", promptTokens: usage ? usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) : null, finish: null };
}

async function local(model: string, threads: InputThread[]) {
  let res: Response;
  try { res = await fetch("http://localhost:11434/v1/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(60_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, reasoning_effort: "none", keep_alive: "30m",
      messages: [{ role: "system", content: guide }, { role: "user", content: stdinFor("claude", guide, threads) }],
      response_format: { type: "json_schema", json_schema: { name: "brief", strict: true, schema: SCHEMA } },
    }),
  }); } catch (e) { return { answer: null, error: `timeout: ${(e as Error).name}`, promptTokens: null, finish: null }; }
  const j: any = await res.json();
  if (!res.ok) return { answer: null, error: JSON.stringify(j), promptTokens: null, finish: null };
  const text = j.choices[0].message.content;
  let answer = null, error = null;
  try { answer = JSON.parse(text); } catch (e) { error = `parse: ${(e as Error).message}`; }
  return { answer, error, promptTokens: j.usage?.prompt_tokens, completionTokens: j.usage?.completion_tokens, finish: j.choices[0].finish_reason };
}

const unload = (model: string) => fetch("http://localhost:11434/api/generate", { method: "POST", body: JSON.stringify({ model, keep_alive: 0 }) });

const results: any[] = [];
for (const model of MODELS) {
  if (model !== "haiku") for (const m of MODELS.filter((x) => x !== "haiku")) await unload(m);
  let first = true;
  for (let round = 0; round < ROUNDS; round++)
    for (const inp of inputs) {
      const t0 = performance.now();
      const r = model === "haiku" ? await haiku(inp.threads) : await local(model, inp.threads);
      const ms = Math.round(performance.now() - t0);
      const c = check(r.answer, new Set(inp.threads.map((t) => t.ref)));
      const row = { model, input: inp.name, round, cold: model !== "haiku" && first, ms, ...r, ...c };
      first = false;
      results.push(row);
      console.log(model, inp.name, round, `${ms}ms`, row.cold ? "COLD" : "", "valid", c.valid, "invented", c.invented, "pt", r.promptTokens, "ct", (r as any).completionTokens, r.finish ?? "", r.error ?? "");
      writeFileSync(join(dir, `results-${process.env.OUT ?? "all"}.json`), JSON.stringify({ inputs, results }, null, 1));
    }
}
