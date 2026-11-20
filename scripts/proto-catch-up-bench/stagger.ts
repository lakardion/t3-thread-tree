/** PROTOTYPE, throwaway: one call, then a second call 1 s later; prints the phase times of both. */
import { readFileSync } from "node:fs";
const DIR = `${process.env.HOME}/.local/share/proto-apple-catch-up`;
const inputs = JSON.parse(readFileSync(`${DIR}/inputs.json`, "utf8"));
const H = import.meta.dir;
const run = async (i: number) => {
  const p = Bun.spawn([`${H}/brief`, `${H}/schema-apple.json`, `${H}/guide.md`], { stdin: Buffer.from(inputs[i].input), stdout: "pipe", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  await p.exited;
  return Object.fromEntries([...err.matchAll(/phase (\w+) at=(\d+)/g)].map((m) => [m[1], Number(m[2])]));
};
const t0 = Date.now();
const a = run(9);
await new Promise((r) => setTimeout(r, 1000));
const b = run(1);
for (const [k, p] of [["first", await a], ["second", await b]] as const)
  console.log(k, Object.fromEntries(Object.entries(p).map(([q, v]) => [q, ((v - t0) / 1000).toFixed(1)])));
