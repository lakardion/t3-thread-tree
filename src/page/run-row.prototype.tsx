/**
 * PROTOTYPE, throwaway. How a Run row and its step threads look in the tree.
 * One fake run with two step threads and one child run. Switch with `?variant=A|B|C` and `?run=` (the floating bar, or ← →).
 *
 * A Thread twin: the run is a row like a thread row; its step threads nest under it like subthreads, with a step chip.
 * B Run group: the run is a group header like an issue-key group; every step is a line, pending steps included.
 * C Step rail: the run row carries a step strip; its steps hang on a rail with the step name in a left column.
 */
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CirclePause,
  ExternalLink,
  LoaderCircle,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Branch, Status, ThreadNode } from "../shared/tree.ts";

/* ---------- fake data, shaped like workflows.subscribe plus shells with workflowRun ---------- */

type RunState = "running" | "asks" | "paused" | "done";
type Step = { name: string; state: "done" | "now" | "failed" | "pending"; thread?: string; run?: FakeRun };
type FakeRun = { id: string; workflow: string; title: string; state: RunState; startedMin: number; steps: Step[] };

const RUN_STATES: RunState[] = ["running", "asks", "paused", "done"];

const STEP_THREADS: Record<string, { title: string; status: Status; phrase: string }> = {
  plan: { title: "Plan SHOP-412 Split the payment step", status: "done", phrase: "Completed" },
  implement: { title: "Implement SHOP-412 Split the payment step", status: "working", phrase: "Working" },
  review: { title: "Review #2101 Split the payment step", status: "working", phrase: "Working" },
};

function fixture(state: RunState): FakeRun {
  const now: Step["state"] = state === "paused" ? "failed" : state === "done" ? "done" : "now";
  const child: FakeRun = {
    id: "run-child",
    workflow: "review-pr",
    title: "Review #2101",
    state: state === "done" ? "done" : "running",
    startedMin: 3,
    steps: [
      { name: "review", state: state === "done" ? "done" : "now", thread: "review" },
      { name: "post-comments", state: state === "done" ? "done" : "pending" },
    ],
  };
  return {
    id: "run-root",
    workflow: "ship-issue",
    title: "Ship SHOP-412 Split the payment step",
    state,
    startedMin: 42,
    steps: [
      { name: "plan", state: "done", thread: "plan" },
      { name: "implement", state: now, thread: "implement" },
      { name: "review", state: state === "done" ? "done" : "pending", run: child },
      { name: "open-pr", state: state === "done" ? "done" : "pending" },
    ],
  };
}

const RUN_LOOK: Record<RunState, { icon: LucideIcon; color: string; word: string }> = {
  running: { icon: LoaderCircle, color: "text-status-working", word: "running" },
  asks: { icon: Workflow, color: "text-status-plan", word: "asks you" },
  paused: { icon: CirclePause, color: "text-status-failed", word: "paused" },
  done: { icon: Check, color: "text-status-done", word: "done" },
};
const STEP_DOT: Record<Step["state"], string> = {
  done: "bg-status-done",
  now: "bg-status-working",
  failed: "bg-status-failed",
  pending: "bg-muted-foreground/30",
};

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
const mins = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`);
const current = (r: FakeRun) => r.steps.find((s) => s.state === "now" || s.state === "failed");
const phrase = (r: FakeRun) => {
  const s = current(r);
  const word = RUN_LOOK[r.state].word;
  if (r.state === "done") return `${word} · ${r.steps.length} steps`;
  return s ? `${word} · ${s.name}` : word;
};
const stepCount = (r: FakeRun) => `${r.steps.filter((s) => s.state === "done").length + 1}/${r.steps.length}`;

/** A real ThreadNode from the tree, reshaped into a step thread, so the real ThreadRow renders it. */
const stepNode = (sample: ThreadNode, key: string, runState: RunState): ThreadNode => {
  const s = STEP_THREADS[key];
  const status = runState === "paused" && key === "implement" ? "failed" : runState === "done" ? "done" : s.status;
  return {
    ...sample,
    id: `proto-${key}`,
    title: s.title,
    key: null,
    linear: null,
    status,
    phrase: status === "failed" ? "Failed" : status === "done" ? "Completed" : s.phrase,
    raw: status,
    settled: false,
    input: false,
    snoozedUntil: null,
    stack: null,
    prs: key === "implement" ? sample.prs.slice(0, 1) : [],
    children: [],
    catchUp: undefined,
  };
};

type Row = ComponentType<{ t: ThreadNode; chip?: string; inStack?: boolean }>;
type Ctx = { Row: Row; sample: ThreadNode; state: RunState };

const RunIcon = ({ r }: { r: FakeRun }) => {
  const { icon: Icon, color } = RUN_LOOK[r.state];
  return <Icon className={cn("size-4 flex-none", color, r.state === "running" && "animate-spin")} />;
};

const OpenRun = () => (
  <Button variant="ghost" size="icon" className="size-6 flex-none text-muted-foreground" aria-label="Open run in T3">
    <ExternalLink className="size-3.5" />
  </Button>
);

const Fold = ({ open, set }: { open: boolean; set: (o: boolean) => void }) => (
  <Button
    variant="ghost"
    size="icon"
    className="size-6 flex-none text-muted-foreground"
    aria-label={open ? "Fold run" : "Unfold run"}
    onClick={() => set(!open)}
  >
    <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
  </Button>
);

/* ---------- A: Thread twin ---------- */

function RunA({ r, c }: { r: FakeRun; c: Ctx }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="my-px">
      <div className="group/row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 py-1 text-[13px] leading-5 hover:bg-muted/50">
        <RunIcon r={r} />
        <span className={cn("flex-none text-xs", RUN_LOOK[r.state].color)}>
          {phrase(r)}
          {r.state === "asks" && " · 4m"}
        </span>
        <Badge variant="outline" className={cn(CHIP, "flex-none")}>
          <Workflow className="size-3" /> {r.workflow}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
        <span className="ml-auto flex flex-none items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{mins(r.startedMin)}</span>
          <OpenRun />
          <Fold open={open} set={setOpen} />
        </span>
      </div>
      {open && (
        <ul className="m-0 list-none pl-2.5">
          {r.steps.map((s) =>
            s.thread ? (
              <c.Row key={s.name} t={stepNode(c.sample, s.thread, c.state)} chip={s.name} inStack />
            ) : s.run ? (
              <RunA key={s.name} r={s.run} c={c} />
            ) : null,
          )}
        </ul>
      )}
    </li>
  );
}

/* ---------- B: Run group ---------- */

function RunB({ r, c }: { r: FakeRun; c: Ctx }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="my-px">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 w-full min-w-0 items-center gap-2 rounded-[8px] px-2 text-left hover:bg-accent"
      >
        <ChevronRight
          className={cn("size-3.5 flex-none text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Workflow className="size-3.5 flex-none text-status-plan" />
        <span className="flex-none text-xs font-semibold text-status-plan">{r.workflow}</span>
        <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{r.title}</span>
        <span className={cn("ml-auto flex flex-none items-center gap-1 text-[11px]", RUN_LOOK[r.state].color)}>
          <RunIcon r={r} /> {RUN_LOOK[r.state].word}
          <span className="text-muted-foreground tabular-nums">
            · step {stepCount(r)} · {mins(r.startedMin)}
          </span>
        </span>
      </button>
      {open && (
        <ul className="m-0 ml-3.5 list-none border-l border-dashed border-status-plan/40 pl-2.5">
          {r.steps.map((s) =>
            s.thread ? (
              <c.Row key={s.name} t={stepNode(c.sample, s.thread, c.state)} inStack />
            ) : s.run ? (
              <RunB key={s.name} r={s.run} c={c} />
            ) : (
              <li key={s.name} className="flex h-7 items-center gap-2 px-2 text-xs text-muted-foreground">
                <Circle className="size-3.5 flex-none opacity-40" />
                <span className="font-mono">{s.name}</span>
                <span>· not started</span>
              </li>
            ),
          )}
        </ul>
      )}
    </li>
  );
}

/* ---------- C: Step rail ---------- */

const Strip = ({ r }: { r: FakeRun }) => (
  <span className="flex flex-none items-center gap-0.5" title={r.steps.map((s) => `${s.name}: ${s.state}`).join("\n")}>
    {r.steps.map((s) => (
      <span key={s.name} className={cn("h-1.5 w-4 rounded-full", STEP_DOT[s.state])} />
    ))}
  </span>
);

function RunC({ r, c }: { r: FakeRun; c: Ctx }) {
  const [open, setOpen] = useState(true);
  return (
    <li className="my-px">
      <div className="flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] border border-status-plan/30 bg-status-plan/5 px-2 py-1 text-[13px] leading-5">
        <RunIcon r={r} />
        <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
        <Strip r={r} />
        <span className={cn("flex-none text-xs", RUN_LOOK[r.state].color)}>{phrase(r)}</span>
        <span className="flex-none font-mono text-[11px] text-muted-foreground">{r.workflow}</span>
        <OpenRun />
        <Fold open={open} set={setOpen} />
      </div>
      {open && (
        <ul className="m-0 ml-3 list-none border-l-2 border-status-plan/30">
          {r.steps.map((s) => (
            <li key={s.name} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start">
              <span className="flex h-9 items-center gap-1.5 pl-2 text-[11px] text-muted-foreground">
                <span
                  className={cn("-ml-[13px] size-2 flex-none rounded-full ring-2 ring-background", STEP_DOT[s.state])}
                />
                <span className="truncate font-mono">{s.name}</span>
              </span>
              {s.thread ? (
                <ul className="m-0 list-none p-0">
                  <c.Row t={stepNode(c.sample, s.thread, c.state)} inStack />
                </ul>
              ) : s.run ? (
                <ul className="m-0 list-none p-0 pt-1">
                  <RunC r={s.run} c={c} />
                </ul>
              ) : (
                <span className="flex h-9 items-center text-xs text-muted-foreground/70">not started</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ---------- switcher state in the URL ---------- */

const VARIANTS = { A: "Thread twin", B: "Run group", C: "Step rail" } as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];
const subscribe = (fn: () => void) => {
  addEventListener("popstate", fn);
  addEventListener("proto-param", fn);
  return () => {
    removeEventListener("popstate", fn);
    removeEventListener("proto-param", fn);
  };
};
const param = (k: string) => new URL(location.href).searchParams.get(k);
const setParam = (k: string, v: string) => {
  const u = new URL(location.href);
  u.searchParams.set(k, v);
  history.replaceState(null, "", u);
  dispatchEvent(new Event("proto-param"));
};
const useVariant = (): Variant => {
  const v = useSyncExternalStore(subscribe, () => param("variant"));
  return KEYS.includes(v as Variant) ? (v as Variant) : "A";
};
const useRunState = (): RunState => {
  const v = useSyncExternalStore(subscribe, () => param("run"));
  return RUN_STATES.includes(v as RunState) ? (v as RunState) : "running";
};

/* ---------- mount points ---------- */

const RUNS = { A: RunA, B: RunB, C: RunC };
const firstThread = (bs: Branch[]): ThreadNode | undefined => {
  for (const b of bs) {
    const t = b.threads.find((x) => x.prs.length > 0) ?? b.threads[0] ?? firstThread(b.branches);
    if (t) return t;
  }
};

/** Mounts as the first items of the tree list, next to real thread rows. `Row` is the real ThreadRow. */
export function RunRowsPrototype({ Row, projects }: { Row: Row; projects: Branch[] }) {
  const variant = useVariant();
  const state = useRunState();
  const sample = firstThread(projects);
  if (!sample) return null;
  const Run = RUNS[variant];
  return <Run key={`${variant}${state}`} r={fixture(state)} c={{ Row, sample, state }} />;
}

/** The floating bar: variant and run state. ← → cycle the variant outside fields. */
export function RunRowSwitcher() {
  const variant = useVariant();
  const state = useRunState();
  const go = (d: number) => setParam("variant", KEYS[(KEYS.indexOf(variant) + d + KEYS.length) % KEYS.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-xs text-background shadow-lg">
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="font-semibold">
        {variant} ({VARIANTS[variant]})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
      <select
        aria-label="Run state"
        className="rounded-full bg-background px-2 py-0.5 text-foreground"
        value={state}
        onChange={(e) => setParam("run", e.target.value)}
      >
        {RUN_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
