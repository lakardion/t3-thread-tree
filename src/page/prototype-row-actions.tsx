/**
 * PROTOTYPE, throwaway: row action variants for the no-shift hover question.
 * Pick one with `?variant=` (now, A–G); the floating bar and the ←/→ keys cycle them.
 * F and G also take `?icon=`, the icon that `⋯` morphs into; the bar cycles it.
 */
import { ChevronDown, CircleEllipsis, Ellipsis, EllipsisVertical, Minus, X } from "lucide";
import { MorphIcon } from "morphicons/react";
import { Popover } from "radix-ui";
import { type ReactNode, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "@/components/ui/button";

export const VARIANTS = [
  ["now", "Current: drawer grows"],
  ["A", "Reserved slot, fade in"],
  ["B", "Overlay on title end"],
  ["C", "One ⋯ menu"],
  ["D", "Separate action line"],
  ["E", "Floating toolbar below"],
  ["F", "⋯ opens toolbar on its hover"],
  ["G", "⋯ opens toolbar on row hover"],
] as const;
export type Variant = (typeof VARIANTS)[number][0];

const asked = new URLSearchParams(location.search).get("variant");
export const VARIANT: Variant = VARIANTS.find(([k]) => k === asked)?.[0] ?? "now";

export const ICONS = [
  ["x", X],
  ["vertical", EllipsisVertical],
  ["chevron", ChevronDown],
  ["minus", Minus],
  ["circle", CircleEllipsis],
] as const;
const askedIcon = new URLSearchParams(location.search).get("icon");
const ICON = ICONS.find(([k]) => k === askedIcon) ?? ICONS[0];

/** Shows on hover, focus, a settle error and touch; stays in the layout and only fades. */
export const REVEAL =
  "opacity-0 pointer-events-none transition-opacity duration-150 motion-reduce:transition-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto has-data-err:opacity-100 has-data-err:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto";

/** The one open toolbar's close; opening another toolbar shuts it first. */
let current: (() => void) | null = null;

/** Opens on mouse hover (with a short grace to cross the gap) or on click; a nested open menu holds it open. */
export function useHoverOpen() {
  const [open, setOpen] = useState(false);
  const [byKey, setByKey] = useState(false);
  const timer = useRef<number>(undefined);
  const id = useId();
  const [close] = useState(() => {
    const fn = () => {
      clearTimeout(timer.current);
      setOpen(false);
      if (current === fn) current = null;
    };
    return fn;
  });
  const show = () => {
    clearTimeout(timer.current);
    if (current && current !== close) current();
    current = close;
    setOpen(true);
  };
  const change = (o: boolean) => (o ? show() : close());
  const hold = (e: { pointerType: string }) => {
    if (e.pointerType !== "mouse") return;
    setByKey(false);
    show();
  };
  const drop = (e: { pointerType: string }) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (document.querySelector(`[data-bar="${id}"] [data-state=open]`)) return;
      close();
    }, 180);
  };
  return { open, setOpen: change, byKey, setByKey, hold, drop, id };
}
export type HoverOpen = ReturnType<typeof useHoverOpen>;

/** The `⋯` trigger and its toolbar, portaled out of the row so no later row or divider paints over it. */
export function ToolbarMenu({
  ctl,
  hoverTrigger,
  className,
  children,
}: {
  ctl: HoverOpen;
  hoverTrigger: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root open={ctl.open} onOpenChange={ctl.setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label="Row actions"
          onPointerEnter={hoverTrigger ? ctl.hold : undefined}
          onPointerLeave={hoverTrigger ? ctl.drop : undefined}
          onClick={(e) => ctl.setByKey(e.detail === 0)}
        >
          <MorphIcon icon={ctl.open ? ICON[1] : Ellipsis} size={14} reducedMotion="user" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-bar={ctl.id}
          side="bottom"
          align="end"
          sideOffset={2}
          collisionPadding={8}
          onOpenAutoFocus={(e) => {
            if (!ctl.byKey) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            if (!ctl.byKey) e.preventDefault();
          }}
          onPointerEnter={ctl.hold}
          onPointerLeave={ctl.drop}
          className="z-50 flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function goIcon(step: number) {
  const i = ICONS.indexOf(ICON);
  const url = new URL(location.href);
  url.searchParams.set("icon", ICONS[(i + step + ICONS.length) % ICONS.length][0]);
  location.replace(url);
}

function go(step: number) {
  const i = VARIANTS.findIndex(([k]) => k === VARIANT);
  const next = VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length][0];
  const url = new URL(location.href);
  url.searchParams.set("variant", next);
  location.replace(url);
}

function Switcher() {
  const name = VARIANTS.find(([k]) => k === VARIANT)![1];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-fuchsia-500 bg-black px-2 py-1 font-mono text-xs text-white shadow-xl">
      <button className="cursor-pointer px-2" aria-label="Previous variant" onClick={() => go(-1)}>
        ←
      </button>
      <span>
        {VARIANT} ({name})
      </span>
      <button className="cursor-pointer px-2" aria-label="Next variant" onClick={() => go(1)}>
        →
      </button>
      {(VARIANT === "F" || VARIANT === "G") && (
        <>
          <span className="opacity-50">|</span>
          <button className="cursor-pointer px-1" aria-label="Previous icon" onClick={() => goIcon(-1)}>
            ‹
          </button>
          <span>⋯ → {ICON[0]}</span>
          <button className="cursor-pointer px-1" aria-label="Next icon" onClick={() => goIcon(1)}>
            ›
          </button>
        </>
      )}
    </div>
  );
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const el = document.activeElement;
  if (el?.matches("input, textarea, [contenteditable], [role=menu] *, [role=menu]")) return;
  go(e.key === "ArrowLeft" ? -1 : 1);
});

const host = document.getElementById("proto-switch") ?? document.createElement("div");
host.id = "proto-switch";
document.body.append(host);
createRoot(host).render(<Switcher />);
