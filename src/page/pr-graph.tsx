import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  FolderGit2,
  GitBranch,
  LoaderCircle,
  Map as MapIcon,
  RefreshCw,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
  type SyntheticEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { parseScope, type PrGraphData } from "../shared/pr-graph-data.ts";
import {
  type Anomaly,
  bandRoot,
  buildPrGraph,
  type Edge,
  branchKey,
  focusOf,
  GY,
  type GraphNode,
  type GraphThread,
  NH,
  pileLift,
  PILE_GAP,
  type PrGraph,
  walk,
} from "../shared/pr-graph.ts";
import type { Group, Status } from "../shared/tree.ts";
import {
  bandMates,
  bandsOf,
  GRAPH_SORTS,
  type GraphSort,
  type MapEntry,
  mapsOf,
  sortBands,
  treeOrder,
} from "./graph-scope.ts";
import type { Orders } from "./order.ts";
import { oneOf, usePref } from "./prefs.ts";
import { ProjectIcon } from "./project-icon.tsx";
import { STATUS } from "./status-icon.tsx";

/** Opens the PR graph of a scope: `all`, `project:<id>` or `map:<key>`. */
export const OpenGraph = createContext<(scope: string) => void>(() => {});

const NW = 210;
const GX = 44;
const PAD = 16;
const MAIN_W = 64;

/** The width of the root pill: it grows with the branch name, up to a card. */
const rootWidth = (root: string) => Math.min(NW, Math.max(MAIN_W, Math.ceil(root.length * 7.5) + 26));

const EDGE: Record<Edge["kind"], string> = {
  stack: "stroke-primary",
  base: "stroke-status-needs-input [stroke-dasharray:5_4]",
  main: "stroke-muted-foreground",
  dim: "stroke-border",
};

const EDGE_LEGEND: [Edge["kind"], string][] = [
  ["stack", "gh stack"],
  ["base", "plain base"],
  ["main", "base root"],
  ["dim", "closed or merged"],
];

const stateOf = (n: GraphNode) => (n.draft && n.state === "open" ? "draft" : n.state);
const tone = (n: GraphNode) =>
  n.draft && n.state === "open"
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

type Slot = { scope: string; data: PrGraphData | null; busy: boolean; down: boolean };
const fresh = (scope: string): Slot => ({ scope, data: null, busy: true, down: false });

/** The slow part of the graph of a scope. A failed read keeps the last answer. A new scope starts empty. */
function useGraphData(scope: string) {
  const [slot, setSlot] = useState(() => fresh(scope));
  const state = slot.scope === scope ? slot : fresh(scope);
  const ctl = useRef<AbortController | null>(null);
  const run = useCallback(
    (refresh: boolean) => {
      ctl.current?.abort();
      const c = (ctl.current = new AbortController());
      fetch(`/pr-graph?scope=${encodeURIComponent(scope)}${refresh ? "&refresh=1" : ""}`, { signal: c.signal })
        .then((r) => (r.ok ? (r.json() as Promise<PrGraphData>) : Promise.reject(new Error(String(r.status)))))
        .then(
          (data) => setSlot({ scope, data, busy: false, down: false }),
          () => {
            if (!c.signal.aborted)
              setSlot((s) => ({ ...(s.scope === scope ? s : fresh(scope)), busy: false, down: true }));
          },
        );
    },
    [scope],
  );
  useEffect(() => {
    run(false);
    return () => ctl.current?.abort();
  }, [run]);
  const refresh = () => {
    setSlot((s) => ({ ...(s.scope === scope ? s : fresh(scope)), busy: true }));
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

function Legend({ lanes }: { lanes: boolean }) {
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
      {lanes && <span>L lane</span>}
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
  lane,
}: {
  n: GraphNode;
  texts: string[];
  style?: CSSProperties;
  className?: string;
  /** The lane that hover focuses; a card in a pile leaves it to the pile. */
  lane?: string | null;
}) {
  const { x, y } = place(n.col, n.row);
  return (
    <div
      data-pr={n.id}
      data-lane={lane ?? undefined}
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
          {n.viaReview && <span className="rounded bg-muted px-1 font-sans text-[10px]">review</span>}
          {n.outside ? (
            <span className="rounded bg-muted px-1 font-sans text-[10px]">{n.outside}</span>
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

/** Merged stack members on one spot: a deck that fans out on hover, in stack order, centered on the deck. */
function MergedPile({
  pile,
  texts,
  className,
  lane,
}: {
  pile: GraphNode[];
  texts: (n: GraphNode) => string[];
  className?: string;
  lane: string | null;
}) {
  const { x, y } = place(pile[0].col, pile[0].row);
  const step = NH + PILE_GAP;
  return (
    <div
      style={
        {
          left: x,
          top: y,
          width: NW,
          "--open": `${pile.length * step - PILE_GAP}px`,
          "--shift": `0 ${-pileLift(pile[0].row, pile.length)}px`,
        } as CSSProperties
      }
      data-lane={lane ?? undefined}
      className={cn(
        "group/pile absolute h-[92px] transition-[height,translate,opacity] before:pointer-events-none before:absolute before:-inset-2.5 before:rounded-xl before:bg-background/40 before:opacity-0 before:shadow-[0_0_48px_12px_rgb(0_0_0/0.55)] before:ring-2 before:ring-pr-merged/60 before:backdrop-blur-sm before:transition-opacity hover:z-10 hover:h-(--open) hover:[translate:var(--shift)] hover:before:opacity-100 motion-reduce:transition-none",
        className,
      )}
    >
      {pile.map((n, i) => {
        const d = Math.min(pile.length - 1 - i, 3) * 5;
        return (
          <NodeCard
            key={n.id}
            n={n}
            texts={texts(n)}
            style={{ left: 0, top: 0, "--c": `${d}px ${-d}px`, "--e": `0 ${i * step}px` } as CSSProperties}
            className="[translate:var(--c)] border-pr-merged/40 opacity-100 brightness-75 transition-[translate,filter] group-hover/pile:[translate:var(--e)] group-hover/pile:border-border group-hover/pile:brightness-100 motion-reduce:transition-none"
          />
        );
      })}
      <span className="absolute -right-2 -bottom-2 z-10 rounded-full border border-pr-merged/50 bg-card px-1.5 font-sans text-[10px] font-semibold text-pr-merged shadow-md transition-opacity group-hover/pile:opacity-0">
        {pile.length} merged
      </span>
    </div>
  );
}

function Pill({ branch, col, row, width }: { branch: string; col: number; row: number; width?: number }) {
  const { x, y } = place(col, row);
  return (
    <div
      style={{
        left: x,
        top: y + NH / 2 - 14,
        height: 28,
        width: width ?? NW,
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
  /** The lane of the hovered card: other lanes dim. */
  const [lane, setLane] = useState<string | null>(null);
  const dim = (l: string | null) => lane !== null && l !== lane && "opacity-25";
  const focusLane = (e: SyntheticEvent) => {
    const l = (e.target as HTMLElement).closest<HTMLElement>("[data-lane]")?.dataset.lane;
    setLane(l ?? null);
  };
  const anomalyTexts = (n: GraphNode) => graph.anomalies.filter((a) => a.prs.includes(n.id)).map((a) => a.text);
  const spot = new Map<string, { col: number; row: number }>([
    ["root", { col: 0, row: 0 }],
    ...graph.nodes.map((n) => [n.id, n] as const),
    ...graph.branches.map((b) => [`b:${branchKey(b)}`, b] as const),
  ]);
  const at = (e: Edge["from"] | Edge["to"]) => spot.get(typeof e === "string" ? e : `b:${branchKey(e)}`)!;
  const cols = Math.max(0, ...[...spot.values()].map((s) => s.col)) + 1;
  const rows = Math.max(0, ...[...spot.values()].map((s) => s.row)) + 1;
  const rootW = rootWidth(graph.root);
  const w = 2 * PAD + cols * NW + (cols - 1) * GX;
  const h = 2 * PAD + rows * NH + (rows - 1) * GY;
  return (
    <div
      className="relative"
      style={{ width: w, height: h }}
      onMouseOver={focusLane}
      onFocus={focusLane}
      onMouseLeave={() => setLane(null)}
      onBlur={() => setLane(null)}
    >
      <svg width={w} height={h} className="absolute inset-0" aria-hidden>
        {graph.edges.map((e, i) => {
          const a = at(e.from);
          const b = at(e.to);
          const x1 = place(a.col, a.row).x + (e.from === "root" ? rootW : NW);
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
              className={cn(EDGE[e.kind], "transition-opacity", dim(focusOf(graph, e.to)))}
            />
          );
        })}
      </svg>
      <Pill branch={graph.root} col={0} row={0} width={rootW} />
      {graph.branches.map((b) => (
        <Pill key={branchKey(b)} {...b} />
      ))}
      {Object.values(Object.groupBy(graph.nodes, (n) => `${n.col},${n.row}`)).map((pile = []) => {
        if (pile.length < 2)
          return (
            <NodeCard
              key={pile[0].id}
              n={pile[0]}
              texts={anomalyTexts(pile[0])}
              className={cn("transition-opacity", dim(focusOf(graph, pile[0].id)))}
              lane={focusOf(graph, pile[0].id)}
            />
          );
        const sorted = pile.toSorted((a, b) => a.stack!.pos - b.stack!.pos);
        const focus = focusOf(graph, sorted.at(-1)!.id);
        return (
          <MergedPile
            key={pile[0].id}
            pile={sorted}
            texts={anomalyTexts}
            className={dim(focus) || undefined}
            lane={focus}
          />
        );
      })}
    </div>
  );
}

/** `noPr` is the list of the threads with no PR, or only their count at All. */
function Lists({
  anomalies,
  noPr,
  box,
}: {
  anomalies: Anomaly[];
  noPr: GraphThread[] | number;
  box: RefObject<HTMLDivElement | null>;
}) {
  const noPrCount = typeof noPr === "number" ? noPr : noPr.length;
  const jump = (id: string) => {
    const el = box.current?.querySelector<HTMLElement>(`[data-pr="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center", inline: "center" });
    el?.focus({ preventScroll: true });
  };
  return (
    <details className="flex-none text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-muted-foreground">
        <AlertTriangle className="size-3.5" aria-hidden /> {anomalies.length}{" "}
        {anomalies.length === 1 ? "anomaly" : "anomalies"} · {noPrCount} {noPrCount === 1 ? "thread" : "threads"} with
        no PR
      </summary>
      <div className="mt-2 grid max-h-[calc(min(860px,100dvh-2rem)*0.3)] grid-rows-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <section className="min-h-0 overflow-auto">
          <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-muted-foreground">
            <AlertTriangle className="size-3.5" aria-hidden /> Anomalies
          </h3>
          {anomalies.length === 0 ? (
            <p className="text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {anomalies.map((a, i) => (
                <li key={i}>
                  {a.text}{" "}
                  {a.prs.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => jump(id)}
                      className="mr-1 font-mono text-primary hover:underline"
                    >
                      {id.slice(id.lastIndexOf("#"))}
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="min-h-0 overflow-auto">
          <h3 className="mb-1.5 font-semibold text-muted-foreground">Threads with no PR</h3>
          {typeof noPr === "number" ? (
            <p className="text-muted-foreground">
              {noPr} {noPr === 1 ? "thread" : "threads"} with no PR. Pick a project to list them.
            </p>
          ) : noPr.length === 0 ? (
            <p className="text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1">
              {noPr.map((t) => (
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
    </details>
  );
}

const openCount = (g: PrGraph) => g.nodes.filter((n) => n.state === "open").length;

/** The scope picker: a searchable list of All, the projects with a band and the maps. */
function ScopePicker({
  scope,
  setScope,
  projects,
  maps,
}: {
  scope: string;
  setScope: (scope: string) => void;
  projects: { id: string; label: string; prs: number }[];
  maps: MapEntry[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const pick = (s: string) => {
    setScope(s);
    setOpen(false);
  };
  const mark = (s: string) => <Check className={cn("ml-auto", s !== scope && "invisible")} aria-hidden />;
  const p = projects.find((x) => `project:${x.id}` === scope);
  const m = maps.find((x) => `map:${x.key}` === scope);
  const icon = p?.label ?? m?.project.label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="Scope"
          className="w-56 justify-between font-normal"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {icon && <ProjectIcon name={icon} />}
            <span className="truncate">{p?.label ?? m?.name ?? "All projects"}</span>
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent id={listId} align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Find a project or map" />
          <CommandList>
            <CommandEmpty>No scope matches</CommandEmpty>
            <CommandGroup>
              <CommandItem value="all" keywords={["All projects"]} onSelect={() => pick("all")}>
                All projects
                {mark("all")}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup
              heading={
                <span className="flex items-center gap-1.5">
                  <FolderGit2 className="size-3.5" aria-hidden /> Projects
                </span>
              }
            >
              {projects.map((x) => (
                <CommandItem
                  key={x.id}
                  value={`project:${x.id}`}
                  keywords={[x.label]}
                  onSelect={() => pick(`project:${x.id}`)}
                >
                  <ProjectIcon name={x.label} />
                  {x.label} <span className="text-muted-foreground">· {x.prs}</span>
                  {mark(`project:${x.id}`)}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup
              heading={
                <span className="flex items-center gap-1.5">
                  <MapIcon className="size-3.5" aria-hidden /> Maps
                </span>
              }
            >
              {maps.map((x) => (
                <CommandItem
                  key={x.key}
                  value={`map:${x.key}`}
                  keywords={[x.name, x.project.label]}
                  onSelect={() => pick(`map:${x.key}`)}
                >
                  <ProjectIcon name={x.project.label} />
                  <span className="truncate">{x.name}</span>
                  {mark(`map:${x.key}`)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The PR graph of a scope: `all`, `project:<id>` or `map:<key>`. `projects` is the raw tree, so every member counts.
 * `orders` and `pins` give the Tree order sort.
 */
export function PrGraphDialog({
  projects,
  orders,
  pins,
  scope: wanted,
  setScope,
  onOpenChange,
}: {
  projects: Group[];
  orders: Orders;
  pins: ReadonlySet<string>;
  scope: string;
  setScope: (scope: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [sort, setSort] = usePref("thread-tree:graph-sort", oneOf(GRAPH_SORTS, "title"));
  const bands = useMemo(() => bandsOf(projects), [projects]);
  const maps = useMemo(() => mapsOf(projects), [projects]);
  const parsed = parseScope(wanted);
  const map = parsed?.kind === "map" ? maps.find((m) => m.key === parsed.key) : undefined;
  const gone =
    !parsed ||
    (parsed.kind === "map" && !map) ||
    (parsed.kind === "project" && !bands.some((b) => b.id === parsed.id && b.members.length > 0));
  const scope = gone ? "all" : wanted;
  useEffect(() => {
    if (gone) setScope("all");
  }, [gone, setScope]);
  const [{ data, busy, down }, refresh] = useGraphData(scope);
  const projectId = parsed?.kind === "project" && !gone ? parsed.id : null;
  const built = useMemo(
    () =>
      bands
        .filter((b) => b.members.length > 0)
        .map((b) => {
          const prs = b.members.flatMap((m) => m.prs);
          const mates = bandMates(data?.mates ?? [], prs);
          const graph = buildPrGraph(
            b.id === projectId ? b.threads : b.members,
            bandRoot(data?.roots[b.id], prs),
            data && { ...data, mates },
          );
          return { ...b, graph, open: openCount(graph) };
        })
        .filter((b) => b.graph.nodes.length > 0),
    [bands, data, projectId],
  );
  const sorted = sortBands(built, sort, (b) => b.open, treeOrder(orders, pins));
  const shown = map ? [] : projectId ? sorted.filter((b) => b.id === projectId) : sorted;
  const mapGraph = useMemo(() => {
    if (!map) return null;
    const members = walk(map.head);
    const prs = [
      ...members.flatMap((m) => m.prs),
      ...(data?.map?.rows ?? []),
      ...(data?.map?.settled ?? []).flatMap((s) => s.prs),
    ];
    return buildPrGraph(members, bandRoot(Object.values(data?.roots ?? {})[0], prs), data);
  }, [map, data]);
  const graphs = mapGraph ? [mapGraph] : shown.map((b) => b.graph);
  const all = scope === "all";
  const prCount = graphs.reduce((n, g) => n + g.nodes.length, 0);
  const openPrs = graphs.reduce((n, g) => n + openCount(g), 0);
  const anomalies =
    mapGraph?.anomalies ??
    shown.flatMap((b) => b.graph.anomalies.map((a) => (all ? { ...a, text: `${b.label}: ${a.text}` } : a)));
  const noPr = all
    ? bands.reduce((n, b) => n + b.threads.filter((t) => t.prs.length === 0).length, 0)
    : ((mapGraph ?? shown[0]?.graph)?.noPr ?? []);
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
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="flex flex-none items-center gap-2 text-base">
              <GitBranch className="size-4 flex-none" aria-hidden />
              PR graph
            </DialogTitle>
            <ScopePicker
              scope={scope}
              setScope={setScope}
              projects={sorted.map((b) => ({ id: b.id, label: b.label, prs: b.graph.nodes.length }))}
              maps={maps.filter((m) => m.hasPrs || m.key === map?.key)}
            />
            {all && (
              <Select value={sort} onValueChange={(v) => setSort(v as GraphSort)}>
                <SelectTrigger size="sm" className="w-40" aria-label="Sort projects">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="open">Most open PRs</SelectItem>
                  <SelectItem value="tree">Tree order</SelectItem>
                </SelectContent>
              </Select>
            )}
            <span className="flex-1" />
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
            {all && `${shown.length} projects · `}
            {prCount} PRs · {openPrs} open
          </DialogDescription>
          {busy && !data && <p className="text-xs text-muted-foreground">Loading PRs from GitHub…</p>}
          {data?.map?.errors.map((e) => (
            <p key={e.key} className="text-xs text-muted-foreground">
              Could not read PRs for {e.key}: {e.text} · {retry}
            </p>
          ))}
          {down && <p className="text-xs text-muted-foreground">Could not read PRs from T3 · {retry}</p>}
        </DialogHeader>
        <Legend lanes={!!map} />
        <div
          ref={box}
          onPointerDown={pan}
          className="min-h-0 cursor-grab touch-none [scrollbar-width:none] overflow-auto rounded-md border bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_60%),linear-gradient(315deg,color-mix(in_oklch,var(--status-plan)_6%,var(--background)),var(--background)_50%)] select-none [&::-webkit-scrollbar]:hidden"
        >
          <div className="w-max min-w-full">
            {mapGraph ? (
              <Canvas graph={mapGraph} />
            ) : (
              shown.map((b, i) => (
                <section key={b.id} className={cn(i < shown.length - 1 && "border-b border-dashed")}>
                  <div className="sticky top-0 left-0 z-20 flex w-fit items-baseline gap-2 rounded-br-md bg-background/85 px-4 pt-3 pb-1 text-xs backdrop-blur">
                    <span className="flex items-center gap-1.5 self-center font-semibold text-foreground">
                      <ProjectIcon name={b.label} /> {b.label}
                    </span>
                    {b.graph.nodes[0] && (
                      <span className="font-mono text-muted-foreground">{b.graph.nodes[0].repository}</span>
                    )}
                    <span className="text-muted-foreground">
                      root <span className="font-mono">{b.graph.root}</span> · {b.graph.nodes.length} PRs · {b.open}{" "}
                      open · {b.graph.anomalies.length} anomalies
                    </span>
                  </div>
                  <Canvas graph={b.graph} />
                </section>
              ))
            )}
          </div>
        </div>
        <Lists anomalies={anomalies} noPr={noPr} box={box} />
      </DialogContent>
    </Dialog>
  );
}
