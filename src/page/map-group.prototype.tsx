/**
 * PROTOTYPE, throwaway. How a map group looks in the T3 project tree.
 * One fake map with a stack inside, a dispatch with a member from another project, and a sub-map.
 * Switch with `?variant=A|B|C` and `?map=live|settled|none` (the floating bar, or ← →).
 *
 * A Stack box: a dashed box like the PR stack rail holds the map thread row and its members on a dashed line.
 * B Map rail: no box. A map node sits left of the map thread row, and a solid colored rail drops from it.
 * C Tab card: a tinted card with a map tab on its top edge. Members indent as subthreads, with no line.
 */
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Map as MapIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Branch, Status, ThreadNode } from "../shared/tree.ts";

/* ---------- fake data ---------- */

type MapState = "live" | "settled" | "none";
const MAP_STATES: MapState[] = ["live", "settled", "none"];

type Item = { kind: "thread"; t: ThreadNode } | { kind: "map"; m: FakeMap };
type FakeMap = { name: string; folder: string; head: ThreadNode; items: Item[] };

const node = (
  sample: ThreadNode,
  id: string,
  title: string,
  status: Status,
  over: Partial<ThreadNode> = {},
): ThreadNode => ({
  ...sample,
  id: `proto-${id}`,
  title,
  key: null,
  linear: null,
  status,
  phrase: { working: "Working", "your-turn": "Your turn", done: "Completed", waiting: "Waiting" }[status as string] ?? status,
  raw: status,
  settled: false,
  input: false,
  snoozedUntil: null,
  stack: null,
  prs: [],
  children: [],
  catchUp: undefined,
  suggestedReplies: undefined,
  t3Project: undefined,
  run: undefined,
  ...over,
});

function fixture(s: ThreadNode): FakeMap {
  const pr = s.prs.slice(0, 1);
  const sub: FakeMap = {
    name: "Flat view maps",
    folder: "flat-view-maps",
    head: node(s, "sub-head", "Wayfinder: Flat view maps", "done"),
    items: [{ kind: "thread", t: node(s, "sub-01", "Flat order of map members", "working") }],
  };
  return {
    name: "Map groups",
    folder: "map-groups",
    head: node(s, "head", "Wayfinder: Map groups", "waiting"),
    items: [
      { kind: "thread", t: node(s, "t01", "What do map threads look like in statev2.sqlite?", "done") },
      {
        kind: "thread",
        t: node(s, "t03", "Where does map membership rank against the tree rules?", "your-turn", {
          stack: { pos: 1, total: 2 },
          prs: pr,
        }),
      },
      { kind: "thread", t: node(s, "mate", "Rail colors follow-up", "working", { stack: { pos: 2, total: 2 } }) },
      {
        kind: "thread",
        t: node(s, "dispatch", "Implement map groups", "working", {
          children: [
            node(s, "si1", "SHOP-512 Parse the map key", "working"),
            node(s, "si2", "SHOP-513 Map header row", "your-turn", {
              t3Project: { id: "docs", label: "thread-tree-docs" },
            }),
          ],
        }),
      },
      { kind: "map", m: sub },
    ],
  };
}

/** Members of this map: its threads and their spawner children, and a sub-map's map thread. */
const count = (m: FakeMap): number =>
  m.items.reduce((n, i) => {
    if (i.kind === "map") return n + 1;
    const all = (t: ThreadNode): number => 1 + t.children.reduce((k, c) => k + all(c), 0);
    return n + all(i.t);
  }, 0);

/* ---------- shared bits ---------- */

const MAP_TONE = "text-amber-600 dark:text-amber-400";

type Row = ComponentType<{ t: ThreadNode; chip?: string; inStack?: boolean; nested?: boolean }>;
type Ctx = { Row: Row; state: MapState };
type Look = (p: { m: FakeMap; c: Ctx; depth: number }) => ReactNode;

/** The head is the map thread row, unless the map thread is settled or missing. Only the top map takes `state`. */
const headless = (c: Ctx, depth: number) => depth === 0 && c.state !== "live";

const OpenMap = ({ show }: { show: boolean }) =>
  show ? (
    <Button
      variant="ghost"
      size="icon"
      className="relative z-10 size-6 flex-none text-muted-foreground"
      aria-label="Open map thread in T3"
      title="Open map thread in T3"
    >
      <ExternalLink className="size-3" />
    </Button>
  ) : null;

const Fold = ({ open, set }: { open: boolean; set: (o: boolean) => void }) => (
  <button
    type="button"
    className="flex flex-none items-center text-muted-foreground"
    aria-label={open ? "Fold map" : "Unfold map"}
    onClick={() => set(!open)}
  >
    <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
  </button>
);

/** The header that holds the group when the map thread is settled or missing. */
const Header = ({
  m,
  c,
  open,
  set,
  className,
}: {
  m: FakeMap;
  c: Ctx;
  open: boolean;
  set: (o: boolean) => void;
  className?: string;
}) => (
  <div className={cn("flex h-7 min-w-0 items-center gap-2 px-2 text-xs", className)}>
    <Fold open={open} set={set} />
    <MapIcon className={cn("size-3.5 flex-none", MAP_TONE)} aria-label="Map" />
    <span className="truncate font-semibold">{m.name}</span>
    <span className="flex-none text-[11px] text-muted-foreground tabular-nums">{count(m)}</span>
    <OpenMap show={c.state === "settled"} />
  </div>
);

const Members = ({ m, c, depth, Look }: { m: FakeMap; c: Ctx; depth: number; Look: Look }) =>
  m.items.map((i) =>
    i.kind === "thread" ? (
      <c.Row key={i.t.id} t={i.t} nested />
    ) : (
      <Look key={i.m.folder} m={i.m} c={c} depth={depth + 1} />
    ),
  );

/* ---------- A: Stack box ---------- */

function MapA({ m, c, depth }: { m: FakeMap; c: Ctx; depth: number }) {
  const [open, setOpen] = useState(true);
  const head = !headless(c, depth);
  return (
    <li className="relative my-1 list-none rounded-[10px] border border-dashed border-border">
      {head ? (
        <div className="flex items-center">
          <span className="flex flex-none items-center gap-1 pl-2">
            <Fold open={open} set={setOpen} />
            <MapIcon className={cn("size-3.5", MAP_TONE)} aria-label={`Map · ${count(m)} members`} />
            <span className="text-[11px] text-muted-foreground tabular-nums">{count(m)}</span>
          </span>
          <ul className="m-0 min-w-0 flex-1 list-none p-0">
            <c.Row t={{ ...m.head, children: [] }} nested />
          </ul>
        </div>
      ) : (
        <Header m={m} c={c} open={open} set={setOpen} />
      )}
      {open && (
        <ul className="m-0 mb-1 ml-4 list-none border-l border-dashed border-muted-foreground/40 p-0 pl-2">
          <Members m={m} c={c} depth={depth} Look={MapA} />
        </ul>
      )}
    </li>
  );
}

/* ---------- B: Map rail ---------- */

function MapB({ m, c, depth }: { m: FakeMap; c: Ctx; depth: number }) {
  const [open, setOpen] = useState(true);
  const head = !headless(c, depth);
  return (
    <li className="relative my-px list-none">
      <div className="relative pl-7">
        <span className="absolute top-[18px] left-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-500/60 bg-card">
          <MapIcon className={cn("size-3", MAP_TONE)} aria-hidden />
        </span>
        {head ? (
          <div className="flex items-center gap-1">
            <ul className="m-0 min-w-0 flex-1 list-none p-0">
              <c.Row t={{ ...m.head, children: [] }} nested />
            </ul>
            <span className="flex-none text-[11px] text-muted-foreground tabular-nums" title="Map members">
              {count(m)}
            </span>
            <Fold open={open} set={setOpen} />
          </div>
        ) : (
          <Header m={m} c={c} open={open} set={setOpen} className="h-9 rounded-[8px] hover:bg-accent" />
        )}
      </div>
      {open && (
        <ul className="m-0 ml-[13px] list-none border-l-2 border-amber-500/40 p-0 pl-3">
          <Members m={m} c={c} depth={depth} Look={MapB} />
        </ul>
      )}
    </li>
  );
}

/* ---------- C: Tab card ---------- */

function MapC({ m, c, depth }: { m: FakeMap; c: Ctx; depth: number }) {
  const [open, setOpen] = useState(true);
  const head = !headless(c, depth);
  return (
    <li className="relative mt-3 mb-1 list-none rounded-[10px] border border-amber-500/30 bg-amber-500/[0.04] pt-1">
      <span className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full border border-amber-500/30 bg-card px-1.5 text-[11px] leading-4">
        <Fold open={open} set={setOpen} />
        <MapIcon className={cn("size-3", MAP_TONE)} aria-hidden />
        {head ? (
          <span className="text-muted-foreground tabular-nums">{count(m)}</span>
        ) : (
          <>
            <span className="font-semibold">{m.name}</span>
            <span className="text-muted-foreground tabular-nums">{count(m)}</span>
            {c.state === "settled" && (
              <ExternalLink className="size-3 text-muted-foreground" aria-label="Open map thread in T3" />
            )}
          </>
        )}
      </span>
      <ul className="m-0 list-none p-0 px-1 pb-1">
        {head && <c.Row t={{ ...m.head, children: [] }} nested />}
        {open && (
          <li className={cn("list-none", head && "pl-2.5")}>
            <ul className="m-0 list-none p-0">
              <Members m={m} c={c} depth={depth} Look={MapC} />
            </ul>
          </li>
        )}
      </ul>
    </li>
  );
}

/* ---------- switcher ---------- */

const VARIANTS = { A: "Stack box", B: "Map rail", C: "Tab card" } as const;
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
const useMapState = (): MapState => {
  const v = useSyncExternalStore(subscribe, () => param("map"));
  return MAP_STATES.includes(v as MapState) ? (v as MapState) : "live";
};

const LOOKS = { A: MapA, B: MapB, C: MapC };
const firstThread = (bs: Branch[]): ThreadNode | undefined => {
  for (const b of bs) {
    const t = b.threads.find((x) => x.prs.length > 0) ?? b.threads[0] ?? firstThread(b.branches);
    if (t) return t;
  }
};

/** Mounts as the first items of the tree list, next to real rows. `Row` is the real ThreadRow. */
export function MapGroupPrototype({ Row, projects }: { Row: Row; projects: Branch[] }) {
  const variant = useVariant();
  const state = useMapState();
  const sample = firstThread(projects);
  if (!sample) return null;
  const Look = LOOKS[variant];
  return <Look key={`${variant}${state}`} m={fixture(sample)} c={{ Row, state }} depth={0} />;
}

export function MapGroupSwitcher() {
  const variant = useVariant();
  const state = useMapState();
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
        aria-label="Map thread"
        className="rounded-full bg-background px-2 py-0.5 text-foreground"
        value={state}
        onChange={(e) => setParam("map", e.target.value)}
      >
        <option value="live">map thread live</option>
        <option value="settled">map thread settled</option>
        <option value="none">no map thread</option>
      </select>
    </div>
  );
}
