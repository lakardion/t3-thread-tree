/** Linear project and milestone per issue key: when to fetch and what to keep. Holds state but no socket: the fetch is injected. */
import type { LinearIssue, LinearKeyState } from "../shared/tree.ts";
import type { LinearResult } from "./linear-api.ts";

export function linearStore(opts: {
  fetch: (apiKey: string, keys: string[]) => Promise<LinearResult>;
  onChange: () => void;
  later?: (fn: () => void, ms: number) => unknown;
  /** Ms between full refetches while a page wants data. */
  every: number;
}) {
  const later = opts.later ?? setTimeout;
  const data = new Map<string, LinearIssue>();
  /** Keys sent in some fetch, also a failed one. */
  const tried = new Set<string>();
  let keys = new Set<string>();
  let apiKey: string | undefined;
  /** Bumped on each `setKey`; an answer from an older one is dropped. */
  let generation = 0;
  let rejected = false;
  let on = false;
  let busy = false;
  let waiting = false;
  let ticking = false;
  /** The next fetch covers every key, not only untried ones. */
  let full = false;

  const state = (): LinearKeyState => (!apiKey ? "no-key" : rejected ? "rejected" : "ok");

  const pump = () => {
    if (busy || waiting || !apiKey || rejected) return;
    const list = [...keys].filter((k) => full || !tried.has(k));
    if (list.length === 0) full = false;
    if (list.length === 0 || (!full && !on)) return;
    full = false;
    for (const k of list) tried.add(k);
    busy = true;
    const g = generation;
    opts.fetch(apiKey, list).then(
      (res) => done(g, list, res),
      () => done(g, list, { status: "failed" }),
    );
  };

  const done = (g: number, list: string[], res: LinearResult) => {
    busy = false;
    if (g === generation) {
      const before = state();
      let changed = false;
      if (res.status === "ok") {
        for (const [k, issue] of res.data)
          if (JSON.stringify(issue) !== JSON.stringify(data.get(k))) {
            data.set(k, issue);
            changed = true;
          }
      } else if (res.status === "rejected") rejected = true;
      else if (res.status === "limited") {
        waiting = true;
        later(() => {
          if (g !== generation) return;
          waiting = false;
          full = true;
          pump();
        }, res.ms);
      }
      if (changed || state() !== before) opts.onChange();
    }
    pump();
  };

  const tick = () => {
    ticking = false;
    if (!on) return;
    full = true;
    arm();
    pump();
  };

  const arm = () => {
    if (ticking) return;
    ticking = true;
    later(tick, opts.every);
  };

  return {
    /** `keys` is every issue key in the tree; `wanted` is whether a page asks for Linear data. */
    sync(next: Iterable<string>, wanted: boolean) {
      keys = new Set(next);
      on = wanted;
      if (on) arm();
      pump();
    },
    /** Sets or clears the API key, and refetches every key at once. */
    setKey(next: string | undefined) {
      const before = state();
      generation++;
      apiKey = next;
      tried.clear();
      rejected = false;
      waiting = false;
      full = apiKey !== undefined;
      if (state() !== before) opts.onChange();
      pump();
    },
    of: (k: string): LinearIssue | undefined => data.get(k),
    state,
  };
}
