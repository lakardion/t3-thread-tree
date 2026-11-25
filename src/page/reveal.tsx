import { createContext } from "react";

/** Unfolds the path to the row of a thread and scrolls to it. False when the row stays hidden. */
export const Reveal = createContext<(id: string) => Promise<boolean>>(async () => false);

/**
 * Scrolls the tree to the row of thread `id`, then flashes it. False when the row is not visible
 * (filter, hidden snoozed threads, or a flat stack that hides the row).
 */
export function revealRow(id: string): boolean {
  const row = document.querySelector<HTMLElement>(`.thread-row[data-thread="${CSS.escape(id)}"]`);
  if (!row?.checkVisibility() || row.getBoundingClientRect().height === 0) return false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  /** The flash waits for the scroll to end. With no scroll, the first timer flashes. */
  let timer = 0;
  const flash = () => {
    clearTimeout(timer);
    document.removeEventListener("scrollend", flash, true);
    document.removeEventListener("scroll", moving, true);
    const ring = "inset 0 0 0 2px var(--ring)";
    row.animate([{ boxShadow: ring }, { boxShadow: ring, offset: 0.6 }, { boxShadow: "inset 0 0 0 2px transparent" }], {
      duration: 1500,
      easing: "ease-out",
    });
  };
  const moving = () => {
    clearTimeout(timer);
    timer = window.setTimeout(flash, 150);
  };
  timer = window.setTimeout(flash, 600);
  document.addEventListener("scrollend", flash, true);
  document.addEventListener("scroll", moving, true);
  return true;
}
