/** How long Alt/Option is held alone before the key hints show. */
export const HOLD_MS = 300;

type Ev = Pick<KeyboardEvent, "key" | "repeat" | "metaKey" | "ctrlKey" | "shiftKey">;

/**
 * Shows the key hints after Alt/Option is held alone for `HOLD_MS`.
 * Any other key, Alt key up, and `hide()` cancel a pending hold or hide shown hints.
 */
export function holdRule(
  show: (on: boolean) => void,
  wait: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (id: unknown) => void = (id) => clearTimeout(id as number),
) {
  let timer: unknown;
  let pending = false;
  let shown = false;
  const hide = () => {
    if (pending) cancel(timer);
    pending = false;
    if (shown) {
      shown = false;
      show(false);
    }
  };
  return {
    down: (e: Ev) => {
      if (e.key !== "Alt") return hide();
      if (e.repeat || e.metaKey || e.ctrlKey || e.shiftKey || pending || shown) return;
      pending = true;
      timer = wait(() => {
        pending = false;
        shown = true;
        show(true);
      }, HOLD_MS);
    },
    up: (e: Ev) => {
      if (e.key === "Alt") hide();
    },
    hide,
  };
}
