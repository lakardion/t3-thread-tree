import type { ThreadNode } from "../shared/tree.ts";

/** "now" below 1 minute, then "12m", "3h", "2d". */
export function ago(iso: string, now: number): string {
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** The phrase with its elapsed time: "Working 12m", "Approval · 3m". */
export function phraseWith(t: Pick<ThreadNode, "status" | "phrase" | "since">, now: number): string {
  if (!t.since) return t.phrase;
  return `${t.phrase}${t.status === "needs-input" ? " ·" : ""} ${ago(t.since, now)}`;
}
