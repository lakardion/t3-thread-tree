import { useEffect, useRef } from "react";

import { Hint } from "./key-hints.tsx";

export const Cap = ({ children }: { children: string }) => (
  <Hint surface="triage" className="-top-2 -right-2">
    {children}
  </Hint>
);

/** Runs `on` for each plain key press while mounted. Pauses with a dialog, menu or Find open, and with a modifier down. */
export function useTriageKeys(on: (e: KeyboardEvent, inField: boolean) => void) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      if (document.querySelector("[data-find], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      const inField =
        e.target instanceof HTMLElement &&
        !!e.target.closest("input, textarea, [contenteditable]:not([contenteditable=false])");
      latest.current(e, inField);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}
