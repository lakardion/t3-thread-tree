/**
 * PROTOTYPE, throwaway. The PR graph modal at All, project and map scope.
 * Three looks for the scope picker and the project bands, switched by `?variant=A|B|C`
 * or the floating bar (← → keys). Read only. Never merge.
 */
import { ChevronLeft, ChevronRight, GitBranch, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { buildPrGraph, type PrGraph } from "../shared/pr-graph.ts";
import { allThreads, type Group, type ThreadNode } from "../shared/tree.ts";
import { SOL_VARIANTS } from "./pr-graph-prototype-sol.tsx";
import { Canvas, Legend, Lists, pan, ReviewPrs, StatusMark, useMapGraph } from "./pr-graph.tsx";

/** A to C from this file, D and on from the Sol proposal file. */
const VARIANTS: [key: string, name: string, View: (p: Props) => ReactNode][] = [
  ["A", "Dropdown + stacked bands", VariantA],
  ["B", "Tabs + band columns", VariantB],
  ["C", "Sidebar + folding bands", VariantC],
  ...SOL_VARIANTS.map(([k, n, V]) => [k, `${n} · Sol`, V] as (typeof SOL_VARIANTS)[number]),
];
type Variant = string;

export type Band = {
  id: string;
  label: string;
  repo: string | null;
  root: string;
  graph: PrGraph;
  review: Set<number>;
  maps: ThreadNode[];
};

const isReview = (t: ThreadNode) => t.title.startsWith("Review #");

const mapHeads = (g: Group): ThreadNode[] => {
  const down = (t: ThreadNode): ThreadNode[] => [
    ...(t.map?.key && !t.map.header ? [t] : []),
    ...t.children.flatMap(down),
  ];
  return [...g.groups.flatMap(mapHeads), ...g.threads.flatMap(down)];
};

/** One band per project: its live threads, flat, with the most common outside base as the root. */
function bandOf(g: Group): Band {
  const live = allThreads(g).filter((t) => !t.settled);
  const prs = live.flatMap((t) => t.prs);
  const heads = new Set(prs.map((p) => p.head));
  const bases = prs.map((p) => p.base).filter((b): b is string => !!b && !heads.has(b));
  const count = Object.entries(Object.groupBy(bases, (b) => b)).toSorted((a, b) => b[1]!.length - a[1]!.length);
  const root = count[0]?.[0] ?? "main";
  const fake = {
    children: live.map((t) => ({
      ...t,
      children: [],
      prs: t.prs.map((p) => (p.base === root ? { ...p, base: "main" } : p)),
    })),
  } as unknown as ThreadNode;
  return {
    id: g.id,
    label: g.label,
    repo: g.repo ?? null,
    root,
    graph: buildPrGraph(fake, null),
    review: new Set(live.filter(isReview).flatMap((t) => t.prs.map((p) => p.n))),
    maps: mapHeads(g),
  };
}

export const openCount = (g: PrGraph) => g.nodes.filter((n) => n.state === "open").length;

function useVariant(): [Variant, (d: 1 | -1) => void, (v: Variant) => void] {
  const read = () => (new URLSearchParams(location.search).get("variant") ?? "A") as Variant;
  const [v, setV] = useState<Variant>(read);
  const pick = (next: Variant) => {
    const u = new URL(location.href);
    u.searchParams.set("variant", next);
    history.replaceState(null, "", u);
    setV(next);
  };
  const step = (d: 1 | -1) => {
    const i = VARIANTS.findIndex(([k]) => k === v);
    pick(VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length][0]);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.stopPropagation();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  return [v, step, pick];
}

function Switcher({ v, step, pick }: { v: Variant; step: (d: 1 | -1) => void; pick: (v: Variant) => void }) {
  return (
    <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-1 py-1 text-xs text-background shadow-xl">
      <button
        type="button"
        aria-label="Previous variant"
        className="rounded-full p-1 hover:bg-background/20"
        onClick={() => step(-1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <select
        aria-label="Variant"
        value={v}
        onChange={(e) => pick(e.target.value)}
        className="cursor-pointer bg-transparent px-1 font-semibold outline-none"
      >
        {VARIANTS.map(([k, n]) => (
          <option key={k} value={k} className="text-foreground">
            {k} ({n})
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="Next variant"
        className="rounded-full p-1 hover:bg-background/20"
        onClick={() => step(1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function BandLabel({ b, className }: { b: Band; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-2 text-xs", className)}>
      <span className="font-semibold text-foreground">{b.label}</span>
      {b.repo && <span className="font-mono text-muted-foreground">{b.repo}</span>}
      <span className="text-muted-foreground">
        root <span className="font-mono">{b.root}</span> · {b.graph.nodes.length} PRs · {openCount(b.graph)} open ·{" "}
        {b.graph.anomalies.length} anomalies
      </span>
    </div>
  );
}

export function BandCanvas({ b }: { b: Band }) {
  return (
    <ReviewPrs value={b.review}>
      <Canvas graph={b.graph} root={b.root} />
    </ReviewPrs>
  );
}

/** The canvas frame of the real modal. */
export const FRAME =
  "min-h-0 cursor-grab touch-none overflow-auto rounded-md border bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_60%),linear-gradient(315deg,color-mix(in_oklch,var(--status-plan)_6%,var(--background)),var(--background)_50%)] select-none";

/** All bands in one graph, for the shared anomaly and no-PR lists. */
export const merge = (bands: Band[]): PrGraph => ({
  nodes: bands.flatMap((b) => b.graph.nodes),
  branches: [],
  edges: [],
  anomalies: bands.flatMap((b) => b.graph.anomalies.map((a) => ({ ...a, text: `${b.label}: ${a.text}` }))),
  noPr: bands.flatMap((b) => b.graph.noPr),
});

/** The map scope keeps today's data and model. */
export function MapBody({
  head,
  children,
}: {
  head: ThreadNode;
  children: (g: PrGraph, busy: boolean, refresh: () => void) => ReactNode;
}) {
  const [{ data, busy }, refresh] = useMapGraph(head.map!.key!);
  const graph = useMemo(() => buildPrGraph(head, data), [head, data]);
  return <>{children(graph, busy, refresh)}</>;
}

export function RefreshButton({ busy, onClick }: { busy?: boolean; onClick?: () => void }) {
  return (
    <Button className="flex-none" variant="outline" size="sm" disabled={busy} onClick={onClick}>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      Refresh
    </Button>
  );
}

export const scopeName = (scope: string, bands: Band[]) => {
  if (scope === "all") return "All projects";
  const b = bands.find((x) => `project:${x.id}` === scope);
  if (b) return b.label;
  const m = bands.flatMap((x) => x.maps).find((h) => `map:${h.id}` === scope);
  return m ? m.map!.name : scope;
};

/** A: a dropdown next to the title. All stacks the bands down one canvas. No-PR list folds to a count at All. */
function VariantA({ bands, scope, setScope }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const shown = scope === "all" ? bands : bands.filter((b) => `project:${b.id}` === scope);
  const map = bands.flatMap((b) => b.maps).find((h) => `map:${h.id}` === scope);
  const header = (busy?: boolean, refresh?: () => void, sub?: string) => (
    <DialogHeader className="pr-8 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <DialogTitle className="flex items-center gap-2 text-base">
          <GitBranch className="size-4" aria-hidden /> PR graph
        </DialogTitle>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Projects</SelectLabel>
              {bands.map((b) => (
                <SelectItem key={b.id} value={`project:${b.id}`}>
                  {b.label} <span className="text-muted-foreground">· {b.graph.nodes.length}</span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Maps</SelectLabel>
              {bands.flatMap((b) =>
                b.maps.map((h) => (
                  <SelectItem key={h.id} value={`map:${h.id}`}>
                    {h.map!.name} <span className="text-muted-foreground">· {b.label}</span>
                  </SelectItem>
                )),
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="flex-1" />
        <RefreshButton busy={busy} onClick={refresh} />
      </div>
      <DialogDescription>{sub}</DialogDescription>
    </DialogHeader>
  );
  if (map)
    return (
      <MapBody head={map}>
        {(g, busy, refresh) => (
          <>
            {header(busy, refresh, `${g.nodes.length} PRs · ${openCount(g)} open`)}
            <Legend />
            <div ref={box} onPointerDown={pan} className={FRAME}>
              <Canvas graph={g} />
            </div>
            <Lists graph={g} box={box} />
          </>
        )}
      </MapBody>
    );
  const all = merge(shown);
  return (
    <>
      {header(false, undefined, `${shown.length} projects · ${all.nodes.length} PRs · ${openCount(all)} open`)}
      <Legend />
      <div ref={box} onPointerDown={pan} className={FRAME}>
        {shown.map((b) => (
          <section key={b.id} className="border-b border-dashed last:border-b-0">
            <BandLabel
              b={b}
              className="sticky top-0 left-0 z-20 w-fit rounded-br-md bg-background/85 px-4 pt-3 pb-1 backdrop-blur"
            />
            <BandCanvas b={b} />
          </section>
        ))}
      </div>
      <Lists graph={all} box={box} noPr={scope !== "all"} />
      {scope === "all" && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {all.noPr.length} threads with no PR. Pick a project to list them.
        </p>
      )}
    </>
  );
}

/** B: tabs under the title, maps after a divider. All puts the bands side by side, one column each. No no-PR list at All. */
function VariantB({ bands, scope, setScope }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const shown = scope === "all" ? bands : bands.filter((b) => `project:${b.id}` === scope);
  const map = bands.flatMap((b) => b.maps).find((h) => `map:${h.id}` === scope);
  const tab = (id: string, text: ReactNode, n?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setScope(id)}
      className={cn(
        "flex flex-none items-center gap-1 border-b-2 px-2 pb-1.5 text-xs",
        scope === id
          ? "border-primary font-semibold text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {text}
      {n !== undefined && <span className="rounded-full bg-muted px-1.5 text-[10px]">{n}</span>}
    </button>
  );
  const header = (busy?: boolean, refresh?: () => void) => (
    <DialogHeader className="gap-2 pr-8 text-left">
      <div className="flex items-center gap-2">
        <DialogTitle className="flex flex-1 items-center gap-2 text-base">
          <GitBranch className="size-4" aria-hidden /> PR graph · {scopeName(scope, bands)}
        </DialogTitle>
        <RefreshButton busy={busy} onClick={refresh} />
      </div>
      <nav className="flex [scrollbar-width:none] items-end gap-1 overflow-x-auto border-b">
        {tab("all", "All", merge(bands).nodes.length)}
        {bands.map((b) => tab(`project:${b.id}`, b.label, b.graph.nodes.length))}
        <span className="mx-1 mb-1.5 h-4 w-px bg-border" />
        {bands.flatMap((b) => b.maps.map((h) => tab(`map:${h.id}`, <>◇ {h.map!.name}</>)))}
      </nav>
      <DialogDescription className="sr-only">PR graph</DialogDescription>
    </DialogHeader>
  );
  if (map)
    return (
      <MapBody head={map}>
        {(g, busy, refresh) => (
          <>
            {header(busy, refresh)}
            <Legend />
            <div ref={box} onPointerDown={pan} className={FRAME}>
              <Canvas graph={g} />
            </div>
            <Lists graph={g} box={box} />
          </>
        )}
      </MapBody>
    );
  const all = merge(shown);
  return (
    <>
      {header()}
      <Legend />
      <div ref={box} onPointerDown={pan} className={cn(FRAME, "flex items-start gap-0")}>
        {shown.map((b) => (
          <section key={b.id} className="flex-none border-r border-dashed last:border-r-0">
            <div className="sticky top-0 z-20 border-b bg-background/85 px-4 py-2 backdrop-blur">
              <div className="text-sm font-semibold">{b.label}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {b.repo ?? "no repo"} · root {b.root}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {b.graph.nodes.length} PRs · {openCount(b.graph)} open · {b.graph.anomalies.length} anomalies
              </div>
            </div>
            <BandCanvas b={b} />
          </section>
        ))}
      </div>
      <Lists graph={all} box={box} noPr={scope !== "all"} />
    </>
  );
}

/** C: a scope sidebar, maps under their project. All folds each band; the no-PR list sits in its band. */
function VariantC({ bands, scope, setScope }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const shown = scope === "all" ? bands : bands.filter((b) => `project:${b.id}` === scope);
  const map = bands.flatMap((b) => b.maps).find((h) => `map:${h.id}` === scope);
  const item = (id: string, text: ReactNode, n?: number, sub = false) => (
    <button
      key={id}
      type="button"
      onClick={() => setScope(id)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted",
        sub && "pl-5 text-muted-foreground",
        scope === id && "bg-muted font-semibold text-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {n !== undefined && <span className="text-[10px] text-muted-foreground">{n}</span>}
    </button>
  );
  const body = (graphBody: ReactNode, busy?: boolean, refresh?: () => void) => (
    <>
      <DialogHeader className="pr-8 text-left">
        <div className="flex items-center gap-2">
          <DialogTitle className="flex flex-1 items-center gap-2 text-base">
            <GitBranch className="size-4" aria-hidden /> PR graph
          </DialogTitle>
          <RefreshButton busy={busy} onClick={refresh} />
        </div>
        <DialogDescription className="sr-only">PR graph</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 grid-cols-[180px_minmax(0,1fr)] gap-3">
        <nav className="min-h-0 overflow-auto border-r pr-2">
          {item("all", "All projects", merge(bands).nodes.length)}
          <div className="my-1.5 border-t" />
          {bands.map((b) => (
            <div key={b.id}>
              {item(`project:${b.id}`, b.label, b.graph.nodes.length)}
              {b.maps.map((h) => item(`map:${h.id}`, `◇ ${h.map!.name}`, undefined, true))}
            </div>
          ))}
        </nav>
        <div className="flex min-h-0 flex-col gap-2">{graphBody}</div>
      </div>
    </>
  );
  if (map)
    return (
      <MapBody head={map}>
        {(g, busy, refresh) =>
          body(
            <>
              <Legend />
              <div ref={box} onPointerDown={pan} className={cn(FRAME, "flex-1")}>
                <Canvas graph={g} />
              </div>
              <Lists graph={g} box={box} />
            </>,
            busy,
            refresh,
          )
        }
      </MapBody>
    );
  return body(
    <>
      <Legend />
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {shown.map((b) => (
          <details key={b.id} open={shown.length === 1 || b.graph.nodes.length > 0} className="rounded-md border">
            <summary className="cursor-pointer px-3 py-2">
              <BandLabel b={b} className="inline-flex" />
            </summary>
            <div ref={box} onPointerDown={pan} className={cn(FRAME, "rounded-none border-x-0 border-b-0")}>
              <BandCanvas b={b} />
            </div>
            {b.graph.noPr.length > 0 && (
              <details className="border-t px-3 py-1.5 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  {b.graph.noPr.length} threads with no PR
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {b.graph.noPr.map((t) => (
                    <li key={t.id} className="flex items-center gap-1.5">
                      <StatusMark thread={t} />
                      <a href={t.href} className="truncate hover:underline">
                        {t.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </details>
        ))}
      </div>
      <Lists graph={merge(shown)} box={box} noPr={false} />
    </>,
  );
}

export type Props = { bands: Band[]; scope: string; setScope: (s: string) => void };

/** PROTOTYPE entry. `start` is "all" or "map:<head id>". */
export function ScopedGraphDialog({
  projects,
  start,
  onOpenChange,
}: {
  projects: Group[];
  start: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [v, step, pick] = useVariant();
  const [scope, setScope] = useState(start);
  const bands = useMemo(() => projects.filter((g) => g.kind === "project").map(bandOf), [projects]);
  const View = (VARIANTS.find(([k]) => k === v) ?? VARIANTS[0])[2];
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[min(860px,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] gap-3 sm:max-w-[1200px]",
          v === "C" ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_auto_minmax(0,1fr)_auto]",
        )}
      >
        <View bands={bands} scope={scope} setScope={setScope} />
        <Switcher v={v} step={step} pick={pick} />
      </DialogContent>
    </Dialog>
  );
}
