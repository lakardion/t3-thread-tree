import type { Branch, ThreadNode } from "./tree.ts";

/** A thread with the context that Find shows and matches. `parent` is the title of the parent thread of a subthread. */
export type Hit = { t: ThreadNode; project: string; parent: string | null };

/** A Map header is not a hit, and its members keep the parent of the header. */
const withChildren = (t: ThreadNode, project: string, parent: string | null): Hit[] => [
  ...(t.map?.header ? [] : [{ t, project: t.t3Project?.label ?? project, parent }]),
  ...t.children.flatMap((c) => withChildren(c, project, t.map?.header ? parent : t.title || t.id)),
];

const inBranch = (b: Branch, project: string): Hit[] => [
  ...b.branches.flatMap((c) => inBranch(c, project)),
  ...b.threads.flatMap((t) => withChildren(t, project, null)),
];

/** Every thread of the projects in tree order, subthreads included. */
export const hits = (projects: Branch[]): Hit[] => projects.flatMap((p) => inBranch(p, p.label));

/** Whether `i` in `s` starts the text or follows a character that is not a letter or a digit. */
const startsWord = (s: string, i: number): boolean => i === 0 || !/[\p{L}\p{N}]/u.test(s[i - 1]);

/** 0 when `w` is in the issue key or starts the title or a title word, else 1. */
function rank(h: Hit, w: string): number {
  if (h.t.key?.toLowerCase().includes(w)) return 0;
  const title = h.t.title.toLowerCase();
  for (let i = title.indexOf(w); i >= 0; i = title.indexOf(w, i + 1)) if (startsWord(title, i)) return 0;
  return 1;
}

/**
 * The hits that match `q`, best first. `q` splits on spaces, and every word must be in one field, case-insensitive:
 * title, issue key, project, branch, or the PR numbers as `#123 #456`. A word that matches the issue key or the start
 * of the title or of a title word ranks before one that matches inside a word or in another field. Ties keep the
 * input order. An empty query matches nothing.
 */
export function find(list: Hit[], q: string): Hit[] {
  const words = q.toLowerCase().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const scored = list.flatMap((h) => {
    const fields = [h.t.title, h.t.key, h.project, h.t.detail.branch, h.t.prs.map((p) => `#${p.n}`).join(" ")].map(
      (f) => (f ?? "").toLowerCase(),
    );
    return words.every((w) => fields.some((f) => f.includes(w)))
      ? [{ h, score: words.reduce((n, w) => n + rank(h, w), 0) }]
      : [];
  });
  return scored.toSorted((a, b) => a.score - b.score).map((s) => s.h);
}
