import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Counts how often `value` differs from the previous render. It is 0 on mount. */
export function useChanges(value: string): number {
  const [s, set] = useState({ value, n: 0 });
  if (s.value !== value) set({ value, n: s.n + 1 });
  return s.n;
}

const STACKED = "col-start-1 row-start-1 min-w-0";
/** Matches the `.swap-out` duration in index.css. */
const FADE_OUT_MS = 150;

/** Crossfades its content when `k` changes while mounted. The first render never animates. An empty `k` means no content. */
export function Swap({
  k,
  enter,
  className,
  children,
}: {
  k: string;
  enter?: string;
  className?: string;
  children?: ReactNode;
}) {
  const last = useRef({ k, node: children });
  const [out, setOut] = useState<{ k: string; node: ReactNode } | null>(null);
  const changed = useChanges(k) > 0;
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = { k, node: children };
    if (prev.k !== k && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) setOut(prev);
  }, [k, children]);
  /** A timer, not `animationend`, drops the old content: the event never fires when the animation stops early. */
  useEffect(() => {
    if (!out) return;
    const id = setTimeout(() => setOut(null), FADE_OUT_MS);
    return () => clearTimeout(id);
  }, [out]);
  if (k === "" && !out) return null;
  return (
    <span className={cn("inline-grid", className)}>
      {out && (
        <span key={out.k} aria-hidden className={cn(STACKED, "swap-out")}>
          {out.node}
        </span>
      )}
      {k !== "" && (
        <span key={k} className={cn(STACKED, changed && ["swap-in", enter])}>
          {children}
        </span>
      )}
    </span>
  );
}
