/** PROTOTYPE, throwaway: Apple vs saved Haiku and Qwen, all rounds side by side. `bun report-apple.ts <dir>` */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "./bench.ts";

const dir = process.argv[2]!;
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const { inputs } = load("results-apple.json");
const results = ["results-haiku.json", "results-local.json", "results-apple.json"].flatMap((f) => load(f).results)
  .map((r: any) => ({ ...r, ...check(r.answer, new Set(inputs.find((i: any) => i.name === r.input).threads.map((t: any) => t.ref))) }));
const models = [...new Set(results.map((r: any) => r.model))] as string[];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const median = (xs: number[]) => { const s = xs.toSorted((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const sec = (ms: number) => (ms / 1000).toFixed(1);
const overflow = (r: any) => /exceededContextWindowSize/.test(r.error ?? "");
const fitting = (r: any) => r.input !== "n15";

const summary = models.map((m) => {
  const rs = results.filter((r: any) => r.model === m);
  const fit = rs.filter(fitting);
  const warm = rs.filter((r: any) => !r.cold && r.valid);
  const sum = (k: string) => rs.reduce((n: number, r: any) => n + (r[k] ?? 0), 0);
  return `<tr><td>${m}</td><td>${rs.filter((r: any) => r.valid).length}/${rs.length}</td><td>${fit.filter((r: any) => r.valid).length}/${fit.length}</td><td>${rs.filter(overflow).length}</td><td>${rs.reduce((n: number, r: any) => n + r.invented.length, 0)}</td><td>${sum("refInText")}</td><td>${sum("nullString")}</td><td>${rs.filter((r: any) => r.empty).length}</td><td><b>${sec(median(warm.map((r: any) => r.ms)))}</b></td><td>${rs.find((r: any) => r.cold) ? sec(rs.find((r: any) => r.cold).ms) : "-"}</td></tr>`;
}).join("");

const apple = results.filter((r: any) => r.model === "apple");
const tokens = inputs.map((inp: any) => {
  const rs = apple.filter((r: any) => r.input === inp.name);
  const outs = rs.map((r: any) => r.completionTokens).filter(Number.isFinite);
  const pt = rs[0]?.promptTokens;
  return `<tr><td>${inp.name}</td><td>${rs[0]?.tokens?.prompt}</td><td>${pt}</td><td>${outs.join(" / ") || "-"}</td><td>${4096 - pt}</td><td>${rs.filter((r: any) => r.valid).length}/${rs.length}</td><td>${rs.map((r: any) => sec(r.ms)).join(" / ")}</td><td>${models.filter((m) => m !== "apple").map((m) => `${m} ${sec(median(results.filter((r: any) => r.model === m && r.input === inp.name && !r.cold).map((r: any) => r.ms)))}`).join("<br>")}</td></tr>`;
}).join("");

const card = (r: any, inp: any) => {
  const title = (ref: string) => inp.threads.find((t: any) => t.ref === ref)?.title ?? `INVENTED ${ref}`;
  return `<div class=col><h4>${esc(r.model)} r${r.round} · ${sec(r.ms)} s</h4><ol>${(r.answer?.actions ?? []).map((a: any) =>
    `<li><span class=k>${esc(a.kind)}</span> <b>${esc(a.title)}</b><div class=t>${a.threadIds.map((x: string) => esc(`${x} ${title(x)}`)).join("<br>")}</div><div class=r>${esc(a.reason)}</div><div class=p>prompt: ${esc(a.prompt === undefined ? "(omitted → null)" : JSON.stringify(a.prompt))}</div></li>`).join("")}</ol>${r.error ? `<p class=e>${esc(r.error.slice(0, 160))}</p>` : ""}</div>`;
};
const sides = inputs.map((inp: any) => {
  const cards = ["haiku", "apple"].flatMap((m) => results.filter((r: any) => r.model === m && r.input === inp.name).toSorted((a: any, b: any) => a.round - b.round));
  return `<details open><summary>${inp.name}: ${inp.threads.length} threads</summary><div class=grid>${cards.map((r: any) => card(r, inp)).join("")}</div></details>`;
}).join("");

writeFileSync(join(dir, "report-apple.html"), `<!doctype html><html><head><meta charset=utf-8><title>Apple model bench</title></head><body><style>
body{font:13px var(--font-sans, system-ui)} table{border-collapse:collapse;margin-bottom:12px} td,th{border:1px solid var(--border, #ccc);padding:3px 6px;text-align:left;vertical-align:top}
.grid{display:grid;gap:8px;grid-template-columns:repeat(3,1fr)} .col{background:var(--card, #f4f4f4);border-radius:var(--radius, 6px);padding:8px;min-width:0} h4{margin:0 0 4px}
ol{padding-left:18px;margin:0} li{margin-bottom:6px} .k{font:11px var(--font-mono, monospace);color:var(--info, #06c)} .t,.p{font-size:11px;color:var(--muted-foreground, #666)} .r{font-size:12px} .e{color:var(--destructive, #c00)}
summary{font-weight:600;margin:8px 0;cursor:pointer}</style>
<h3>Summary (all rounds)</h3>
<table><tr><th>model</th><th>valid, all</th><th>valid, n2–n10</th><th>overflow</th><th>invented refs</th><th>refs in title/reason</th><th>"null" string prompt</th><th>empty briefs</th><th>warm median s</th><th>first call s</th></tr>${summary}</table>
<h3>Apple per input</h3>
<table><tr><th>input</th><th>digest tokens</th><th>input total (guide+schema+digest)</th><th>brief tokens</th><th>left of 4096</th><th>valid</th><th>Apple s (r0/r1/r2)</th><th>others warm median s</th></tr>${tokens}</table>
<p>Rows: Haiku rounds 0–2, then Apple rounds 0–2. Thread titles shown for each ref.</p>${sides}`);
console.log(join(dir, "report-apple.html"));
