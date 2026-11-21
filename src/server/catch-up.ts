/** The Catch-up service: one cached model read per waiting thread, started after a debounce and run through a capped queue. */
import * as v from "valibot";

import type { ModelPick } from "../shared/model.ts";
import { bySince, type CatchUp, type ThreadNode } from "../shared/tree.ts";
import guideText from "./catch-up-prompt.md" with { type: "text" };
import { digestOf, questionOf, tailOf } from "./last-message.ts";
import type { Models, PickSettings } from "./model.ts";

const TAIL = 4000;
const WAITING = new Set(["needs-input", "plan-ready", "your-turn", "failed"]);

/** Strict: Codex `--output-schema` needs every property required and no extra properties. */
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["did", "ask", "options", "doneLike"],
  properties: {
    did: { type: "string" },
    ask: { type: ["string", "null"] },
    options: { type: "array", items: { type: "string" } },
    doneLike: { type: "boolean" },
  },
};

const AnswerSchema = v.object({
  did: v.string(),
  ask: v.nullable(v.string()),
  options: v.array(v.string()),
  doneLike: v.boolean(),
});

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** A small model may write `"null"` or `""` in place of a real `null`. */
const nullish = (s: string) => /^(null)?$/i.test(s.trim());

/** The validated answer with its cuts applied, or `null` when the shape is wrong. */
export function parseAnswer(answer: unknown): Required<Pick<CatchUp, "did" | "ask" | "options" | "doneLike">> | null {
  const r = v.safeParse(AnswerSchema, answer);
  if (!r.success) return null;
  const { did, ask, options, doneLike } = r.output;
  return {
    did: cut(did, 140),
    ask: ask === null || nullish(ask) ? null : cut(ask, 120),
    options: options
      .filter((o) => !nullish(o))
      .slice(0, 4)
      .map((o) => cut(o, 60)),
    doneLike,
  };
}

/** The threads that wait on the user: not snoozed, not settled. A snoozed thread keeps its status when a request is pending. */
export const waiting = <T extends ThreadNode>(nodes: T[]): T[] =>
  nodes.filter((n) => WAITING.has(n.status) && !n.settled && !n.snoozedUntil);

/** `at` is the Wait start, or `updatedAt` when the thread has none. It orders the queue. */
type Seen = { key: string; at: string; input: string; question: string | null };
type Entry = Seen & { pick: ModelPick; run?: { cancel(): void } } & Pick<
    CatchUp,
    "state" | "did" | "ask" | "options" | "doneLike"
  >;

export function catchUpService(o: {
  run: Models["run"];
  settings: () => PickSettings;
  onChange: () => void;
  delayMs?: number;
  max?: number;
}) {
  const entries = new Map<string, Entry>();
  const timers = new Map<string, { key: string; timer: ReturnType<typeof setTimeout> }>();
  let seen = new Map<string, Seen>();

  const drop = (id: string) => {
    entries.get(id)?.run?.cancel();
    entries.delete(id);
    clearTimeout(timers.get(id)?.timer);
    timers.delete(id);
  };

  const running = () => [...entries.values()].filter((e) => e.state === "running").length;

  function pump() {
    while (running() < (o.max ?? 2)) {
      const next = [...entries.entries()]
        .filter(([, e]) => e.state === "queued")
        .toSorted(([, a], [, b]) => bySince(a.at, b.at))[0];
      if (!next) return;
      const [id, entry] = next;
      let r: ReturnType<Models["run"]>;
      try {
        r = o.run(entry.pick, { guide: guideText, input: entry.input, schema: SCHEMA });
      } catch (e) {
        entry.state = "failed";
        console.log(`thread tree: catch-up failed for ${id}: ${(e as Error).message}`);
        o.onChange();
        continue;
      }
      entry.state = "running";
      entry.run = r;
      void r.done
        .catch((e): { error: string } => ({ error: String(e?.message ?? e) }))
        .then((res) => {
          if (!res || entries.get(id) !== entry) return;
          entry.run = undefined;
          const answer = "answer" in res ? parseAnswer(res.answer) : null;
          if (answer) Object.assign(entry, answer, { state: "done" });
          else {
            entry.state = "failed";
            console.log(`thread tree: catch-up failed for ${id}: ${"error" in res ? res.error : "invalid answer"}`);
          }
          o.onChange();
          pump();
        });
    }
  }

  return {
    /** Drops what no longer waits or whose key changed, and starts a timer for each new key. */
    sync(nodes: ThreadNode[], last: (ids: string[]) => Map<string, { id: string; text: string } | null>, now: number) {
      const wait = waiting(nodes);
      const msgs = last(wait.map((n) => n.id));
      seen = new Map(
        wait.map((n) => {
          const msg = msgs.get(n.id) ?? null;
          const key = `${n.id}|${msg?.id ?? ""}|${n.status === "needs-input" ? (n.since ?? "") : ""}`;
          const question = msg?.text ? questionOf(tailOf(msg.text)) : null;
          return [
            n.id,
            { key, at: n.since ?? n.updatedAt, input: digestOf(n, "", msg?.text ?? null, now, TAIL), question },
          ];
        }),
      );
      let dropped = false;
      for (const id of new Set([...entries.keys(), ...timers.keys()])) {
        const key = entries.get(id)?.key ?? timers.get(id)!.key;
        if (seen.get(id)?.key === key) continue;
        drop(id);
        dropped = true;
      }
      if (o.settings().catchUp)
        for (const [id, s] of [...seen].toSorted(([, a], [, b]) => bySince(a.at, b.at))) {
          if (entries.has(id) || timers.has(id)) continue;
          timers.set(id, {
            key: s.key,
            timer: setTimeout(() => {
              timers.delete(id);
              const cur = seen.get(id);
              const { pick, catchUp } = o.settings();
              if (cur?.key !== s.key || entries.has(id) || !catchUp || !pick) return;
              entries.set(id, { ...cur, pick, state: "queued" });
              o.onChange();
              pump();
            }, o.delayMs ?? 5000),
          });
        }
      pump();
      if (dropped) o.onChange();
    },
    /** The entry of the thread's current key. */
    of(id: string): CatchUp | undefined {
      const e = entries.get(id);
      if (!e || seen.get(id)?.key !== e.key) return undefined;
      const { state, pick, did, ask, options, doneLike, question } = e;
      return {
        state,
        pick,
        ...(state === "done" && { did, ask, options, doneLike }),
        ...((state === "done" || state === "failed") && { question }),
      };
    },
    /** Cancels the running calls and empties the queue, the timers and the cache. */
    clear() {
      const had = entries.size > 0;
      for (const id of new Set([...entries.keys(), ...timers.keys()])) drop(id);
      if (had) o.onChange();
    },
  };
}
