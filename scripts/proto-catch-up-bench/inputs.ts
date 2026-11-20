/** PROTOTYPE, throwaway: builds 15 Catch-up inputs the way catch-up.ts does. Reads the tree from the local thread-tree server files and T3 sqlite read-only. */
import { readFileSync, writeFileSync } from "node:fs";

import { digestOf } from "../../src/server/last-message.ts";
import { openLineage } from "../../src/server/lineage.ts";
import type { ThreadNode } from "../../src/shared/tree.ts";

const DIR = `${process.env.HOME}/.local/share/proto-apple-catch-up`;
const WAITING = new Set(["needs-input", "plan-ready", "your-turn", "failed"]);
const tree = JSON.parse(readFileSync(`${DIR}/tree.json`, "utf8"));
const settled = JSON.parse(readFileSync(`${DIR}/settled.json`, "utf8"));

const nodes: ThreadNode[] = [];
const walk = (b: { threads?: ThreadNode[]; branches?: unknown[] }) => {
  for (const t of b.threads ?? []) (nodes.push(t), walk({ threads: t.children }));
  for (const c of b.branches ?? []) walk(c as typeof b);
};
for (const p of tree.projects) walk(p);
for (const i of settled.items) nodes.push(i.t);

const pool = [...new Map(nodes.filter((n) => n.status !== "snoozed").map((n) => [n.id, n])).values()];
const msgs = openLineage().lastMessages(pool.map((n) => n.id));
const recent = pool
  .filter((n) => msgs.get(n.id))
  .toSorted((a, b) => ((b.lastRun ?? b.updatedAt) < (a.lastRun ?? a.updatedAt) ? -1 : 1));
const pick = recent.slice(0, 12);
pick.push(...recent.filter((n) => !pick.includes(n) && msgs.get(n.id)!.length > 4000).slice(0, 3));

const now = Date.now();
const out = pick.map((n) => {
  /** A thread that waits no more is shown as it was while it waited. */
  const w = WAITING.has(n.status) ? n : { ...n, status: "your-turn" as const, phrase: "Your turn", since: n.lastRun ?? n.updatedAt };
  const text = msgs.get(n.id)!;
  return { id: n.id, status: n.status, msgLen: text.length, input: digestOf(w, "", text, now, 4000) };
});
writeFileSync(`${DIR}/inputs.json`, JSON.stringify(out, null, 2));
console.log(out.map((o) => `${o.status}\t${o.msgLen}\t${o.input.length}`).join("\n"));
