import { useDragOperation } from "@dnd-kit/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** How long a row takes to grow in or collapse out. */
const MS = 200;

export type Phase = "enter" | "leave";
export type Entry<T> = { key: string; item: T; phase?: Phase };

/**
 * The entries to show after `items` changed. Live items keep their order. A new item gets `enter`.
 * An item that is gone stays after its nearest earlier neighbour that still shows, with `leave` and its last data.
 * Without `animate`, no entry has a phase and a gone item drops at once.
 */
export function merge<T>(shown: Entry<T>[], items: T[], keyOf: (t: T) => string, animate: boolean): Entry<T>[] {
  const before = new Map(shown.map((e) => [e.key, e]));
  const out: Entry<T>[] = items.map((item) => {
    const key = keyOf(item);
    const old = before.get(key);
    const phase = animate ? (!old || old.phase === "leave" ? "enter" : old.phase) : undefined;
    return { key, item, phase };
  });
  if (!animate) return out;
  const live = new Set(out.map((e) => e.key));
  shown.forEach((e, i) => {
    if (live.has(e.key)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((o) => o.key === shown[j].key);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, { ...e, phase: "leave" });
  });
  return out;
}

const PhaseContext = createContext<Phase | undefined>(undefined);

/** Renders `items` and keeps a removed item in its slot until its exit ends. The first render and any change during a drag or with reduced motion do not animate. */
export function Presence<T>({
  items,
  keyOf,
  children,
}: {
  items: T[];
  keyOf: (t: T) => string;
  children: (item: T) => ReactNode;
}) {
  const { source } = useDragOperation();
  const keys = items.map(keyOf).join("\n");
  const [s, set] = useState(() => ({ keys, shown: merge([], items, keyOf, false) }));
  if (s.keys !== keys) {
    const animate = !source && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    set({ keys, shown: merge(s.shown, items, keyOf, animate) });
  }
  /** A timer ends the phases, because `animationend` does not fire when an animation stops early. */
  useEffect(() => {
    if (!s.shown.some((e) => e.phase)) return;
    const id = setTimeout(
      () =>
        set((p) => ({
          ...p,
          shown: p.shown.filter((e) => e.phase !== "leave").map((e) => ({ key: e.key, item: e.item })),
        })),
      MS,
    );
    return () => clearTimeout(id);
  }, [s.shown]);
  const live = new Map(items.map((i) => [keyOf(i), i]));
  return s.shown.map((e) => (
    <PhaseContext key={e.key} value={e.phase}>
      {children(live.get(e.key) ?? e.item)}
    </PhaseContext>
  ));
}

/** Returns a ref for the row element. The row grows in or collapses out while its `Presence` entry has a phase. */
export function useMotion(): (el: Element | null) => void {
  const phase = useContext(PhaseContext);
  const node = useRef<Element | null>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!phase || !el) return;
    el.getAnimations().forEach((a) => a.cancel());
    (el as HTMLElement).inert = phase === "leave";
    const full = { height: `${(el as HTMLElement).offsetHeight}px`, opacity: 1, overflow: "clip" };
    const shut = {
      height: 0,
      opacity: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: "clip",
    };
    el.animate(phase === "enter" ? [shut, full] : [full, shut], {
      duration: MS,
      easing: "ease-out",
      fill: phase === "leave" ? "forwards" : "none",
    });
  }, [phase]);
  return useCallback((el) => {
    node.current = el;
  }, []);
}
