import { Check, ChevronDown, CirclePause, ExternalLink, LoaderCircle, Workflow, type LucideIcon } from "lucide-react";
import { useState, type ComponentType, type CSSProperties, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { RunInfo, RunStep, ThreadNode } from "../shared/tree.ts";
import { agoAt, phraseWith } from "./format.ts";

const LOOK: Record<RunInfo["state"], { icon: LucideIcon; color: string }> = {
  running: { icon: LoaderCircle, color: "text-status-working" },
  asks: { icon: Workflow, color: "text-status-plan" },
  paused: { icon: CirclePause, color: "text-status-failed" },
  done: { icon: Check, color: "text-status-done" },
};
const STEP_DOT: Record<RunStep["state"], string> = {
  done: "bg-status-done",
  now: "bg-status-working",
  failed: "bg-status-failed",
  pending: "bg-muted-foreground/30",
};
const STEP_WORD: Record<RunStep["state"], string> = {
  done: "done",
  now: "running",
  failed: "failed",
  pending: "not started",
};

const Strip = ({ steps }: { steps: RunStep[] }) => (
  <span
    className="flex flex-none items-center gap-0.5"
    title={steps.map((s) => `${s.name}: ${STEP_WORD[s.state]}`).join("\n")}
  >
    {steps.map((s, i) => (
      <span key={`${s.name}:${i}`} className={cn("h-1.5 w-4 rounded-full", STEP_DOT[s.state])} />
    ))}
  </span>
);

/**
 * A run node: a tinted row with the step strip, and a rail with one line per step. `Row` renders a step's thread or child
 * run. `liRef`, `liClass`, `liStyle` and `handle` come from the caller, which owns the drag and the row frame.
 */
export function RunRow({
  t,
  now,
  at,
  Row,
  liRef,
  liClass,
  liStyle,
  handle,
}: {
  t: ThreadNode;
  now: number;
  /** The row time: the newest of the run and its step threads. */
  at: number;
  Row: ComponentType<{ t: ThreadNode; inStack?: boolean; nested?: boolean }>;
  liRef: Ref<HTMLLIElement>;
  liClass?: string;
  liStyle?: CSSProperties;
  handle?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const run = t.run!;
  const { icon: Icon, color } = LOOK[run.state];
  return (
    <li ref={liRef} className={cn("my-px", liClass)} style={liStyle}>
      <div
        className="thread-row group/row relative flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] border border-status-plan/30 bg-status-plan/5 px-2 py-1 text-[13px] leading-5"
        data-status={t.status}
        data-thread={t.id}
      >
        {handle}
        <Icon className={cn("size-4 flex-none", color, run.state === "running" && "animate-spin")} />
        <a
          className="min-w-0 flex-1 truncate font-semibold hover:underline"
          href={t.href}
          target="_blank"
          rel="noreferrer"
          data-stop={t.id}
        >
          {t.title}
        </a>
        <Strip steps={run.steps} />
        <span className={cn("flex-none text-xs", color)} title={run.detail ?? undefined}>
          {phraseWith(t, now)}
        </span>
        <span className="flex-none font-mono text-[11px] text-muted-foreground">{run.workflow}</span>
        <span
          className="flex-none font-mono text-[11px] text-muted-foreground tabular-nums"
          title={`Last activity ${new Date(at).toLocaleString()}`}
        >
          {at > -Infinity && agoAt(at, now)}
        </span>
        <Button asChild variant="ghost" size="icon" className="size-6 flex-none text-muted-foreground">
          <a href={t.href} target="_blank" rel="noreferrer" aria-label="Open run in T3">
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 flex-none text-muted-foreground"
          aria-label={open ? "Fold run" : "Unfold run"}
          aria-expanded={open}
          data-fold
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
        </Button>
      </div>
      {open && (
        <ul className="m-0 ml-3 list-none border-l-2 border-status-plan/30 p-0">
          {run.steps.map((s, i) => {
            const c = t.children.find((x) => x.id === s.child);
            return (
              <li key={`${s.name}:${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start">
                <span className="flex h-9 items-center gap-1.5 pl-2 text-[11px] text-muted-foreground">
                  <span
                    className={cn("-ml-[13px] size-2 flex-none rounded-full ring-2 ring-background", STEP_DOT[s.state])}
                  />
                  <span className="truncate font-mono">{s.name}</span>
                </span>
                {c ? (
                  <ul className={cn("m-0 list-none p-0", c.run && "pt-1")}>
                    <Row t={c} nested />
                  </ul>
                ) : (
                  <span className="flex h-9 items-center text-xs text-muted-foreground/70">{STEP_WORD[s.state]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
