/**
 * PROTOTYPE, throwaway. Four variants of the What's next split button, switched with `?variant=A|B|C|D`
 * and the floating bar (or the ← → keys).
 */
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Cli } from "../shared/brief.ts";
import type { Offered } from "./brief.tsx";
import { ProviderIcon } from "./provider-icon.tsx";

type P = { clis: Offered | null; cli: Cli | undefined; setCli: (c: Cli) => void; running: boolean; run: () => void };

const NAMES = { A: "Solid split + caption", B: "Two-line outline", C: "Model chip segment", D: "Soft pill" } as const;
type V = keyof typeof NAMES;
const KEYS = Object.keys(NAMES) as V[];

function ModelMenu({ p, children }: { p: P; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={!p.clis?.length}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Model</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={p.cli ?? ""} onValueChange={(v) => p.setCli(v as Cli)}>
          {p.clis?.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              <ProviderIcon cli={c.id} className="size-3.5" />
              {c.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const label = (p: P) => p.clis?.find((c) => c.id === p.cli)?.label ?? "No model";

/** Solid primary split; the model sits outside as a caption. */
function VariantA(p: P) {
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup>
        <Button size="sm" disabled={!p.cli || p.running} onClick={p.run}>
          <Sparkles /> What's next
        </Button>
        <ButtonGroupSeparator className="bg-primary-foreground/30" />
        <ModelMenu p={p}>
          <Button size="icon-sm" className="w-7" aria-label="Model">
            <ChevronDown />
          </Button>
        </ModelMenu>
      </ButtonGroup>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {p.cli && <ProviderIcon cli={p.cli} className="size-3" />}
        {label(p)}
      </span>
    </div>
  );
}

/** Outline split; the caption is a second line inside the main button. */
function VariantB(p: P) {
  return (
    <ButtonGroup>
      <Button
        variant="outline"
        className="h-10 flex-col items-start gap-0 px-3 leading-tight"
        disabled={!p.cli || p.running}
        onClick={p.run}
      >
        <span className="flex items-center gap-1.5 font-semibold text-primary">
          <Sparkles className="size-3.5" /> What's next
        </span>
        <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
          {p.cli && <ProviderIcon cli={p.cli} className="size-2.5" />}
          {label(p)}
        </span>
      </Button>
      <ModelMenu p={p}>
        <Button variant="outline" className="h-10 w-7 px-0" aria-label="Model">
          <ChevronDown />
        </Button>
      </ModelMenu>
    </ButtonGroup>
  );
}

/** Solid action plus a tinted segment that shows and picks the model. */
function VariantC(p: P) {
  return (
    <ButtonGroup>
      <Button size="sm" disabled={!p.cli || p.running} onClick={p.run}>
        <Sparkles /> What's next
      </Button>
      <ModelMenu p={p}>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 bg-primary/10 font-normal text-primary hover:bg-primary/15"
          aria-label="Model"
        >
          {p.cli && <ProviderIcon cli={p.cli} className="size-3.5" />}
          <span className="text-xs">{label(p)}</span>
          <ChevronDown className="opacity-70" />
        </Button>
      </ModelMenu>
    </ButtonGroup>
  );
}

/** One soft rounded pill: action, divider, model caption with chevron. */
function VariantD(p: P) {
  return (
    <ButtonGroup className="rounded-full border border-primary/30 bg-primary/8 shadow-xs">
      <Button
        size="sm"
        variant="ghost"
        className="rounded-l-full pl-3 font-semibold text-primary hover:bg-primary/12 hover:text-primary"
        disabled={!p.cli || p.running}
        onClick={p.run}
      >
        <Sparkles /> What's next
      </Button>
      <ButtonGroupSeparator className="my-1.5 bg-primary/25" />
      <ModelMenu p={p}>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1 rounded-r-full pr-2.5 pl-2 font-normal text-muted-foreground hover:bg-primary/12"
          aria-label="Model"
        >
          {p.cli && <ProviderIcon cli={p.cli} className="size-3" />}
          <span className="text-xs">{label(p)}</span>
          <ChevronDown className="size-3.5" />
        </Button>
      </ModelMenu>
    </ButtonGroup>
  );
}

const VARIANTS: Record<V, (p: P) => React.ReactNode> = { A: VariantA, B: VariantB, C: VariantC, D: VariantD };

function Switcher({ v, go }: { v: V; go: (d: number) => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-900 px-2 py-1 text-sm text-white shadow-lg">
      <button className="rounded-full p-1 hover:bg-white/15" onClick={() => go(-1)} aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-52 text-center">
        {v} ({NAMES[v]})
      </span>
      <button className="rounded-full p-1 hover:bg-white/15" onClick={() => go(1)} aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function BriefControlsPrototype(p: P) {
  const [v, setV] = useState<V>(() => {
    const q = new URLSearchParams(location.search).get("variant") as V | null;
    return q && q in NAMES ? q : "A";
  });
  const go = (d: number) =>
    setV((cur) => {
      const next = KEYS[(KEYS.indexOf(cur) + d + KEYS.length) % KEYS.length]!;
      const u = new URL(location.href);
      u.searchParams.set("variant", next);
      history.replaceState(null, "", u);
      return next;
    });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable], [role=menu]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  const Variant = VARIANTS[v];
  return (
    <>
      <Variant {...p} />
      <Switcher v={v} go={go} />
    </>
  );
}
