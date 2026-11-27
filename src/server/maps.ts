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
  /** The candidate top-level threads. */
  ids: string[];
  spawnerOf: (id: string) => string | null | undefined;
  /** The id is in the thread table, archived and deleted rows included. A chain stops before an unknown id. Default: all. */
  known?: (id: string) => boolean;
  /** A step thread: never a member or a root, and a chain stops before it. */
  isStep: (id: string) => boolean;
  /** The own map key of a thread, null when it has none. */
  keyOf: (id: string) => string | null;
  /** A string that orders threads by creation. */
  createdKey: (id: string) => string;
  /** The PR stacks of the candidates, each lowest first. */
  stacks?: string[][];
  /** The thread has an Issue key. */
  issueKeyOf?: (id: string) => boolean;
};

/**
 * The lineage groups of the candidate threads. `ancestors`: the spawner chain inside the lineage, nearest first.
 * `rootOf`: the topmost thread of the chain, null for a step thread. `groups`: each root with its members, the
 * candidates below it. `mates`: stack mates and the root they join. `mapOf`: the own key of a thread, else the key of
 * its nearest keyed ancestor. `threadOf`: the map thread of a key in the lineage of a root, undefined when the
 * topmost keyed thread is the root. `anchors`: the keys that a thread is the map thread of, in map order.
 */
export function mapsOf({
  ids,
  spawnerOf,
  known = () => true,
  isStep,
  keyOf,
  createdKey,
  stacks = [],
  issueKeyOf = () => false,
}: MapsInput) {
  const keys = new Map<string, string | null>();
  const key = (id: string) => {
    if (!keys.has(id)) keys.set(id, keyOf(id));
    return keys.get(id)!;
  };
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    if (isStep(id)) return out;
    const seen = new Set([id]);
    for (let c = spawnerOf(id); c && !seen.has(c) && known(c) && !isStep(c); c = spawnerOf(c)) {
      out.push(c);
      seen.add(c);
    }
    return out;
  };
  const rootOf = (id: string): string | null => (isStep(id) ? null : (ancestors(id).at(-1) ?? id));
  const mapOf = (id: string): string | null =>
    isStep(id)
      ? null
      : (key(id) ??
        ancestors(id)
          .map(key)
          .find((k) => k) ??
        null);
  const byCreated = (a: string, b: string) => createdKey(a).localeCompare(createdKey(b));

  const candidates = ids.filter((id) => !isStep(id));
  const groups = new Map<string, string[]>();
  for (const id of candidates.toSorted(byCreated)) {
    const root = rootOf(id)!;
    if (root !== id) groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  const pool = new Set(candidates.flatMap((id) => [id, ...ancestors(id)]));
  const threadByRoot = new Map<string, Map<string, string>>();
  const anchors = new Map<string, string[]>();
  const topmost = [...pool]
    .filter((id) => key(id) && ancestors(id).length > 0 && !ancestors(id).some((a) => key(a) === key(id)))
    .toSorted(byCreated);
  for (const id of topmost) {
    const root = rootOf(id)!;
    const k = key(id);
    if (threadByRoot.get(root)?.has(k)) continue;
    const thread = ancestors(id)[0];
    threadByRoot.set(root, (threadByRoot.get(root) ?? new Map()).set(k, thread));
    anchors.set(thread, [...(anchors.get(thread) ?? []), k]);
  }
  const threadOf = (root: string, k: string) => threadByRoot.get(root)?.get(k);

  const spawners = new Set(candidates.flatMap(ancestors));
  const mates = new Map<string, string>();
  for (const stack of stacks) {
    const low = stack.find((id) => rootOf(id) !== null && rootOf(id) !== id);
    if (!low) continue;
    for (const id of stack) {
      if (rootOf(id) === id && !issueKeyOf(id) && !spawners.has(id)) mates.set(id, rootOf(low)!);
    }
  }
  return { ancestors, rootOf, groups, mates, mapOf, threadOf, anchors };
}

/** The readable name of a folder: `workflow-runs-tree` gives "Workflow runs tree". */
const readable = (s: string) => {
  const w = s.replace(/^\.+/, "").replace(/[-_]+/g, " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/**
 * The display name of a map. `title` is the title of its map thread when that thread anchors this map only, else null.
 * `keys` are the keys of all visible maps: a folder name that two of them share gets its parent folder.
 */
export function mapName(key: string, title: string | null, keys: string[]): string {
  const named = title?.replace(/\s*[:-]?\s*wayfinder\s*[:-]?\s*/i, " ").trim();
  if (named) return named;
  if (/^https?:\/\//.test(key)) {
    const last = key.split("/").at(-1)!;
    return /^\d+$/.test(last) ? `#${last}` : last;
  }
  const parts = key.split("/");
  const base = parts.at(-1)!;
  return keys.some((k) => k !== key && k.split("/").at(-1) === base) ? parts.slice(-2).join("/") : readable(base);
}
