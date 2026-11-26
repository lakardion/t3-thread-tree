/** Throwaway PR graph layouts for the existing map modal. Select one with ?graph=D, E or F. */
import { ChevronDown, GitBranch, Layers } from "lucide-react";
import { type ComponentType, lazy, Suspense, useState } from "react";

import { cn } from "@/lib/utils";

import type { EdgeKind, Node, Slot } from "./prototype-pr-graph.tsx";

type Graph = typeof import("./prototype-pr-graph.tsx");

const edgeNames: Record<EdgeKind, string> = {
  stack: "GitHub stack",
  virtual: "Plain base",
  main: "Branch base",
  dim: "Closed or merged",
};

function EdgeSample({ kind, stroke }: { kind: EdgeKind; stroke: Graph["EDGE"] }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" className="shrink-0">
      <path d="M0 4H22" strokeWidth="2" className={stroke[kind]} />
    </svg>
  );
}

function EdgeKey({ stroke }: { stroke: Graph["EDGE"] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {(Object.keys(edgeNames) as EdgeKind[]).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <EdgeSample kind={kind} stroke={stroke} />
          {edgeNames[kind]}
        </span>
      ))}
    </div>
  );
}

function ThreadLink({ node, t3 }: { node: Node; t3: Graph["t3"] }) {
  return node.thread ? (
    <a href={t3(node.thread.id)} title={node.thread.title} className="shrink-0 underline-offset-2 hover:underline">
      T3 thread
    </a>
  ) : (
    <span className="shrink-0 text-muted-foreground">No thread</span>
  );
}

function BaseBranch({ slot }: { slot: Slot }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs font-semibold">
      <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate" title={slot.label}>
        {slot.label}
      </span>
    </span>
  );
}

function laneOf(slot: Slot, slots: Slot[]) {
  if (slot.id === "main") return "Branches";
  const owner = slot.node ?? slots.find((candidate) => candidate.node?.base === slot.label)?.node;
  const stack = owner?.stack?.num;
  const mate =
    stack === undefined
      ? undefined
      : slots.find((candidate) => candidate.node?.stack?.num === stack && candidate.node.lane);
  const lane = owner?.lane ?? mate?.node?.lane;
  return lane ? `L${lane}` : "Unassigned";
}

const laneStep = 184;
const laneRow = 72;
const laneGutter = 78;
const depthHeader = 30;
const tileWidth = 156;

export function VariantD({ graph }: { graph: Graph }) {
  const { Bang, EDGE, edgeKind, layout, Lists, parentOf, PrLink, STATE_TONE, t3 } = graph;
  const [focusedLane, setFocusedLane] = useState<string>();
  const { slots, cols } = layout();
  const byLane = Map.groupBy(slots, (slot) => laneOf(slot, slots));
  const coords = new Map<string, { x: number; y: number; lane: string }>();
  let top = depthHeader;
  const bands: { lane: string; top: number; height: number }[] = [];
  const entries = [...byLane].toSorted(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [lane, members] of entries) {
    const rows = new Map<number, number>();
    for (const slot of members) {
      const row = rows.get(slot.col) ?? 0;
      coords.set(slot.id, { x: laneGutter + slot.col * laneStep, y: top + row * laneRow + laneRow / 2, lane });
      rows.set(slot.col, row + 1);
    }
    const height = Math.max(...rows.values()) * laneRow;
    bands.push({ lane, top, height });
    top += height;
  }
  const width = laneGutter + cols * laneStep;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <EdgeKey stroke={EDGE} />
      <div
        className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card"
        role="region"
        aria-label="PR swimlane graph"
      >
        <div className="relative" style={{ width, height: top }}>
          {Array.from({ length: cols }, (_, col) => (
            <div
              key={col}
              className="absolute top-0 border-b px-2 pt-1.5 text-xs text-muted-foreground"
              style={{ left: laneGutter + col * laneStep, width: laneStep, height: depthHeader }}
            >
              {col === 0 ? "Root" : `Depth ${col}`}
            </div>
          ))}
          {bands.map(({ lane, top: y, height }) => (
            <div key={lane} className="absolute inset-x-0 border-b odd:bg-muted/30" style={{ top: y, height }}>
              <button
                type="button"
                className={cn(
                  "sticky left-0 z-10 flex h-full items-center border-r bg-muted px-2.5 text-xs font-semibold hover:bg-accent",
                  focusedLane === lane && "text-primary",
                )}
                style={{ width: laneGutter - 8 }}
                aria-pressed={focusedLane === lane}
                aria-label={`Highlight ${lane}`}
                onClick={() => setFocusedLane(focusedLane === lane ? undefined : lane)}
              >
                {lane}
              </button>
            </div>
          ))}
          <svg className="pointer-events-none absolute inset-0" width={width} height={top} aria-hidden="true">
            {slots.map((slot) => {
              const base = coords.get(parentOf(slot) ?? "");
              const child = coords.get(slot.id)!;
              if (!base) return null;
              const start = base.x + tileWidth;
              const elbow = start + (child.x - start) / 2;
              return (
                <path
                  key={slot.id}
                  d={`M${start},${base.y}H${elbow}V${child.y}H${child.x}`}
                  fill="none"
                  strokeWidth={focusedLane === child.lane ? 3 : 2}
                  className={cn(EDGE[edgeKind(slot, slots)], focusedLane && child.lane !== focusedLane && "opacity-25")}
                />
              );
            })}
          </svg>
          {slots.map((slot) => {
            const point = coords.get(slot.id)!;
            const node = slot.node;
            return (
              <div
                key={slot.id}
                className={cn(
                  "absolute flex -translate-y-1/2 flex-col justify-center gap-0.5 rounded-md border bg-card px-2 py-1.5 text-[11px]",
                  node?.outside && "border-dashed",
                  focusedLane === point.lane && "border-primary",
                )}
                style={{ top: point.y, left: point.x, width: tileWidth }}
              >
                {node ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <PrLink n={node.n} />
                      <span className={STATE_TONE[node.state]}>{node.state}</span>
                      <Bang p={node} />
                    </div>
                    <div className="truncate font-medium" title={node.title}>
                      {node.key ? `${node.key} · ` : ""}
                      {node.title}
                    </div>
                    <div className="flex justify-between gap-1 text-muted-foreground">
                      <ThreadLink node={node} t3={t3} />
                      {node.outside && <span>Outside map</span>}
                    </div>
                  </>
                ) : (
                  <BaseBranch slot={slot} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Lists className="max-h-[28%] shrink-0 overflow-auto rounded-md border p-2" />
    </div>
  );
}

const logRow = 66;
const trackWidth = 12;

export function VariantE({ graph }: { graph: Graph }) {
  const { Bang, EDGE, edgeKind, layout, Lists, parentOf, PrLink, STATE_TONE, t3 } = graph;
  const { slots, rows } = layout();
  const [traced, setTraced] = useState<string>();
  const positions = new Map(
    slots.map((slot, index) => [slot.id, { x: 8 + slot.row * trackWidth, y: index * logRow + logRow / 2 }]),
  );
  const railWidth = 16 + (rows - 1) * trackWidth;
  const ancestors = new Set<string>();
  let current = slots.find((slot) => slot.id === traced);
  while (current) {
    ancestors.add(current.id);
    current = slots.find((slot) => slot.id === parentOf(current!));
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <EdgeKey stroke={EDGE} />
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <div className="relative">
          <svg
            className="pointer-events-none absolute inset-y-0 left-0 z-10"
            width={railWidth}
            height={slots.length * logRow}
            aria-hidden="true"
          >
            {slots.map((slot) => {
              const base = positions.get(parentOf(slot) ?? "");
              const point = positions.get(slot.id)!;
              if (!base) return null;
              const bend = point.y - 12;
              return (
                <path
                  key={slot.id}
                  d={`M${base.x},${base.y}V${bend}L${point.x},${point.y}`}
                  fill="none"
                  strokeWidth={ancestors.has(slot.id) ? 3 : 1.5}
                  className={cn(EDGE[edgeKind(slot, slots)], traced && !ancestors.has(slot.id) && "opacity-30")}
                />
              );
            })}
            {slots.map((slot) => {
              const point = positions.get(slot.id)!;
              return (
                <circle
                  key={slot.id}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  strokeWidth="2"
                  className={cn("fill-card", ancestors.has(slot.id) ? "stroke-primary" : "stroke-muted-foreground")}
                />
              );
            })}
          </svg>
          <ol className="divide-y bg-card">
            {slots.map((slot) => {
              const node = slot.node;
              return (
                <li
                  key={slot.id}
                  style={{ height: logRow, paddingLeft: railWidth + 5 }}
                  className={cn(
                    "flex min-w-0 flex-col justify-center gap-1 pr-2 text-xs",
                    traced === slot.id && "bg-primary/10",
                  )}
                >
                  {node ? (
                    <>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button
                          type="button"
                          title={`Trace bases of ${node.title}`}
                          aria-pressed={traced === slot.id}
                          onClick={() => setTraced(traced === slot.id ? undefined : slot.id)}
                          className="min-w-0 truncate text-left font-semibold underline-offset-2 hover:underline"
                        >
                          {node.title}
                        </button>
                        <Bang p={node} />
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
                        <PrLink n={node.n} />
                        <span className={STATE_TONE[node.state]}>{node.state}</span>
                        <ThreadLink node={node} t3={t3} />
                        <span className="text-muted-foreground">
                          {node.outside ? "Outside map" : laneOf(slot, slots)}
                        </span>
                        {node.stack && (
                          <span className="text-muted-foreground">
                            {node.stack.pos}/{node.stack.of}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <BaseBranch slot={slot} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <Lists className="border-t p-3" />
      </div>
    </div>
  );
}

export function VariantF({ graph }: { graph: Graph }) {
  const { ANOMALIES, Bang, EDGE, edgeKind, layout, Lists, PrLink, STATE_TONE, t3 } = graph;
  const { slots } = layout();
  const branchSlots = slots.filter((slot) => !slot.node);
  const groups = Map.groupBy(
    slots.flatMap((slot) => (slot.node ? [slot.node] : [])),
    (node) => node.stack?.num,
  );
  const orderedGroups = [...groups].toSorted(([a], [b]) => (a ?? Infinity) - (b ?? Infinity));
  const [onlyAnomalies, setOnlyAnomalies] = useState(false);

  return (
    <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {branchSlots.map((slot) => (
            <BaseBranch key={slot.id} slot={slot} />
          ))}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            className="accent-primary"
            checked={onlyAnomalies}
            onChange={(event) => setOnlyAnomalies(event.target.checked)}
          />
          PRs with anomalies ({new Set(ANOMALIES.map((a) => a.n)).size})
        </label>
      </div>
      {orderedGroups.map(([stack, group]) => {
        const nodes = group
          .filter((node) => !onlyAnomalies || node.anomalies.length)
          .toSorted((a, b) => (a.stack?.pos ?? 0) - (b.stack?.pos ?? 0));
        if (!nodes.length) return null;
        return (
          <details key={stack ?? "unstacked"} open className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
              <Layers className="size-4 text-primary" aria-hidden="true" />
              {stack === undefined ? "PRs outside a stack" : `GitHub stack #${stack}`}
              <span className="ml-auto text-xs font-normal text-muted-foreground">{nodes.length} PRs</span>
              <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="divide-y border-t">
              {nodes.map((node) => {
                const slot = slots.find((s) => s.node === node)!;
                const kind = edgeKind(slot, slots);
                return (
                  <li
                    key={node.n}
                    className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.4fr)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        {node.stack && (
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {node.stack.pos}/{node.stack.of}
                          </span>
                        )}
                        <span className="font-semibold">{node.title}</span>
                        <Bang p={node} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <PrLink n={node.n} />
                        <span className={STATE_TONE[node.state]}>{node.state}</span>
                        <ThreadLink node={node} t3={t3} />
                        <span className="text-muted-foreground">
                          {node.outside ? "Outside the map" : laneOf(slot, slots)}
                        </span>
                      </div>
                      {onlyAnomalies &&
                        node.anomalies.map((anomaly) => (
                          <div key={anomaly} className="mt-1 text-destructive">
                            {anomaly}
                          </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 self-start text-muted-foreground sm:justify-end">
                      <EdgeSample kind={kind} stroke={EDGE} />
                      <span>Base</span>
                      {typeof node.base === "number" ? (
                        <PrLink n={node.base} />
                      ) : (
                        <span className="font-mono">{node.base}</span>
                      )}
                      <span className="text-[11px]">· {edgeNames[kind]}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      <Lists className="rounded-lg border p-3" />
    </div>
  );
}

function withGraph(View: ComponentType<{ graph: Graph }>) {
  const LoadedView = lazy(async () => {
    const graph = await import("./prototype-pr-graph.tsx");
    return { default: () => <View graph={graph} /> };
  });
  return function GraphVariant() {
    return (
      <Suspense
        fallback={
          <p role="status" className="text-sm text-muted-foreground">
            Loading PR graph…
          </p>
        }
      >
        <LoadedView />
      </Suspense>
    );
  };
}

export const SOL_VARIANTS: readonly (readonly [string, string, ComponentType])[] = [
  ["D", "Swimlanes", withGraph(VariantD)],
  ["E", "Branch Log", withGraph(VariantE)],
  ["F", "Stack Index", withGraph(VariantF)],
];
