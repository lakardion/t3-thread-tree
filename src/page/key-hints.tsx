import { useEffect, type ComponentProps } from "react";

import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { holdRule } from "./key-hints.ts";

/** A key hint: hidden until the hold, floats over its host. */
export function Hint({
  surface,
  className,
  ...props
}: ComponentProps<"kbd"> & { surface: "header" | "triage" | "slot" }) {
  return (
    <Kbd
      aria-hidden
      data-hint={surface}
      className={cn("key-hint h-4 min-w-4 px-1 text-[10px]", className)}
      {...props}
    />
  );
}

/** Marks the page with `data-key-hints` while the user holds Alt/Option. Does nothing when off or on touch. */
export function useKeyHints(on: boolean) {
  useEffect(() => {
    if (!on || matchMedia("(hover: none), (pointer: coarse)").matches) return;
    const root = document.documentElement;
    const rule = holdRule((v) => root.toggleAttribute("data-key-hints", v));
    const opts = { capture: true };
    addEventListener("keydown", rule.down, opts);
    addEventListener("keyup", rule.up, opts);
    addEventListener("pointerdown", rule.hide, opts);
    addEventListener("blur", rule.hide);
    return () => {
      removeEventListener("keydown", rule.down, opts);
      removeEventListener("keyup", rule.up, opts);
      removeEventListener("pointerdown", rule.hide, opts);
      removeEventListener("blur", rule.hide);
      rule.hide();
    };
  }, [on]);
}
