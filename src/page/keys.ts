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
};

/** The action of a key press, or null when the page does nothing. A number is a Focus slot index. */
export function pageKey(e: KeyEvent, ctx: KeyContext): "next" | "find" | 0 | 1 | 2 | null {
  if (
    e.key.toLowerCase() === "k" &&
    !e.altKey &&
    !e.shiftKey &&
    (ctx.mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
  )
    return ctx.overlay === "dialog" || ctx.overlay === "menu" ? null : "find";
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return null;
  if (ctx.field || ctx.panel || ctx.overlay) return null;
  if (e.key === "n") return "next";
  return e.key === "1" ? 0 : e.key === "2" ? 1 : e.key === "3" ? 2 : null;
}
