export type Item = {
  n: number;
  kind: "inline" | "comment" | "review";
  /** `path:line` or `path:start-line` for an inline comment thread, else empty. */
  ref: string;
  outdated: boolean;
  /** Each comment as `<login>: <body>`, joined by blank lines. */
  body: string;
};

type Author = { login: string } | null;
type Note = { author: Author; body: string; isMinimized?: boolean };

/** The `pullRequest` node of the GraphQL answer, with the fields that `openItems` reads. */
export type GqlPull = {
  author: Author;
  reviewThreads: {
    nodes: {
      isResolved: boolean;
      isOutdated: boolean;
      path: string;
      line: number | null;
      originalLine: number | null;
      startLine: number | null;
      originalStartLine: number | null;
      comments: { nodes: Note[] };
    }[];
  };
  comments: { nodes: Note[] };
  reviews: { nodes: Note[] };
};

const line = (note: Note) => `${note.author?.login ?? "ghost"}: ${note.body}`;

/**
 * The comments that ask for a change, numbered from 1: unresolved review threads, then general comments, then review
 * summaries. A general comment or summary counts when its body is not blank, it is not minimized and its author is
 * not the PR author.
 */
export function openItems(pr: GqlPull): Item[] {
  const author = pr.author?.login;
  const threads = pr.reviewThreads.nodes
    .filter((t) => !t.isResolved && t.comments.nodes.length > 0)
    .map((t) => {
      const end = t.line ?? t.originalLine;
      const start = t.startLine ?? t.originalStartLine;
      return {
        kind: "inline" as const,
        ref: `${t.path}:${start !== null && start !== end ? `${start}-${end}` : end}`,
        outdated: t.isOutdated,
        body: t.comments.nodes.map(line).join("\n\n"),
      };
    });
  const notes = (kind: "comment" | "review", list: Note[]) =>
    list
      .filter((c) => c.body.trim() !== "" && !c.isMinimized && c.author?.login !== author)
      .map((c) => ({ kind, ref: "", outdated: false, body: line(c) }));
  return [...threads, ...notes("comment", pr.comments.nodes), ...notes("review", pr.reviews.nodes)].map((item, i) => ({
    ...item,
    n: i + 1,
  }));
}

/** The list for a brief or a question: a header line and the verbatim body for each item. */
export function itemsMarkdown(items: readonly Item[]): string {
  return items
    .map(
      (i) =>
        `[${i.n}] ${i.kind}${i.ref ? ` ${i.ref}` : ""}${i.outdated ? " (outdated: the code moved)" : ""}\n${i.body}`,
    )
    .join("\n\n");
}

/**
 * The NEEDS_DECISION entries with their items, in item order. The first entry of a number wins. An entry for a number
 * that was not fetched is dropped.
 */
export function decisionsOf<V extends { n: number; verdict: string }>(
  items: readonly Item[],
  verdicts: readonly V[],
): { item: Item; verdict: V }[] {
  const out: { item: Item; verdict: V }[] = [];
  for (const item of items) {
    const found = verdicts.find((v) => v.n === item.n);
    if (found?.verdict === "NEEDS_DECISION") out.push({ item, verdict: found });
  }
  return out;
}

/** A label as a choice: trimmed and cut to 80 characters. */
export const labelOf = (label: string) => label.trim().slice(0, 80);

/** The labels cut to 80 characters, without blank, `skip` and repeated ones, then `skip` last. */
export function choicesOf(options: readonly { label: string }[]): string[] {
  const labels = options.map((o) => labelOf(o.label)).filter((l) => l !== "" && l !== "skip");
  return [...new Set(labels), "skip"];
}
