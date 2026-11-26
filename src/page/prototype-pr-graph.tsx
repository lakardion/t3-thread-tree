/**
 * PROTOTYPE, throwaway: the PR graph modal of a map, three variants on fixture data. Pick one with `?graph=A|B|C`
 * or the bar at the bottom of the open modal, or the ← → keys.
 */
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, GitBranch, Layers } from "lucide-react";
import { useEffect, useState, type PointerEvent } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { Status } from "../shared/tree.ts";
import { SOL_VARIANTS } from "./prototype-pr-graph-sol.tsx";
import { STATUS } from "./status-icon.tsx";

export type Thread = { id: string; title: string; status: Status };
export type Node = {
  n: number;
  key: string | null;
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  conflicting?: boolean;
  branch: string;
  /** `main`, a PR number, or a foreign branch name. */
  base: "main" | number | string;
  stack?: { num: number; pos: number; of: number };
  lane?: number;
  outside?: boolean;
  thread?: Thread;
  anomalies: string[];
};

export const gh = (n: number) => `https://github.com/acme/storefront/pull/${n}`;
const th = (id: string, title: string, status: Status): Thread => ({ id, title, status });
export const t3 = (id: string) => `t3code://threads/demo/${id}`;

export const NODES: Node[] = [
  { n: 2099, key: "DS-100", title: "Add the new color tokens", state: "merged", branch: "ds-100-tokens", base: "main", stack: { num: 87, pos: 1, of: 5 }, lane: 1, thread: th("m2", "Migrate Dialog to the new tokens", "done"), anomalies: [] },
  { n: 2101, key: "DS-101", title: "Migrate Button", state: "open", branch: "ds-101-button", base: "main", stack: { num: 87, pos: 2, of: 5 }, lane: 1, thread: th("m1", "Migrate Button to the new tokens", "working"), anomalies: [] },
  { n: 2102, key: "DS-102", title: "Migrate Dialog", state: "open", branch: "ds-102-dialog", base: 2101, stack: { num: 87, pos: 3, of: 5 }, lane: 1, thread: th("m2", "Migrate Dialog to the new tokens", "done"), anomalies: ["Needs a rebase: #2101 moved."] },
  { n: 2104, key: "DS-103", title: "Migrate Tooltip", state: "draft", branch: "ds-103-tooltip", base: 2102, stack: { num: 87, pos: 4, of: 5 }, lane: 1, thread: th("m3", "Migrate Tooltip to the new tokens", "snoozed"), anomalies: [] },
  { n: 2110, key: null, title: "Fix lint after the Tooltip move", state: "open", branch: "fix-lint-tooltip", base: 2104, stack: { num: 87, pos: 5, of: 5 }, outside: true, anomalies: ["Open PR with no thread."] },
  { n: 2107, key: "DS-110", title: "Migrate Popover", state: "open", conflicting: true, branch: "ds-110-popover", base: "main", lane: 2, thread: th("m4", "Migrate Popover to the new tokens", "idle"), anomalies: ["Conflicts with main."] },
  { n: 2108, key: "DS-111", title: "Popover focus ring", state: "open", branch: "ds-111-popover-focus", base: 2107, lane: 2, anomalies: ["Open PR with no thread.", "Two open PRs share base #2107."] },
  { n: 2109, key: "DS-112", title: "Popover arrow size", state: "open", branch: "ds-112-popover-arrow", base: 2107, lane: 2, thread: th("m5", "Popover arrow size", "needs-input"), anomalies: ["Two open PRs share base #2107."] },
  { n: 2105, key: "DS-104", title: "Migrate Menu (old try)", state: "closed", branch: "ds-104-menu", base: "main", lane: 1, anomalies: ["Closed PR with open child #2106."] },
  { n: 2106, key: "DS-105", title: "Menu keyboard", state: "open", branch: "ds-105-menu-keys", base: 2105, lane: 1, thread: th("m6", "Menu keyboard", "working"), anomalies: [] },
  { n: 2120, key: "DS-120", title: "Hotfix the token export", state: "open", branch: "ds-120-hotfix", base: "release/2.4", lane: 3, thread: th("m7", "Hotfix the token export", "failed"), anomalies: ["Base release/2.4 is not main and not a map PR."] },
];
export const NO_PR: Thread[] = [th("m8", "Migrate Select to the new tokens", "working"), th("m9", "Audit icon sizes", "idle")];
export const ANOMALIES = NODES.flatMap((p) => p.anomalies.map((a) => ({ n: p.n, key: p.key, text: a })));

/** Rows by depth-first walk from `main`: the first child keeps its parent's row. Foreign bases become branch nodes. */
export type Slot = { id: string; col: number; row: number; node?: Node; label?: string };
export function layout() {
  const foreign = [...new Set(NODES.map((p) => p.base).filter((b): b is string => typeof b === "string" && b !== "main"))];
  const kids = (id: string) => [
    ...foreign.filter(() => id === "main").map((b) => `b:${b}`),
    ...NODES.filter((p) => (id === "main" ? p.base === "main" : id.startsWith("b:") ? p.base === id.slice(2) : p.base === Number(id))).map((p) => String(p.n)),
  ];
  const slots: Slot[] = [];
  let next = 0;
  const walk = (id: string, col: number, row: number) => {
    slots.push({ id, col, row, node: NODES.find((p) => String(p.n) === id), label: id === "main" ? "main" : id.startsWith("b:") ? id.slice(2) : undefined });
    kids(id).forEach((k, i) => walk(k, col + 1, i === 0 ? row : ++next));
  };
  walk("main", 0, 0);
  return { slots, rows: next + 1, cols: Math.max(...slots.map((s) => s.col)) + 1 };
}
export const parentOf = (s: Slot): string | null => {
  if (s.label === "main") return null;
  if (s.label) return "main";
  const b = s.node!.base;
  return typeof b === "number" ? String(b) : b === "main" ? "main" : `b:${b}`;
};
export type EdgeKind = "stack" | "virtual" | "main" | "dim";
export function edgeKind(s: Slot, slots: Slot[]): EdgeKind {
  const p = s.node;
  if (!p) return "main";
  if (p.state === "merged" || p.state === "closed") return "dim";
  const parent = slots.find((x) => x.id === parentOf(s))?.node;
  if (parent && p.stack && parent.stack?.num === p.stack.num) return "stack";
  if (parent) return "virtual";
  return "main";
}
export const EDGE: Record<EdgeKind, string> = {
  stack: "stroke-primary",
  virtual: "stroke-status-needs-input [stroke-dasharray:5_4]",
  main: "stroke-muted-foreground",
  dim: "stroke-border",
};
export const STATE_TONE: Record<Node["state"], string> = {
  open: "text-status-done-fg",
  draft: "text-muted-foreground",
  merged: "text-pr-merged",
  closed: "text-destructive",
};

export function ThreadMark({ t, label = true }: { t: Thread; label?: boolean }) {
  const S = STATUS[t.status];
  return (
    <a href={t3(t.id)} title={`Open thread in T3: ${t.title}`} className="inline-flex min-w-0 items-center gap-1 hover:underline">
      <S.icon className={cn("size-3 flex-none", S.shape)} aria-hidden />
      {label && <span className="truncate">{t.status}</span>}
    </a>
  );
}
export const PrLink = ({ n }: { n: number }) => (
  <a href={gh(n)} target="_blank" rel="noreferrer" className="font-mono hover:underline" title="Open PR on GitHub">
    #{n}
  </a>
);
export const Bang = ({ p }: { p: Node }) =>
  p.anomalies.length > 0 ? (
    <span title={p.anomalies.join("\n")} className="flex size-4 flex-none items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
      !
    </span>
  ) : null;

export function Legend() {
  const item = (cls: string, text: string) => (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden>
        <line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" className={cls} />
      </svg>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {item(EDGE.stack, "gh stack")}
      {item(EDGE.virtual, "plain base (virtual stack)")}
      {item(EDGE.main, "base main")}
      {item(EDGE.dim, "closed or merged")}
      <span>! anomaly (hover)</span>
      <span>L lane</span>
    </div>
  );
}

export function Lists({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 text-xs sm:grid-cols-2", className)}>
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 font-semibold text-muted-foreground">
          <AlertTriangle className="size-3.5" /> Anomalies ({ANOMALIES.length})
        </h3>
        <ul className="space-y-1">
          {ANOMALIES.map((a, i) => (
            <li key={i}>
              <span className="text-muted-foreground">{a.key ?? "no key"}</span> <PrLink n={a.n} /> {a.text}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-1.5 font-semibold text-muted-foreground">Threads with no PR ({NO_PR.length})</h3>
        <ul className="space-y-1">
          {NO_PR.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5">
              <ThreadMark t={t} label={false} />
              <a href={t3(t.id)} className="hover:underline">{t.title}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Edges in an SVG under absolute-positioned HTML nodes. */
export function Canvas({ nw, nh, gx, gy, Card, sel }: { nw: number; nh: number; gx: number; gy: number; Card: (p: { s: Slot }) => React.ReactNode; sel?: number }) {
  const { slots, rows, cols } = layout();
  const pos = (s: Slot) => ({ x: 16 + s.col * (nw + gx), y: 16 + s.row * (nh + gy) });
  const W = 32 + cols * nw + (cols - 1) * gx;
  const H = 32 + rows * nh + (rows - 1) * gy;
  return (
    <div className="relative" style={{ width: W, height: H }}>
      <svg width={W} height={H} className="absolute inset-0" aria-hidden>
        {slots.map((s) => {
          const parent = slots.find((x) => x.id === parentOf(s));
          if (!parent) return null;
          const a = pos(parent);
          const b = pos(s);
          const x1 = a.x + nw;
          const y1 = a.y + nh / 2;
          const x2 = b.x;
          const y2 = b.y + nh / 2;
          const mx = (x1 + x2) / 2;
          return <path key={s.id} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" strokeWidth={sel === s.node?.n ? 3 : 2} className={EDGE[edgeKind(s, slots)]} />;
        })}
      </svg>
      {slots.map((s) => (
        <div key={s.id} className="absolute" style={{ left: pos(s).x, top: pos(s).y, width: nw, height: nh }}>
          <Card s={s} />
        </div>
      ))}
    </div>
  );
}

export const BranchNode = ({ label }: { label: string }) => (
  <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed bg-muted font-mono text-xs font-semibold">{label}</div>
);
export const dim = (p: Node) => p.state === "merged" || p.state === "closed";

/** A: big canvas, full cards like the skill; lists under the graph. */
/** Drag the empty canvas to pan. A drag that starts on a link or button does not pan. Wheel and trackpad still scroll. */
function pan(e: PointerEvent<HTMLDivElement>) {
  if (e.button !== 0 || (e.target as HTMLElement).closest("a,button")) return;
  const el = e.currentTarget;
  const start = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
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

function VariantA() {
  return (
    <>
      <Legend />
      <div
        onPointerDown={pan}
        className="min-h-0 flex-1 cursor-grab touch-none overflow-auto rounded-md border bg-muted/30 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Canvas
          nw={210}
          nh={96}
          gx={44}
          gy={14}
          Card={({ s }) => {
            const p = s.node;
            if (!p) return <BranchNode label={s.label!} />;
            return (
              <div className={cn("relative flex h-full flex-col gap-0.5 rounded-lg border bg-card p-2 font-mono text-[11px] shadow-sm", dim(p) && "opacity-55", p.outside && "border-dashed", p.state === "draft" && "border-dashed")} title={p.title}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-sans text-xs font-semibold">{p.key ?? "no key"}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {p.outside ? <span className="rounded bg-muted px-1 font-sans text-[10px]">outside the map</span> : p.lane && `L${p.lane}`}
                    <Bang p={p} />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PrLink n={p.n} />
                  <span className={STATE_TONE[p.state]}>{p.state}</span>
                  {p.conflicting && <span className="ml-auto text-destructive">conflicts</span>}
                </div>
                <div className="truncate text-muted-foreground">{p.branch}</div>
                <div className="flex items-center justify-between gap-2 font-sans">
                  <span className="flex items-center gap-1 text-muted-foreground">{p.stack && <><Layers className="size-3" />stack {p.stack.pos}/{p.stack.of}</>}</span>
                  {p.thread ? <ThreadMark t={p.thread} /> : <span className="text-destructive">no thread</span>}
                </div>
              </div>
            );
          }}
        />
      </div>
      <Lists className="max-h-[30%] flex-none overflow-auto" />
    </>
  );
}

/** B: compact pills; click a node to see its detail in a side panel. The panel shows the lists when nothing is picked. */
function VariantB() {
  const [sel, setSel] = useState<number>();
  const p = NODES.find((x) => x.n === sel);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <Legend />
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30" onClick={(e) => e.target === e.currentTarget && setSel(undefined)}>
          <Canvas
            nw={132}
            nh={34}
            gx={36}
            gy={12}
            sel={sel}
            Card={({ s }) => {
              const n = s.node;
              if (!n) return <BranchNode label={s.label!} />;
              const S = n.thread && STATUS[n.thread.status];
              return (
                <button
                  type="button"
                  onClick={() => setSel(n.n === sel ? undefined : n.n)}
                  title={n.title}
                  className={cn("flex h-full w-full items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs shadow-sm hover:bg-accent", dim(n) && "opacity-55", (n.outside || n.state === "draft") && "border-dashed", n.n === sel && "ring-2 ring-ring", n.conflicting && "border-destructive")}
                >
                  {S ? <S.icon className={cn("size-3 flex-none", S.shape)} /> : <span className="size-3 flex-none rounded-full border border-dashed border-destructive" />}
                  <span className="truncate font-semibold">{n.key ?? "—"}</span>
                  <span className={cn("font-mono", STATE_TONE[n.state])}>#{n.n}</span>
                  <span className="ml-auto"><Bang p={n} /></span>
                </button>
              );
            }}
          />
        </div>
      </div>
      <aside className="flex max-h-[40%] flex-none flex-col gap-3 overflow-auto rounded-md border p-3 text-xs md:max-h-none md:w-72">
        {p ? (
          <>
            <div>
              <div className="text-sm font-semibold">{p.key ?? "no key"} · {p.title}</div>
              <div className="font-mono text-muted-foreground">{p.branch}</div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">PR</dt>
              <dd className="flex items-center gap-2"><PrLink n={p.n} /> <span className={STATE_TONE[p.state]}>{p.state}</span> {p.conflicting && <span className="text-destructive">conflicts</span>}</dd>
              <dt className="text-muted-foreground">Base</dt>
              <dd className="font-mono">{typeof p.base === "number" ? `#${p.base}` : p.base}</dd>
              <dt className="text-muted-foreground">Stack</dt>
              <dd>{p.stack ? `#${p.stack.num}, ${p.stack.pos} of ${p.stack.of}` : "none"}</dd>
              <dt className="text-muted-foreground">Lane</dt>
              <dd>{p.outside ? "outside the map" : (p.lane ?? "none")}</dd>
              <dt className="text-muted-foreground">Thread</dt>
              <dd>{p.thread ? <ThreadMark t={p.thread} /> : <span className="text-destructive">no thread</span>}</dd>
            </dl>
            {p.anomalies.length > 0 && (
              <ul className="space-y-1 rounded-md bg-destructive/10 p-2 text-destructive">
                {p.anomalies.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            <div className="flex gap-2">
              <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" href={gh(p.n)} target="_blank" rel="noreferrer">GitHub <ExternalLink className="size-3" /></a>
              {p.thread && <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" href={t3(p.thread.id)}>T3 thread <ExternalLink className="size-3" /></a>}
            </div>
          </>
        ) : (
          <Lists className="sm:grid-cols-1" />
        )}
      </aside>
    </div>
  );
}

/** C: no canvas; an indented outline from `main`, like the stack rail. Anomalies sit inline under each row. */
function VariantC() {
  const { slots } = layout();
  const depth = (s: Slot): number => (parentOf(s) ? 1 + depth(slots.find((x) => x.id === parentOf(s))!) : 0);
  const order = [...slots].sort((a, b) => a.row - b.row || a.col - b.col);
  return (
    <>
      {ANOMALIES.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5" /> {ANOMALIES.length} anomalies on {new Set(ANOMALIES.map((a) => a.n)).size} PRs
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-auto text-xs">
        {order.map((s) => {
          const p = s.node;
          const d = depth(s);
          const k = edgeKind(s, slots);
          return (
            <li key={s.id} className="relative py-1" style={{ paddingLeft: d * 18 }}>
              {d > 0 && <span aria-hidden className={cn("absolute top-0 h-[14px] w-2.5 rounded-bl-[6px] border-b-2 border-l-2", k === "stack" ? "border-primary" : k === "virtual" ? "border-dashed border-status-needs-input" : k === "dim" ? "border-border" : "border-muted-foreground")} style={{ left: d * 18 - 12 }} />}
              {p ? (
                <div className={cn(dim(p) && "opacity-55")}>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold">{p.key ?? "no key"}</span>
                    <PrLink n={p.n} />
                    <span className={STATE_TONE[p.state]}>{p.state}</span>
                    {p.conflicting && <span className="text-destructive">conflicts</span>}
                    <span className="min-w-0 truncate text-muted-foreground">{p.title}</span>
                    {p.stack && <span className="flex items-center gap-0.5 text-muted-foreground"><Layers className="size-3" />{p.stack.pos}/{p.stack.of}</span>}
                    {p.outside ? <span className="rounded bg-muted px-1 text-[10px]">outside the map</span> : p.lane && <span className="text-muted-foreground">L{p.lane}</span>}
                    <span className="ml-auto">{p.thread ? <ThreadMark t={p.thread} /> : <span className="text-destructive">no thread</span>}</span>
                  </div>
                  {p.anomalies.map((a) => (
                    <div key={a} className="flex items-center gap-1 text-destructive"><AlertTriangle className="size-3" />{a}</div>
                  ))}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 rounded border border-dashed bg-muted px-1.5 font-mono font-semibold"><GitBranch className="size-3" />{s.label}</span>
              )}
            </li>
          );
        })}
      </ul>
      <section className="flex-none text-xs">
        <h3 className="mb-1 font-semibold text-muted-foreground">Threads with no PR</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {NO_PR.map((t) => (
            <li key={t.id} className="flex items-center gap-1.5"><ThreadMark t={t} label={false} /><a href={t3(t.id)} className="hover:underline">{t.title}</a></li>
          ))}
        </ul>
      </section>
    </>
  );
}

const VARIANTS = [
  ["A", "Canvas, full cards", VariantA],
  ["B", "Canvas + side panel", VariantB],
  ["C", "Outline, no canvas", VariantC],
  ...SOL_VARIANTS,
] as const;

function Switcher({ i, set }: { i: number; set: (i: number) => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") set((i + VARIANTS.length - 1) % VARIANTS.length);
      if (e.key === "ArrowRight") set((i + 1) % VARIANTS.length);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [i, set]);
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-3 py-1.5 text-xs text-white shadow-lg">
      <button type="button" onClick={() => set((i + VARIANTS.length - 1) % VARIANTS.length)}><ChevronLeft className="size-4" /></button>
      <span>{VARIANTS[i][0]} ({VARIANTS[i][1]})</span>
      <button type="button" onClick={() => set((i + 1) % VARIANTS.length)}><ChevronRight className="size-4" /></button>
    </div>
  );
}

export function PrGraphDialog({ name, open, onOpenChange }: { name: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [i, setI] = useState(() => Math.max(0, VARIANTS.findIndex((v) => v[0] === new URLSearchParams(location.search).get("graph"))));
  const set = (n: number) => {
    setI(n);
    const u = new URL(location.href);
    u.searchParams.set("graph", VARIANTS[n][0]);
    history.replaceState(null, "", u);
  };
  const V = VARIANTS[i][2];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(860px,calc(100dvh-2rem))] flex-col gap-3 p-4 sm:max-w-[min(1200px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><GitBranch className="size-4" />{name} · PR graph</DialogTitle>
          <DialogDescription className="text-xs">{NODES.length} PRs · {NODES.filter((p) => p.state === "open" || p.state === "draft").length} open · prototype fixture data</DialogDescription>
        </DialogHeader>
        <V />
        {open && <Switcher i={i} set={set} />}
      </DialogContent>
    </Dialog>
  );
}
