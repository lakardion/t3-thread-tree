/**
 * PROTOTYPE — throwaway. Layout variants for the thread list, picked with `?variant=`.
 * Shows only when the URL has a `variant` param, so the normal page never shows the bar.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import type { Branch, Tree } from "../../shared/tree.ts";

export type VariantProps = { projects: Branch[]; now: number; linear: Tree["linear"] };
export type Variant = { key: string; name: string; Component?: ComponentType<VariantProps> };

/** Variants without a `Component` render inside the existing list; app.tsx reads their key. */
export const VARIANTS: Variant[] = [
  { key: "current", name: "Current layout" },
  { key: "flat", name: "One list, project column" },
];

const read = () => new URLSearchParams(location.search).get("variant");

export function useVariant() {
  const [key, setKey] = useState(read);
  useEffect(() => {
    const on = () => setKey(read());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  const go = (k: string) => {
    const u = new URL(location.href);
    u.searchParams.set("variant", k);
    history.replaceState(null, "", u);
    setKey(k);
  };
  const variant = key === null ? undefined : VARIANTS.find((v) => v.key === key);
  return { enabled: key !== null, variant: variant?.Component ? (variant as Required<Variant>) : undefined, key, go };
}

export function PrototypeSwitcher({ current, go }: { current: string | null; go: (k: string) => void }) {
  const i = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current),
  );
  const step = (d: number) => go(VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length].key);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button className="rounded-full p-1 hover:bg-white/20" onClick={() => step(-1)} aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center tabular-nums">
        {i + 1}/{VARIANTS.length} · <b>{VARIANTS[i].key}</b> ({VARIANTS[i].name})
      </span>
      <button className="rounded-full p-1 hover:bg-white/20" onClick={() => step(1)} aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
