/** PROTOTYPE, throwaway: side-by-side HTML of one round's briefs plus timing table. `bun report.ts <dir> [round]` */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2]!;
const round = Number(process.argv[3] ?? 1);
const { inputs, results } = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
const models = [...new Set(results.map((r: any) => r.model))] as string[];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const median = (xs: number[]) => { const s = xs.toSorted((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const sec = (ms: number) => (ms / 1000).toFixed(1);

const rows = inputs.map((inp: any) => {
  const pt = results.find((r: any) => r.input === inp.name && r.model !== "haiku")?.promptTokens;
  return `<tr><td>${inp.name}</td><td>${pt ?? "?"}</td>${models.map((m) => {
    const rs = results.filter((r: any) => r.model === m && r.input === inp.name && !r.cold);
    return `<td>${rs.map((r: any) => sec(r.ms)).join(" / ")}<br><b>${sec(median(rs.map((r: any) => r.ms)))}</b></td>`;
  }).join("")}</tr>`;
}).join("");
const summary = models.map((m) => {
  const rs = results.filter((r: any) => r.model === m);
  const warm = rs.filter((r: any) => !r.cold);
  const cold = rs.find((r: any) => r.cold);
  return `<tr><td>${m}</td><td>${rs.filter((r: any) => r.valid).length}/${rs.length}</td><td>${rs.reduce((n: number, r: any) => n + r.invented.length, 0)}</td><td><b>${sec(median(warm.map((r: any) => r.ms)))}</b></td><td>${cold ? sec(cold.ms) : "-"}</td></tr>`;
}).join("");

const card = (r: any, inp: any) => {
  if (!r) return "<div class=col>-</div>";
  const title = (ref: string) => inp.threads.find((t: any) => t.ref === ref)?.title ?? `INVENTED ${ref}`;
  return `<div class=col><h4>${esc(r.model)} · ${sec(r.ms)} s</h4><ol>${(r.answer?.actions ?? []).map((a: any) =>
    `<li><span class=k>${esc(a.kind)}</span> <b>${esc(a.title)}</b><div class=t>${a.threadIds.map((x: string) => esc(`${x} ${title(x)}`)).join("<br>")}</div><div class=r>${esc(a.reason)}</div></li>`).join("")}</ol>${r.error ? `<p class=e>${esc(r.error)}</p>` : ""}</div>`;
};
const sides = inputs.map((inp: any) => `<details ${inp.name === "n15" ? "open" : ""}><summary>${inp.name}: ${inp.threads.length} threads</summary><div class=grid style="grid-template-columns:repeat(${models.length},1fr)">${models.map((m) => card(results.find((r: any) => r.model === m && r.input === inp.name && r.round === round), inp)).join("")}</div></details>`).join("");

writeFileSync(join(dir, "report.html"), `<!doctype html><html><head><meta charset=utf-8></head><body><style>
body{font:13px var(--font-sans)} table{border-collapse:collapse;margin-bottom:12px} td,th{border:1px solid var(--border);padding:3px 6px;text-align:left;vertical-align:top}
.grid{display:grid;gap:8px} .col{background:var(--card);border-radius:var(--radius);padding:8px;min-width:0} h4{margin:0 0 4px}
ol{padding-left:18px;margin:0} li{margin-bottom:6px} .k{font:11px var(--font-mono);color:var(--info)} .t{font-size:11px;color:var(--muted-foreground)} .r{font-size:12px} .e{color:var(--destructive)}
summary{font-weight:600;margin:8px 0;cursor:pointer}</style>
<table><tr><th>model</th><th>valid JSON</th><th>invented refs</th><th>warm median s</th><th>cold s</th></tr>${summary}</table>
<table><tr><th>input</th><th>prompt tokens</th>${models.map((m) => `<th>${m} warm s</th>`).join("")}</tr>${rows}</table>
<p>Briefs from round ${round}. Thread titles shown for each ref.</p>${sides}`);
console.log(join(dir, "report.html"));
