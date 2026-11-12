import type { Branch, ThreadNode } from "../shared/tree.ts";

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

/** The title without its key prefix and the separators after it. */
export function stripKey(title: string, key: string): string {
  if (!title.startsWith(key)) return title;
  return title.slice(key.length).replace(/^[\s·:-]+/, "") || title;
}

/** True for a group whose top-level threads all carry the group label as their key. "Reviews" and "No issue key" are not key groups. */
export const isKeyGroup = (b: Branch): boolean => b.threads.length > 0 && b.threads.every((t) => t.key === b.label);

/** The one thread of a key group that folds into its row, else null. */
export const folded = (b: Branch): ThreadNode | null => (isKeyGroup(b) && b.threads.length === 1 ? b.threads[0]! : null);
