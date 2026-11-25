/** The parts of a `KeyboardEvent` that the page keys read. */
export type KeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "defaultPrevented"
>;

export type KeyContext = {
  /** True on macOS, where Find is Cmd+K. */
  mac: boolean;
  /** Focus is in an input, a textarea or a contenteditable element. */
  field: boolean;
  /** The View panel is open. */
  panel: boolean;
  /** The overlay that is open: Find, another dialog, or a menu or listbox. */
  overlay: "find" | "dialog" | "menu" | null;
  /** The kind of the focused stop: a thread row, a fold header, or none. */
  stop: "thread" | "header" | null;
};

/** The action of a key press, or null when the page does nothing. */
export function pageKey(
  e: KeyEvent,
  ctx: KeyContext,
): "next" | "triage" | "find" | "down" | "up" | "toggle" | "expand" | "collapse" | "send" | null {
  if (
    e.key.toLowerCase() === "k" &&
    !e.altKey &&
    !e.shiftKey &&
    (ctx.mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
  )
    return ctx.overlay === "dialog" || ctx.overlay === "menu" ? null : "find";
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.defaultPrevented) return null;
  if (ctx.field || ctx.panel || ctx.overlay) return null;
  /** Moves repeat; the arrows move only from a stop, else the page scrolls. */
  if (e.key === "j" || (ctx.stop && e.key === "ArrowDown")) return "down";
  if (e.key === "k" || (ctx.stop && e.key === "ArrowUp")) return "up";
  if (e.repeat) return null;
  /** On a thread these act on its details, on a header on its fold. */
  if (ctx.stop && e.key === "o") return "toggle";
  if (ctx.stop && e.key === "l") return "expand";
  if (ctx.stop && e.key === "h") return "collapse";
  if (ctx.stop === "thread" && e.key === "s") return "send";
  if (e.key === "n") return "next";
  return e.key === "t" ? "triage" : null;
}
