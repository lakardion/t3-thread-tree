/** Last-message text of a thread: the tail, the digest and the question of a message. */
import { ago, phraseWith, stripKey } from "../page/format.ts";
import type { ThreadNode } from "../shared/tree.ts";

const MSG_TAIL = 600;

/** The last `max` characters of a message, with a leading `…` when it was cut. */
export const tailOf = (message: string, max = MSG_TAIL) => (message.length > max ? `…${message.slice(-max)}` : message);

/** `GET /t3/last-message?id=`: the tail of a thread's last message. The id is a query value because ids hold `:`. */
export function lastMessageRoutes(o: { read: (id: string) => string | null; has: (id: string) => boolean }) {
  return {
    "/t3/last-message": {
      GET: (req: Request) => {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return new Response("Missing id.", { status: 400 });
        if (!o.has(id)) return new Response("Unknown thread.", { status: 404 });
        const message = o.read(id);
        return Response.json({ text: message ? tailOf(message) : null });
      },
    },
  };
}

/** One thread as text: a line of facts, then the indented `tail` characters of the last assistant message. */
export function digestOf(n: ThreadNode, ref: string, message: string | null, now: number, tail = MSG_TAIL): string {
  const prs = n.prs.map((p) =>
    [`#${p.n}`, p.state !== "open" && p.state, p.draft && "draft", p.review, p.checks, p.conflicting && "conflicting"]
      .filter(Boolean)
      .join(" "),
  );
  const line = [
    ref,
    phraseWith(n, now) + (n.since ? "" : ` ${ago(n.updatedAt, now)}`),
    n.key ? `${n.key} ${stripKey(n.title, n.key)}` : n.title,
    prs.length && `PRs (${prs.join(", ")})`,
    n.stack && (n.stack.pos === null ? `stack of ${n.stack.total}` : `stack ${n.stack.pos}/${n.stack.total}`),
    n.detail.request && `request: ${n.detail.request}`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (!message) return line;
  return `${line}\n${tailOf(message, tail).replace(/^/gm, "  ")}`;
}

const QUESTION_MAX = 140;

/** The last question of a message, else its last sentence or line, cut at `QUESTION_MAX`. `null` when the message has no text. */
export function questionOf(message: string): string | null {
  const parts = message
    .replace(/^…/, "")
    .split(/(?<=[.?!])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const hit = parts.findLast((x) => /\?[*_"'`)\]]*$/.test(x)) ?? parts.at(-1);
  if (!hit) return null;
  return hit.length > QUESTION_MAX ? `${hit.slice(0, QUESTION_MAX - 1).trimEnd()}…` : hit;
}
