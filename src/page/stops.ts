/** The visible stops of a list in DOM order. A row that is inert or in closing content is not a stop. */
export function stopsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-stop]")].filter(
    (el) => !el.closest("[inert], [data-slot=collapsible-content][data-state=closed]") && el.checkVisibility(),
  );
}

/** The index after a move of `dir`, or null at an end. */
export function nextStop(len: number, at: number, dir: 1 | -1): number | null {
  const n = at + dir;
  return n < 0 || n >= len ? null : n;
}

/** The index to focus once the last stop left: the same id nearest its old index, else the old index, else -1. */
export function refocusIndex(ids: string[], last: { id: string; index: number }): number {
  let best = -1;
  ids.forEach((id, i) => {
    if (id === last.id && (best < 0 || Math.abs(i - last.index) < Math.abs(best - last.index))) best = i;
  });
  return best >= 0 ? best : Math.min(last.index, ids.length - 1);
}
