import { AlertTriangle, GitBranch, LoaderCircle, RefreshCw } from "lucide-react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { MapGraphData } from "../shared/map-graph.ts";
import { buildPrGraph, type Edge, type GraphNode, type GraphThread, type PrGraph } from "../shared/pr-graph.ts";
import type { Status, ThreadNode } from "../shared/tree.ts";
import { STATUS } from "./status-icon.tsx";

/** Opens the PR graph of the map head with this id. */
export const OpenGraph = createContext<(id: string) => void>(() => {});

const NW = 210;
const NH = 92;
const GX = 44;
const GY = 14;
const PAD = 16;
const MAIN_W = 64;

const EDGE: Record<Edge["kind"], string> = {
  stack: "stroke-primary",
  base: "stroke-status-needs-input [stroke-dasharray:5_4]",
  main: "stroke-muted-foreground",
  dim: "stroke-border",
};

const EDGE_LEGEND: [Edge["kind"], string][] = [
  ["stack", "gh stack"],
  ["base", "plain base"],
  ["main", "base main"],
  ["dim", "closed or merged"],
];

const stateOf = (n: GraphNode) => (n.draft ? "draft" : n.state);
const tone = (n: GraphNode) =>
  n.draft
    ? "text-muted-foreground"
    : n.state === "open"
      ? "text-status-done-fg"
      : n.state === "merged"
        ? "text-pr-merged"
        : "text-destructive";

const place = (col: number, row: number) => ({
  x: PAD + col * (NW + GX),
  y: PAD + row * (NH + GY),
});

/** The slow part of the graph. A failed read keeps the last answer. */
function useMapGraph(key: string) {
  const [state, setState] = useState<{
    data: MapGraphData | null;
    busy: boolean;
    down: boolean;
  }>({
    data: null,
    busy: true,
    down: false,
  });
  const ctl = useRef<AbortController | null>(null);
  const run = useCallback(
    (refresh: boolean) => {
      ctl.current?.abort();
      const c = (ctl.current = new AbortController());
      fetch(`/map-graph?key=${encodeURIComponent(key)}${refresh ? "&refresh=1" : ""}`, { signal: c.signal })
        .then((r) => (r.ok ? (r.json() as Promise<MapGraphData>) : Promise.reject(new Error(String(r.status)))))
        .then(
          (data) => setState({ data, busy: false, down: false }),
          () => {
            if (!c.signal.aborted) setState((s) => ({ ...s, busy: false, down: true }));
          },
        );
    },
    [key],
  );
  useEffect(() => {
    run(false);
    return () => ctl.current?.abort();
  }, [run]);
  const refresh = () => {
    setState((s) => ({ ...s, busy: true }));
    run(true);
  };
  return [state, refresh] as const;
}

/** Drags the empty area to pan. A drag that starts on a link or a button does not pan. */
function pan(e: PointerEvent<HTMLDivElement>) {
  if (e.button !== 0 || (e.target as HTMLElement).closest("a,button")) return;
  const el = e.currentTarget;
  const start = {
    x: e.clientX,
    y: e.clientY,
    l: el.scrollLeft,
    t: el.scrollTop,
  };
  el.setPointerCapture(e.pointerId);
  el.style.cursor = "grabbing";
  const move = (m: globalThis.PointerEvent) => {
    el.scrollLeft = start.l - (m.clientX - start.x);
    el.scrollTop = start.t - (m.clientY - start.y);
  };
  const up = () => {
    el.style.cursor = "";
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

function StatusMark({ thread }: { thread: GraphThread }) {
  const s = STATUS[thread.status as Status];
  return s ? <s.icon className={cn("size-3.5 flex-none", s.shape)} aria-hidden /> : null;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {EDGE_LEGEND.map(([kind, text]) => (
        <span key={kind} className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" className={EDGE[kind]} />
          </svg>
          {text}
        </span>
      ))}
      <span>! anomaly (hover)</span>
      <span>L lane</span>
    </div>
  );
}

function Badge({ texts }: { texts: string[] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={texts.join(". ")}
          className="flex size-4 flex-none items-center justify-center rounded-full bg-destructive font-sans text-[10px] font-bold text-white"
        >
          !
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {texts.map((t) => (
          <div key={t}>{t}</div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function NodeCard({
  n,
  texts,
  style,
  className,
}: {
  n: GraphNode;
  texts: string[];
  style?: CSSProperties;
  className?: string;
}) {
  const { x, y } = place(n.col, n.row);
  return (
    <div
      data-pr={n.n}
      tabIndex={-1}
      title={n.title ?? undefined}
      style={{ left: x, top: y, width: NW, height: NH, ...style }}
      className={cn(
        "absolute flex flex-col justify-between rounded-lg border bg-card px-2.5 py-2 font-mono text-[11px] shadow-md shadow-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:shadow-black/40",
        (n.draft || n.outside) && "border-dashed",
        (n.state === "closed" || n.state === "merged") && "opacity-55",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        {n.thread ? (
          <a
            href={n.thread.href}
            title={`Open thread in T3: ${n.thread.title}`}
            className="flex min-w-0 items-center gap-1.5 font-sans text-xs font-semibold hover:underline"
          >
            <StatusMark thread={n.thread} />
            <span className="truncate">{n.key}</span>
          </a>
        ) : (
          <span className="min-w-0 truncate font-sans text-xs font-semibold">{n.key}</span>
        )}
        <span className="flex flex-none items-center gap-1 text-muted-foreground">
          {n.outside ? (
            <span className="rounded bg-muted px-1 font-sans text-[10px]">outside the map</span>
          ) : (
            n.lane !== null && `L${n.lane}`
          )}
          {texts.length > 0 && <Badge texts={texts} />}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <a href={n.url} target="_blank" rel="noreferrer" title="Open PR on GitHub" className="hover:underline">
          #{n.n}
        </a>
        <span className={tone(n)}>{stateOf(n)}</span>
        {n.conflicting && <span className="ml-auto text-destructive">conflicts</span>}
      </div>
      <div className="truncate text-muted-foreground">{n.head}</div>
      <div className="flex items-center gap-1 font-sans text-muted-foreground">
        {n.stack ? `stack ${n.stack.pos}/${n.stack.total}` : "no stack"}
        {!n.thread && <span className="ml-auto text-destructive">no thread</span>}
      </div>
    </div>
  );
}

/** Merged stack members on one spot: a deck that fans out down on hover, in stack order. */
function MergedPile({ pile, texts }: { pile: GraphNode[]; texts: (n: GraphNode) => string[] }) {
  const { x, y } = place(pile[0].col, pile[0].row);
  return (
    <div
      style={{ left: x, top: y, width: NW, "--open": `${pile.length * (NH + GY) - GY}px` } as CSSProperties}
      className="group/pile absolute h-[92px] opacity-60 transition-[height,opacity] hover:z-10 hover:h-(--open) hover:opacity-100 motion-reduce:transition-none"
    >
      {pile.map((n, i) => {
        const d = Math.min(pile.length - 1 - i, 3) * 5;
        return (
          <NodeCard
            key={n.n}
            n={n}
            texts={texts(n)}
            style={{ left: 0, top: 0, "--c": `${d}px ${-d}px`, "--e": `0 ${i * (NH + GY)}px` } as CSSProperties}
            className="[translate:var(--c)] border-pr-merged/40 opacity-100 transition-[translate] group-hover/pile:[translate:var(--e)] group-hover/pile:border-border motion-reduce:transition-none"
          />
        );
      })}
      <span className="absolute -right-2 -bottom-2 z-10 rounded-full border border-pr-merged/50 bg-card px-1.5 font-sans text-[10px] font-semibold text-pr-merged shadow-md transition-opacity group-hover/pile:opacity-0">
        {pile.length} merged
      </span>
    </div>
  );
}

function Pill({ branch, col, row }: { branch: string; col: number; row: number }) {
  const { x, y } = place(col, row);
  return (
    <div
      style={{
        left: x,
        top: y + NH / 2 - 14,
        height: 28,
        width: col === 0 ? MAIN_W : NW,
      }}
      className={cn(
        "absolute flex items-center justify-center rounded-full border bg-muted px-3 font-mono text-xs font-semibold",
        col > 0 && "border-dashed",
      )}
    >
      <span className="truncate">{branch}</span>
    </div>
  );
}

function Canvas({ graph }: { graph: PrGraph }) {
  const anomalyTexts = (n: GraphNode) => graph.anomalies.filter((a) => a.prs.includes(n.n)).map((a) => a.text);
  const spot = new Map<string, { col: number; row: number }>([
    ["main", { col: 0, row: 0 }],
    ...graph.nodes.map((n) => [`#${n.n}`, n] as const),
    ...graph.branches.map((b) => [`b:${b.branch}`, b] as const),
  ]);
  const at = (e: Edge["from"] | Edge["to"]) =>
    spot.get(e === "main" ? "main" : typeof e === "number" ? `#${e}` : `b:${e.branch}`)!;
  const cols = Math.max(0, ...[...spot.values()].map((s) => s.col)) + 1;
  const rows = Math.max(0, ...[...spot.values()].map((s) => s.row)) + 1;
  const w = 2 * PAD + cols * NW + (cols - 1) * GX;
  const h = 2 * PAD + rows * NH + (rows - 1) * GY;
  return (
    <div className="relative" style={{ width: w, height: h }}>
      <svg width={w} height={h} className="absolute inset-0" aria-hidden>
        {graph.edges.map((e, i) => {
          const a = at(e.from);
          const b = at(e.to);
          const x1 = place(a.col, a.row).x + (e.from === "main" ? MAIN_W : NW);
          const y1 = place(a.col, a.row).y + NH / 2;
          const x2 = place(b.col, b.row).x;
          const y2 = place(b.col, b.row).y + NH / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              strokeWidth={2}
              className={EDGE[e.kind]}
            />
          );
        })}
      </svg>
      <Pill branch="main" col={0} row={0} />
      {graph.branches.map((b) => (
        <Pill key={b.branch} {...b} />
      ))}
      {Object.values(Object.groupBy(graph.nodes, (n) => `${n.col},${n.row}`)).map((pile = []) =>
        pile.length > 1 ? (
          <MergedPile
            key={pile[0].n}
            pile={pile.toSorted((a, b) => a.stack!.pos - b.stack!.pos)}
            texts={anomalyTexts}
          />
        ) : (
          <NodeCard key={pile[0].n} n={pile[0]} texts={anomalyTexts(pile[0])} />
        ),
      )}
    </div>
  );
}

function Lists({ graph, box }: { graph: PrGraph; box: RefObject<HTMLDivElement | null> }) {
  const jump = (n: number) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-pr="${n}"]`);
    el?.scrollIntoView({ block: "center", inline: "center" });
    el?.focus({ preventScroll: true });
  };
  return (
    <div className="grid max-h-[calc(min(860px,100dvh-2rem)*0.3)] flex-none grid-rows-[minmax(0,1fr)] gap-4 text-xs sm:grid-cols-2">
      <section className="min-h-0 overflow-auto">
        <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden /> Anomalies
        </h3>
        {graph.anomalies.length === 0 ? (
          <p className="text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-1">
            {graph.anomalies.map((a, i) => (
              <li key={i}>
                {a.text}{" "}
                {a.prs.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => jump(n)}
                    className="mr-1 font-mono text-primary hover:underline"
                  >
                    #{n}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-h-0 overflow-auto">
        <h3 className="mb-1.5 font-semibold text-muted-foreground">Threads with no PR</h3>
        {graph.noPr.length === 0 ? (
          <p className="text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-1">
            {graph.noPr.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <StatusMark thread={t} />
                <a href={t.href} className="min-w-0 truncate hover:underline">
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The PR graph of the map that `head` heads. `head` comes from the raw tree, so every member counts. */
export function PrGraphDialog({ head, onOpenChange }: { head: ThreadNode; onOpenChange: (open: boolean) => void }) {
  const key = head.map!.key!;
  const [{ data, busy, down }, refresh] = useMapGraph(key);
  const graph = useMemo(() => buildPrGraph(head, data), [head, data]);
  const box = useRef<HTMLDivElement>(null);
  const retry = (
    <button type="button" onClick={() => refresh()} className="underline">
      Retry
    </button>
  );
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(860px,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 sm:max-w-[1200px]">
        <DialogHeader className="pr-8 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-base">
              <GitBranch className="size-4 flex-none" aria-hidden />
              <span className="truncate">{head.map!.name} · PR graph</span>
            </DialogTitle>
            <Button className="flex-none" variant="outline" size="sm" disabled={busy} onClick={() => refresh()}>
              {busy ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Refresh
            </Button>
          </div>
          <DialogDescription>
            {graph.nodes.length} PRs · {graph.nodes.filter((n) => n.state === "open").length} open
          </DialogDescription>
          {busy && !data && <p className="text-xs text-muted-foreground">Loading PRs from GitHub…</p>}
          {data?.errors.map((e) => (
            <p key={e.key} className="text-xs text-muted-foreground">
              Could not read PRs for {e.key}: {e.text} · {retry}
            </p>
          ))}
          {down && <p className="text-xs text-muted-foreground">Could not read PRs from T3 · {retry}</p>}
        </DialogHeader>
        <Legend />
        <div
          ref={box}
          onPointerDown={pan}
          className="min-h-0 cursor-grab touch-none [scrollbar-width:none] overflow-auto rounded-md border bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_60%),linear-gradient(315deg,color-mix(in_oklch,var(--status-plan)_6%,var(--background)),var(--background)_50%)] select-none [&::-webkit-scrollbar]:hidden"
        >
          <Canvas graph={graph} />
        </div>
        <Lists graph={graph} box={box} />
      </DialogContent>
    </Dialog>
  );
}
