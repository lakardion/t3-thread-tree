import { useEffect, useState } from "react";

import { RULES, type RuleId } from "../shared/rules.ts";

/** `localStorage` access that never throws: a blocked store reads as empty and drops writes. */
export const load = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
export const forget = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {}
};

/** How a pref reads from and writes to its stored text. `parse` gets `null` when nothing is stored. */
export type Codec<T> = { parse: (raw: string | null) => T; format: (v: T) => string };

/** A switch stored as "1" or "0". Any other text reads as the opposite of `on`. */
export const flag = (on: boolean): Codec<boolean> => ({
  parse: (raw) => (on ? raw !== "0" : raw === "1"),
  format: (v) => (v ? "1" : "0"),
});

/** One of `values`, stored as is; any other text reads as `fallback`. */
export const oneOf = <T extends string>(values: readonly T[], fallback: T): Codec<T> => ({
  parse: (raw) => values.find((v) => v === raw) ?? fallback,
  format: (v) => v,
});

/** A set of ids, stored as a JSON array. Bad JSON reads as `fallback`. */
export const idSet = (fallback: string[] = []): Codec<Set<string>> => ({
  parse: (raw) => {
    try {
      const v: unknown = JSON.parse(raw ?? "null");
      return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : fallback);
    } catch {
      return new Set(fallback);
    }
  },
  format: (v) => JSON.stringify([...v]),
});

export type Rule = { id: RuleId; on: boolean };

/** The placement rules in chain order, stored as a JSON array. Unknown ids drop and missing ids go last. A stored `map` reads as `lineage`; `lineage` is on when a stored `map` or `nest` was on. `lineage` goes first. */
export const ruleList = (): Codec<Rule[]> => ({
  parse: (raw) => {
    const defaults = RULES.map((r): Rule => ({ id: r.id, on: r.on }));
    let stored: unknown;
    try {
      stored = JSON.parse(raw ?? "null");
    } catch {
      return defaults;
    }
    if (!Array.isArray(stored)) return defaults;
    const entries = (stored as Partial<Rule>[]).filter((d) => d && typeof d === "object");
    const legacy = entries.filter((d) => (d.id as string) === "map" || (d.id as string) === "nest");
    const rules: Rule[] = [];
    for (const d of entries) {
      const id = (d.id as string) === "map" ? "lineage" : d.id;
      const fallback = defaults.find((r) => r.id === id);
      if (fallback && !rules.some((r) => r.id === id))
        rules.push({ id: fallback.id, on: typeof d.on === "boolean" ? d.on : fallback.on });
    }
    for (const d of defaults) if (!rules.some((r) => r.id === d.id)) rules.push(d);
    const lineage = rules.find((r) => r.id === "lineage")!;
    const flags = legacy.filter((d) => typeof d.on === "boolean");
    if (flags.length) lineage.on = flags.some((d) => d.on);
    return [lineage, ...rules.filter((r) => r.id !== "lineage")];
  },
  format: (v) => JSON.stringify(v),
});

/** The `rules` stream parameter: the ids that are on, in chain order. */
export const rulesParam = (rules: Rule[]): string =>
  rules
    .filter((r) => r.on)
    .map((r) => r.id)
    .join(",");

/** A `useState` that starts from the stored value of `key` and stores each change. The first `codec` stays. */
export function usePref<T>(key: string, codec: Codec<T>) {
  const [{ format }] = useState(codec);
  const [value, set] = useState(() => codec.parse(load(key)));
  useEffect(() => save(key, format(value)), [key, value, format]);
  return [value, set] as const;
}
