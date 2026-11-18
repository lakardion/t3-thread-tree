/** PR labels from T3, one `pullRequests.detail` call per snapshot change. Holds state but no socket: the call is injected. */
import type { Label } from "../shared/tree.ts";
import type { Pr, Thread } from "./t3.ts";

type Ref = { projectId: string; host: string; repository: string; number: number };
type Answer = { labels: Label[]; updatedAt: string };
type Item = { key: string; retry: boolean };

const MAX_CALLS = 4;
const STALE_RETRY_MS = 60_000;

const keyOf = (p: Pr) => `${p.host} ${p.repository} ${p.n}`;
/** Epoch ms; an empty time sorts before any real one. */
const time = (s: string) => (s ? Date.parse(s) : -Infinity);

export function labelStore(opts: {
  /** Resolves `"dropped"` for a call lost to a socket close; rejects for a failed call. */
  detail: (ref: Ref) => Promise<Answer | "dropped">;
  onChange: () => void;
  later?: (fn: () => void, ms: number) => unknown;
}) {
  const later = opts.later ?? setTimeout;
  const labels = new Map<string, Label[]>();
  /** Snapshot `updatedAt` of the last answer, also a failed one. */
  const seen = new Map<string, string>();
  let latest = new Map<string, { ref: Ref; updatedAt: string }>();
  const inFlight = new Set<string>();
  const queue: Item[] = [];
  let active = false;

  const enqueue = (key: string, retry = false) => {
    if (inFlight.has(key)) return;
    const queued = queue.find((q) => q.key === key);
    if (!queued) queue.push({ key, retry });
    else if (!retry) queued.retry = false;
  };

  const canStart = () => active && inFlight.size < MAX_CALLS && queue.length > 0;

  const pump = () => {
    while (canStart()) {
      const { key, retry } = queue.shift()!;
      const entry = latest.get(key);
      if (!entry) continue;
      const started = entry.updatedAt;
      inFlight.add(key);
      opts.detail(entry.ref).then(
        (res) => done(key, started, retry, res),
        () => done(key, started, retry, null),
      );
    }
  };

  const done = (key: string, started: string, retry: boolean, res: Answer | "dropped" | null) => {
    inFlight.delete(key);
    if (res !== "dropped") {
      seen.set(key, started);
      if (res) {
        if (JSON.stringify(res.labels) !== JSON.stringify(labels.get(key) ?? [])) {
          labels.set(key, res.labels);
          opts.onChange();
        }
        if (!retry && time(res.updatedAt) < time(started))
          later(() => {
            enqueue(key, true);
            pump();
          }, STALE_RETRY_MS);
      }
      if (latest.has(key) && latest.get(key)!.updatedAt !== started) enqueue(key);
    }
    pump();
  };

  return {
    sync(threads: Iterable<Thread>, on: boolean) {
      active = on;
      latest = new Map();
      for (const t of threads) {
        if (t.parentThreadId || t.sideChat || t.gone || t.settledAt) continue;
        for (const p of t.prs) {
          if (!p.host || !p.repository || p.state !== "open" || p.source === "stack" || p.source === "stack-dismissed")
            continue;
          const key = keyOf(p);
          const prev = latest.get(key);
          if (!prev || time(p.updatedAt) > time(prev.updatedAt))
            latest.set(key, {
              ref: { projectId: t.projectId, host: p.host, repository: p.repository, number: p.n },
              updatedAt: p.updatedAt,
            });
        }
      }
      if (active) for (const [key, { updatedAt }] of latest) if (seen.get(key) !== updatedAt) enqueue(key);
      pump();
    },
    labelsOf: (p: Pr): Label[] | undefined => labels.get(keyOf(p)),
  };
}
