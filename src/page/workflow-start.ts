/** The pure rules of Start workflow: which workflow fits a start point, the start key context and the payload. */
import type { PrNode } from "../shared/tree.ts";
import type { Field, Workflow } from "../shared/workflow-start.ts";

/** A PR as a start point offers it: `repo` is `owner/name`. */
export type PrChoice = { repo: string; n: number; title: string | null };

/** Where a start comes from. `none` is Find, which fills nothing. */
export type StartPoint =
  | { kind: "none" }
  | { kind: "row"; threadId: string; prs: PrChoice[] }
  | { kind: "stack"; repo: string; prs: number[] }
  | { kind: "threads"; ids: string[] };

/** The field values as the dialog shows them: text, not yet parsed. */
export type Values = Partial<Record<Field, string>>;

export const prText = (c: Pick<PrChoice, "repo" | "n">) => `${c.repo}#${c.n}`;

/** The repo and number of a PR, read from its URL. Null when the URL is not a pull request URL. */
export const prOf = (p: PrNode): PrChoice | null => {
  const m = /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+/.exec(p.url);
  return m ? { repo: m[1], n: p.n, title: p.title } : null;
};

/** The PRs of a row, open ones first, newest first. */
export const prChoices = (prs: PrNode[]): PrChoice[] =>
  prs
    .toSorted((a, b) => Number(b.state === "open") - Number(a.state === "open") || b.n - a.n)
    .flatMap((p) => prOf(p) ?? []);

/** The stack start point of a PR stack, with its PRs bottom first. Null when no PR has a readable URL. */
export const stackPoint = (prs: PrNode[]): StartPoint | null => {
  const found = prs.flatMap((p) => prOf(p) ?? []);
  return found.length > 0 ? { kind: "stack", repo: found[0].repo, prs: found.map((c) => c.n) } : null;
};

const has = (w: Workflow, f: Field) => w.fields?.includes(f) ?? false;

/** True when the workflow can start from the point. A workflow with unscanned fields fits only `none`. */
export const fits = (w: Workflow, p: StartPoint): boolean => {
  switch (p.kind) {
    case "none":
      return !w.webhookOnly;
    case "row":
      return has(w, "threadId") || (has(w, "pr") && p.prs.length > 0);
    case "stack":
      return has(w, "stack");
    case "threads":
      return has(w, "threadIds");
  }
};

const slug = (repo: string) => repo.replace("/", "-");

/** The context part of the start key. It names the PR or the stack of the `payload` that is sent. */
export const contextOf = (p: StartPoint, w: Workflow, payload: Record<string, unknown> = {}): string => {
  /** A hand-edited payload can hold any shape. */
  const pr = payload.pr as { repo?: unknown; number?: unknown } | undefined;
  const stack = payload.stack as { repo?: unknown; prs?: unknown } | undefined;
  const prName =
    typeof pr?.repo === "string" && typeof pr.number === "number" ? `pr-${slug(pr.repo)}-${pr.number}` : null;
  const stackName =
    typeof stack?.repo === "string" && Array.isArray(stack.prs) && typeof stack.prs[0] === "number"
      ? `stack-${slug(stack.repo)}-${stack.prs[0]}`
      : null;
  switch (p.kind) {
    case "none":
      return "none";
    case "row":
      if (!has(w, "pr")) return `thread-${p.threadId}`;
      return prName ?? (p.prs[0] ? `pr-${slug(p.prs[0].repo)}-${p.prs[0].n}` : `thread-${p.threadId}`);
    case "stack":
      return stackName ?? `stack-${slug(p.repo)}-${p.prs[0]}`;
    case "threads":
      return `threads-${p.ids.length}`;
  }
};

/** The values that a start point fills. `project` is the T3 project path, when the point has one. */
export const fillOf = (p: StartPoint, project?: string): Values => {
  const fill: Values = project ? { project } : {};
  switch (p.kind) {
    case "row":
      return { ...fill, threadId: p.threadId, ...(p.prs[0] && { pr: prText(p.prs[0]) }) };
    case "stack":
      return { ...fill, stack: `${p.repo} ${p.prs.map((n) => `#${n}`).join(" ")}` };
    case "threads":
      return { ...fill, threadIds: p.ids.join(", ") };
    case "none":
      return fill;
  }
};

const REPO = "[\\w.-]+/[\\w.-]+";
const PR = new RegExp(`^(${REPO})#(\\d+)$`);
const STACK = new RegExp(`^(${REPO})((?:\\s+#?\\d+)+)$`);

export type Payload =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; errors: Partial<Record<Field, string>> };

/** The payload of the fields: an empty field is left out, `pr`, `stack` and `threadIds` are parsed. */
export function payloadOf(fields: readonly Field[], values: Values): Payload {
  const payload: Record<string, unknown> = {};
  const errors: Partial<Record<Field, string>> = {};
  for (const f of fields) {
    const v = (values[f] ?? "").trim();
    if (!v) continue;
    if (f === "pr") {
      const m = PR.exec(v);
      if (m) payload.pr = { repo: m[1], number: Number(m[2]) };
      else errors.pr = "Write the PR as owner/name#123.";
    } else if (f === "stack") {
      const m = STACK.exec(v);
      if (m) payload.stack = { repo: m[1], prs: m[2].match(/\d+/g)!.map(Number) };
      else errors.stack = "Write the stack as owner/name #1 #2, bottom PR first.";
    } else if (f === "threadIds") payload.threadIds = v.split(/[\s,]+/).filter(Boolean);
    else payload[f] = v;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload };
}
