import type { Conn } from "../shared/tree.ts";

export const FOCUS_MAX = 3;
export const FOCUS_FULL = "Focus is full (3 of 3). Remove one first.";
export const FOCUS_KEY = "thread-tree:focus";
export const FOCUS_SHOW_KEY = "thread-tree:focus-show";

/** Appends `id`. No change when it is listed or the list is full. */
export const addFocus = (ids: string[], id: string): string[] =>
  ids.includes(id) || ids.length >= FOCUS_MAX ? ids : [...ids, id];

export const removeFocus = (ids: string[], id: string): string[] => ids.filter((x) => x !== id);

/** Puts `id` at `slot`. No change when `id` is listed. */
export const replaceFocus = (ids: string[], slot: number, id: string): string[] =>
  ids.includes(id) ? ids : ids.map((x, i) => (i === slot ? id : x));

/**
 * Drops the ids of deleted and settled threads. Only a live tree prunes, so a down or loading tree never clears the list.
 * Returns `ids` itself when nothing drops.
 */
export function pruneFocus(ids: string[], live: ReadonlyMap<string, { settled: boolean }>, conn: Conn): string[] {
  if (conn !== "up") return ids;
  const kept = ids.filter((id) => live.get(id)?.settled === false);
  return kept.length === ids.length ? ids : kept;
}

/**
 * What a drop of thread `id` on slot `slot` does: "add" on an empty slot, "ask" for a Replace on a filled one.
 * Null when nothing changes: the thread is unknown, settled or listed, or the slot holds a thread that is not loaded.
 */
export function focusDrop(
  ids: string[],
  live: ReadonlyMap<string, { settled: boolean }>,
  slot: number,
  id: unknown,
): "add" | "ask" | null {
  if (typeof id !== "string" || live.get(id)?.settled !== false || ids.includes(id)) return null;
  if (slot >= ids.length) return "add";
  return live.has(ids[slot]) ? "ask" : null;
}

/** The stored ids from JSON text. Anything but an array of at most three strings gives an empty list. */
export function parseFocus(raw: string | null): string[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(data) && data.length <= FOCUS_MAX && data.every((id) => typeof id === "string") ? data : [];
  } catch {
    return [];
  }
}
