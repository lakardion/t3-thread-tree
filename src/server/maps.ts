/** Wayfinder maps: the map key of a thread, which threads belong to a map, and the name of a map. Pure, so `bun test` covers it. */
import { dirname, join, normalize } from "node:path";

const SKILL = "wayfinder(?:-implement)?";
/** The text after the skill name, for each of the four call forms. */
const CALLS = [
  new RegExp(`^[/$]${SKILL}(?=\\s|$)([\\s\\S]*)`),
  new RegExp(`^Invoke the ${SKILL} skill with arguments:([\\s\\S]*)`),
  new RegExp(`<command-name>/${SKILL}</command-name>[\\s\\S]*?<command-args>([\\s\\S]*)`),
];

/**
 * The map key in the first message of a thread: the folder of a `map.md`, or an issue URL. Null when the message is
 * no wayfinder call or its first token names no map.
 */
export function mapKey(text: string, projectPath: string | undefined, home: string): string | null {
  const rest = CALLS.map((re) => text.trim().match(re)?.[1]).find((r) => r !== undefined);
  const token = rest
    ?.trim()
    .split(/\s+/)[0]
    ?.replace(/<\/command-args>$/, "");
  if (!token) return null;
  if (/^https?:\/\//.test(token)) return token.split(/[?#]/)[0];
  if (!token.endsWith("map.md")) return null;
  if (/^(\.\/)?\.wayfinder\//.test(token)) return projectPath ? dirname(join(projectPath, token)) : null;
  if (token.startsWith("~")) return dirname(normalize(home + token.slice(1)));
  return dirname(normalize(token.startsWith("/") ? token : join(home, "repos", "wiki", token)));
}

export type MapsInput = {
  /** The visible threads. */
  ids: string[];
  spawnerOf: (id: string) => string | null | undefined;
  /** The map key of a thread, null when it has none or may not be a member. */
  keyOf: (id: string) => string | null;
  /** A string that orders threads by creation. */
  createdKey: (id: string) => string;
};

/**
 * The maps of the visible threads and their spawner chains. `mapOf`: the own key of a thread, else the key of its
 * nearest keyed ancestor. `threadOf`: the map thread of each key, the spawner of its earliest topmost keyed thread
 * that has one. `anchors`: the keys that a thread is the map thread of, in map order. `ancestors`: the spawner chain
 * of a thread, nearest first.
 */
export function mapsOf({ ids, spawnerOf, keyOf, createdKey }: MapsInput) {
  const keys = new Map<string, string | null>();
  const key = (id: string) => {
    if (!keys.has(id)) keys.set(id, keyOf(id));
    return keys.get(id)!;
  };
  const chain = (id: string): string[] => {
    const out: string[] = [];
    const seen = new Set([id]);
    for (let c = spawnerOf(id); c && !seen.has(c); c = spawnerOf(c)) {
      out.push(c);
      seen.add(c);
    }
    return out;
  };
  const mapOf = (id: string): string | null =>
    key(id) ??
    chain(id)
      .map(key)
      .find((k) => k) ??
    null;

  const pool = new Set(ids.flatMap((id) => [id, ...chain(id)]));
  const topmost = new Map<string, string[]>();
  for (const id of pool) {
    const k = key(id);
    if (k && !chain(id).some((a) => key(a) === k)) topmost.set(k, [...(topmost.get(k) ?? []), id]);
  }
  const threadOf = new Map<string, string>();
  const anchors = new Map<string, string[]>();
  for (const [k, tops] of topmost) {
    const spawned = tops.filter((id) => spawnerOf(id)).toSorted((a, b) => createdKey(a).localeCompare(createdKey(b)));
    const thread = spawned[0] && spawnerOf(spawned[0]);
    if (!thread) continue;
    threadOf.set(k, thread);
    anchors.set(thread, [...(anchors.get(thread) ?? []), k]);
  }
  return { mapOf, threadOf, anchors, ancestors: chain };
}

/**
 * `keyOf` with the synthetic key `thread:<spawner>` for a thread that has no own key and whose spawner is in `marked`.
 */
export const markedKey =
  (keyOf: (id: string) => string | null, spawnerOf: (id: string) => string | null | undefined, marked: Set<string>) =>
  (id: string): string | null => {
    const spawner = spawnerOf(id);
    return keyOf(id) ?? (spawner && marked.has(spawner) ? `thread:${spawner}` : null);
  };

/** The readable name of a folder: `workflow-runs-tree` gives "Workflow runs tree". */
const readable = (s: string) => {
  const w = s.replace(/^\.+/, "").replace(/[-_]+/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/**
 * The display name of a map. `title` is the title of its map thread when that thread anchors this map only, else null.
 * For a `thread:` key it is the title of the marked thread.
 * `keys` are the keys of all visible maps: a folder name that two of them share gets its parent folder.
 */
export function mapName(key: string, title: string | null, keys: string[]): string {
  const named = title?.replace(/\s*[:-]?\s*wayfinder\s*[:-]?\s*/i, " ").trim();
  if (named) return named;
  if (key.startsWith("thread:")) return key.slice(7);
  if (/^https?:\/\//.test(key)) {
    const last = key.split("/").at(-1)!;
    return /^\d+$/.test(last) ? `#${last}` : last;
  }
  const parts = key.split("/");
  const base = parts.at(-1)!;
  return keys.some((k) => k !== key && k.split("/").at(-1) === base) ? parts.slice(-2).join("/") : readable(base);
}
