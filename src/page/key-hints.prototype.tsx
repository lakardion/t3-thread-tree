/**
 * PROTOTYPE, throwaway. Key hint variants on the real page, switched by `?variant=`.
 *
 * A Always-on soft hints on every surface. Find: hints on the selected row.
 * B No hints until the user holds Alt/Option, then all hints. Find: footer bar.
 * C Both: Find footer bar always, the other hints on hold.
 * D Find only: Find footer bar always, no other hint, no hold.
 *
 * The CSS in `index.css` (`.key-hint` rules) decides what shows; this file only sets `<html data-hints data-alt>`.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const VARIANTS = {
  A: "Always on",
  B: "Hold Alt/Option",
  C: "Find bar + hold",
  D: "Find bar only",
} as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];

/** Hold time before the hints show. A shorter tap does nothing. */
const HOLD_MS = 300;

export type Surface = "find-row" | "find-bar" | "header" | "row" | "slot";

/** One soft key cap. Hidden unless the variant CSS shows its surface. */
export const Hint = ({
  surface,
  className,
  children,
}: {
  surface: Surface;
  className?: string;
  children: ReactNode;
}) => (
  <Kbd aria-hidden data-hint={surface} className={cn("key-hint", className)}>
    {children}
  </Kbd>
);

/** A key cap with its action, as one hint. */
export const HintPair = ({ surface, k, label }: { surface: Surface; k: string; label: string }) => (
  <span aria-hidden data-hint={surface} className="key-hint items-center gap-1 text-[11px] text-muted-foreground">
    <Kbd className="h-4 min-w-4 bg-muted/70 px-1 text-[10px]">{k}</Kbd>
    {label}
  </span>
);

const readVariant = (): Variant => {
  const v = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return KEYS.includes(v as Variant) ? (v as Variant) : "A";
};

/** Sets the variant on `<html>` and reveals the hints while Alt/Option is held alone. */
export function KeyHintsPrototype() {
  const [variant, setVariant] = useState(readVariant);
  useEffect(() => {
    document.documentElement.dataset.hints = variant;
    const url = new URL(location.href);
    url.searchParams.set("variant", variant);
    history.replaceState(history.state, "", url);
  }, [variant]);

  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      timer = undefined;
      delete root.dataset.alt;
    };
    const down = (e: KeyboardEvent) => {
      /** Any other key during the hold is a chord (Option+key types a character on macOS): hide. */
      if (e.key !== "Alt") return hide();
      if (e.repeat || timer || root.dataset.alt !== undefined) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      timer = setTimeout(() => {
        root.dataset.alt = "";
      }, HOLD_MS);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") hide();
    };
    addEventListener("keydown", down, true);
    addEventListener("keyup", up, true);
    addEventListener("blur", hide);
    addEventListener("pointerdown", hide, true);
    return () => {
      hide();
      removeEventListener("keydown", down, true);
      removeEventListener("keyup", up, true);
      removeEventListener("blur", hide);
      removeEventListener("pointerdown", hide, true);
    };
  }, []);

  const step = (d: number) => setVariant((v) => KEYS[(KEYS.indexOf(v) + d + KEYS.length) % KEYS.length]!);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el?.closest("input, textarea, [contenteditable]") || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-1.5 py-1 text-[12px] text-white shadow-lg">
      <button
        type="button"
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Previous variant"
        onClick={() => step(-1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-1 font-medium tabular-nums">
        {variant} · {VARIANTS[variant]}
      </span>
      <button
        type="button"
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Next variant"
        onClick={() => step(1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
