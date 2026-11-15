/** PROTOTYPE: throwaway variant switcher. Shows only when the URL has `?variant=`. */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

const read = () => new URLSearchParams(location.search).get("variant");

export function useVariant(keys: string[]): string {
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return v && keys.includes(v) ? v : keys[0];
}

export function PrototypeSwitcher({ variants }: { variants: Record<string, string> }) {
  const keys = Object.keys(variants);
  const current = useVariant(keys);
  const go = (step: number) => {
    const next = keys[(keys.indexOf(current) + step + keys.length) % keys.length];
    const u = new URL(location.href);
    u.searchParams.set("variant", next);
    history.replaceState(null, "", u);
    dispatchEvent(new PopStateEvent("popstate"));
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable)
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });
  if (read() === null) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button className="rounded-full p-1 hover:bg-white/20" onClick={() => go(-1)} aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center font-mono">
        {current} ({variants[current]})
      </span>
      <button className="rounded-full p-1 hover:bg-white/20" onClick={() => go(1)} aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
