/**
 * PROTOTYPE, throwaway: Catch-up bench. `bun bench.ts haiku|apple [label] [parallel]`.
 * Haiku goes through the app's runner. Apple goes through the Swift helper with an Apple-ready schema.
 * Raw results go to ~/.local/share/proto-apple-catch-up/results-<label>.json.
 */
import { readFileSync, writeFileSync } from "node:fs";

import guide from "../../src/server/catch-up-prompt.md" with { type: "text" };
import { parseAnswer, SCHEMA } from "../../src/server/catch-up.ts";
import { createModels } from "../../src/server/model.ts";

const DIR = `${process.env.HOME}/.local/share/proto-apple-catch-up`;
const HERE = import.meta.dir;
const [mode, label = mode, par = "1"] = process.argv.slice(2);
const inputs: { id: string; msgLen: number; input: string }[] = JSON.parse(readFileSync(`${DIR}/inputs.json`, "utf8"));

/** Adds `title` and `x-order`, and turns a type array with `null` into an optional key, as ticket 05 specifies. */
function appleSchema(s: any, title = "CatchUp"): any {
  if (s.type !== "object") return s;
  const props = Object.entries(s.properties).map(([k, p]: [string, any]) => {
    const nullable = Array.isArray(p.type) && p.type.includes("null");
    const type = Array.isArray(p.type) ? p.type.find((t: string) => t !== "null") : p.type;
    return [k, { ...appleSchema({ ...p, type }, k), ...(nullable && { nullable }) }] as const;
  });
  return {
    ...s,
    title,
    "x-order": props.map(([k]) => k),
    required: s.required.filter((k: string) => !props.find(([n, p]) => n === k && p.nullable)),
    properties: Object.fromEntries(props.map(([k, { nullable, ...p }]) => [k, p])),
  };
}
writeFileSync(`${HERE}/schema-apple.json`, JSON.stringify(appleSchema(SCHEMA)));
writeFileSync(`${HERE}/guide.md`, guide);

async function apple(input: string) {
  const p = Bun.spawn([`${HERE}/brief`, `${HERE}/schema-apple.json`, `${HERE}/guide.md`], {
    stdin: Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const kill = setTimeout(() => p.kill("SIGTERM"), 60_000);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(kill);
  const n = (k: string) => Number(err.match(new RegExp(`${k}=(\\d+)`))?.[1] ?? NaN);
  const tokens = { instructions: n("instructions"), prompt: n("prompt"), schema: n("schema"), sum: n("sum"), output: n("output"), genms: n("genms"), phases: Object.fromEntries([...err.matchAll(/phase (\w+) at=(\d+)/g)].map((m) => [m[1], Number(m[2])])) };
  if (code !== 0) return { error: `exit ${code}: ${err.trim()}`, tokens };
  return { answer: JSON.parse(out), tokens };
}

const models = createModels({ localConfig: () => null });
const haiku = async (input: string) => (await models.run("claude", { guide, input, schema: SCHEMA }).done) ?? { error: "cancelled" };

/** `missing`: key left out; `nullish`: a string that means nothing; `null`: a real null; `text`: a real ask. */
const askClass = (raw: any) =>
  !raw ? "-" : !("ask" in raw) ? "missing" : raw.ask === null ? "null" : /^\s*(null|none|n\/a|nil|undefined)?\s*$/i.test(raw.ask) ? "nullish" : "text";

const t0 = performance.now();
async function one(i: number) {
  const start = Math.round(performance.now() - t0);
  const r: any = mode === "apple" ? await apple(inputs[i].input) : await haiku(inputs[i].input);
  const end = Math.round(performance.now() - t0);
  const ms = end - start;
  const raw = r.answer;
  /** The app reads a missing optional `ask` as null. */
  const parsed = raw ? parseAnswer({ ask: null, ...raw }) : null;
  console.log(`${i}\t${start}-${end}\t${ms}ms\t${parsed ? "valid" : `INVALID ${r.error ?? ""}`}\t${askClass(raw)}`);
  return { i, id: inputs[i].id, msgLen: inputs[i].msgLen, start, end, ms, valid: !!parsed, askClass: askClass(raw), raw, error: r.error, tokens: r.tokens };
}

/** Burst: `par` copies of one input start at the same moment. */
if (process.argv[5] === "burst") {
  const i = 9;
  const rs = await Promise.all(Array.from({ length: Number(par) }, () => one(i)));
  writeFileSync(`${DIR}/results-${label}.json`, JSON.stringify(rs, null, 2));
  process.exit(0);
}

const results: Awaited<ReturnType<typeof one>>[] = [];
const queue = inputs.map((_, i) => i);
await Promise.all(
  Array.from({ length: Number(par) }, async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) results.push(await one(i));
  }),
);
const wall = Math.round(performance.now() - t0);
results.sort((a, b) => a.i - b.i);
const ms = results.map((r) => r.ms).toSorted((a, b) => a - b);
const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)];
const summary = { label, par: Number(par), valid: results.filter((r) => r.valid).length, n: results.length, median: q(0.5), p90: q(0.9), max: ms.at(-1), wall };
console.log(JSON.stringify(summary));
writeFileSync(`${DIR}/results-${label}.json`, JSON.stringify({ summary, results }, null, 2));
