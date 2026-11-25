/**
 * PROTOTYPE, throwaway. Three Settings controls for the placement rules, switched with `?variant=A|B|C`.
 * The switches and order live in memory and change no placement; only Launch nesting drives the real `nest`.
 */
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GripVertical, Lock } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Mid = "reviews" | "stack" | "key";
type Id = "map" | Mid | "nest";
type State = { order: Mid[]; on: Record<Id, boolean> };

const NAME: Record<Id, string> = {
  map: "Map group",
  reviews: "Reviews",
  stack: "PR stack",
  key: "Issue key",
  nest: "Launch nesting",
};
const WHAT: Record<Id, string> = {
  map: "Threads of a wayfinder map go under the map.",
  reviews: "Review threads go in one Reviews group.",
  stack: "Threads with stacked PRs go in their stack.",
  key: "Threads go in the group of their issue key.",
  nest: "A launched thread goes under the thread that launched it.",
};
const DEFAULT: State = {
  order: ["reviews", "stack", "key"],
  on: { map: true, reviews: true, stack: true, key: true, nest: false },
};
const HINT = "text-xs text-muted-foreground";

/** What the current settings change against the default, one line per change. */
function changes(s: State, linear: boolean): string[] {
  const out: string[] = [];
  const at = (id: Mid) => s.order.indexOf(id);
  if (!s.on.map) out.push("Map members leave their map and go to the next rule.");
  if (!s.on.reviews) out.push("Review threads go to their stack or key group, or stay loose.");
  if (!s.on.stack) out.push("Stacked threads no longer group by stack.");
  if (!s.on.key) out.push("Keyed threads stay loose.");
  if (s.on.reviews && s.on.stack && at("reviews") > at("stack"))
    out.push("A review thread in a PR stack shows in its stack, not in Reviews.");
  if (s.on.key && s.on.stack && at("key") < at("stack"))
    out.push(
      linear
        ? "A stack thread with a key goes to its own milestone. Stack mates without a key stay in the stack."
        : "A stack thread with a key goes to its key group. Stack mates without a key stay in the stack.",
    );
  if (s.on.nest) out.push("Launched threads nest under their spawner.");
  return out;
}

/** The Linear tree needs Issue key; without it most threads are loose. */
const LinearHint = ({ s, linear }: { s: State; linear: boolean }) =>
  linear && !s.on.key ? (
    <p className="m-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs">
      The Linear tree groups by issue key. With Issue key off, most threads show as loose threads.
    </p>
  ) : null;

const Changes = ({ s, linear }: { s: State; linear: boolean }) => {
  const c = changes(s, linear);
  return c.length ? (
    <ul className={cn(HINT, "m-0 grid gap-0.5 pl-4")}>
      {c.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  ) : (
    <p className={cn(HINT, "m-0")}>Default placement.</p>
  );
};

/** Sample threads for the live preview: which group each one lands in. */
const SAMPLE: { title: string; facts: Id[]; key: string; stack: string }[] = [
  { title: "Review #2101 checkout", facts: ["reviews", "stack", "key"], key: "TIB-12", stack: "checkout" },
  { title: "Checkout step 2", facts: ["stack", "key"], key: "TIB-14", stack: "checkout" },
  { title: "Checkout step 3", facts: ["stack"], key: "", stack: "checkout" },
  { title: "Refactor cart", facts: ["key"], key: "TIB-12", stack: "" },
  { title: "Map: thread org 03", facts: ["map", "key"], key: "TIB-12", stack: "" },
];

function place(s: State): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const t of SAMPLE) {
    const rule = (["map", ...s.order] as Id[]).find((r) => s.on[r] && t.facts.includes(r));
    const g =
      rule === "map"
        ? "Map: thread org"
        : rule === "reviews"
          ? "Reviews"
          : rule === "stack"
            ? `Stack ${t.stack}`
            : rule === "key"
              ? t.key
              : "Loose";
    groups.set(g, [...(groups.get(g) ?? []), t.title]);
  }
  return groups;
}

function Preview({ s }: { s: State }) {
  const groups = place(s);
  const base = place(DEFAULT);
  const moved = (g: string, t: string) => !base.get(g)?.includes(t);
  return (
    <div className="grid gap-1 rounded-md border bg-muted/40 p-2 font-mono text-[11px]">
      {[...groups].map(([g, ts]) => (
        <div key={g}>
          <div className="font-semibold">{g === "Loose" ? "(loose threads)" : g}</div>
          {ts.map((t) => (
            <div key={t} className={cn("pl-3", moved(g, t) && "text-amber-600 dark:text-amber-400")}>
              {moved(g, t) ? "→ " : "· "}
              {t}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type P = { s: State; set: (s: State) => void; linear: boolean };
const toggle = (p: P, id: Id) => (v: boolean) => p.set({ ...p.s, on: { ...p.s.on, [id]: v } });
const swap = (p: P, i: number, d: -1 | 1) => {
  const o = [...p.s.order];
  [o[i], o[i + d]] = [o[i + d]!, o[i]!];
  p.set({ ...p.s, order: o });
};

const Head = ({ children }: { children: ReactNode }) => (
  <h3 className="m-0 px-1 text-xs font-semibold text-muted-foreground">{children}</h3>
);

function RuleRow({ p, id, lead, note }: { p: P; id: Id; lead: ReactNode; note?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className="flex w-5 justify-center text-muted-foreground">{lead}</span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Label htmlFor={`rule-${id}`} className="text-[13px] font-normal">
          {NAME[id]}
        </Label>
        <div className={HINT}>{note ?? WHAT[id]}</div>
      </div>
      <Switch id={`rule-${id}`} checked={p.s.on[id]} onCheckedChange={toggle(p, id)} />
    </div>
  );
}

function SortRow({ p, id, index }: { p: P; id: Mid; index: number }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index });
  return (
    <div ref={ref} className={cn(isDragging && "opacity-60")}>
      <RuleRow
        p={p}
        id={id}
        lead={
          <button ref={handleRef} aria-label={`Move ${NAME[id]}`} className="cursor-grab">
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}

/** A: one list, drag handles on the middle rules, locks on the ends, changes listed below. */
function VariantA(p: P) {
  return (
    <section className="grid gap-1.5">
      <Head>Grouping</Head>
      <div className="divide-y rounded-lg border bg-background">
        <RuleRow p={p} id="map" lead={<Lock className="size-3.5" />} note={`${WHAT.map} Always first.`} />
        <DragDropProvider
          onDragEnd={(e) => {
            const src = e.operation.source;
            const tgt = e.operation.target;
            if (e.canceled || !src || !tgt || src.id === tgt.id) return;
            const o = p.s.order.filter((x) => x !== src.id);
            o.splice(p.s.order.indexOf(tgt.id as Mid), 0, src.id as Mid);
            p.set({ ...p.s, order: o });
          }}
        >
          {p.s.order.map((id, i) => (
            <SortRow key={id} p={p} id={id} index={i} />
          ))}
        </DragDropProvider>
        <RuleRow p={p} id="nest" lead={<Lock className="size-3.5" />} note={`${WHAT.nest} Always last.`} />
      </div>
      <div className="grid gap-1.5 px-1">
        <p className={cn(HINT, "m-0")}>A thread goes to the first rule that fits it, top to bottom.</p>
        <Changes s={p.s} linear={p.linear} />
        <LinearHint s={p.s} linear={p.linear} />
      </div>
    </section>
  );
}

/** B: a numbered chain with up/down buttons and a live sample tree that marks moved threads. */
function VariantB(p: P) {
  const chain: Id[] = ["map", ...p.s.order, "nest"];
  return (
    <section className="grid gap-1.5">
      <Head>Grouping</Head>
      <div className="grid gap-2 rounded-lg border bg-background p-3">
        <p className={cn(HINT, "m-0")}>A thread goes to the first rule that fits it.</p>
        <ol className="m-0 grid list-none gap-1 p-0">
          {chain.map((id, n) => {
            const i = p.s.order.indexOf(id as Mid);
            const mid = i >= 0;
            return (
              <li
                key={id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1",
                  !p.s.on[id] && "opacity-50",
                  !mid && "border-dashed",
                )}
              >
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{n + 1}</span>
                <span className="flex-1 text-[13px]">{NAME[id]}</span>
                {mid ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Up"
                      disabled={i === 0}
                      onClick={() => swap(p, i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Down"
                      disabled={i === p.s.order.length - 1}
                      onClick={() => swap(p, i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </>
                ) : (
                  <Lock className="mx-2 size-3.5 text-muted-foreground" aria-label="Fixed place" />
                )}
                <Switch checked={p.s.on[id]} onCheckedChange={toggle(p, id)} aria-label={NAME[id]} />
              </li>
            );
          })}
        </ol>
        <LinearHint s={p.s} linear={p.linear} />
        <div className={HINT}>Preview (→ marks a thread that moved):</div>
        <Preview s={p.s} />
      </div>
    </section>
  );
}

/** C: a sentence with three slots; ends stay ordinary switch rows. */
function VariantC(p: P) {
  const slots = p.s.order.map((id) => (p.s.on[id] ? id : "off"));
  const setSlot = (i: number, v: Mid | "off") => {
    const o = [...p.s.order];
    const on = { ...p.s.on };
    if (v === "off") on[o[i]!] = false;
    else {
      const j = o.indexOf(v);
      [o[i], o[j]] = [o[j]!, o[i]!];
      on[v] = true;
    }
    p.set({ order: o, on });
  };
  return (
    <section className="grid gap-1.5">
      <Head>Grouping</Head>
      <div className="divide-y rounded-lg border bg-background">
        <RuleRow p={p} id="map" lead={null} />
        <div className="grid gap-2 px-3 py-2.5 text-[13px]">
          <span>Then group a thread by the first that fits:</span>
          <div className="flex flex-wrap items-center gap-1">
            {slots.map((v, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">then</span>}
                <select
                  className="rounded-md border bg-background px-1.5 py-1 text-[13px]"
                  value={v}
                  onChange={(e) => setSlot(i, e.target.value as Mid | "off")}
                >
                  {(["reviews", "stack", "key"] as Mid[]).map((m) => (
                    <option key={m} value={m}>
                      {NAME[m]}
                    </option>
                  ))}
                  <option value="off">(nothing)</option>
                </select>
              </span>
            ))}
          </div>
          <Changes s={p.s} linear={p.linear} />
          <LinearHint s={p.s} linear={p.linear} />
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => p.set(DEFAULT)}>
            Reset to default
          </Button>
        </div>
        <RuleRow p={p} id="nest" lead={null} />
      </div>
    </section>
  );
}

const VARIANTS = { A: ["List + drag", VariantA], B: ["Chain + preview", VariantB], C: ["Sentence", VariantC] } as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

/** The rules control plus the floating variant switcher. Mounted inside the Settings panel. */
export function RulesPrototype({
  nest,
  setNest,
  linear,
}: {
  nest: boolean;
  setNest: (v: boolean) => void;
  linear: boolean;
}) {
  const [v, setV] = useState<Key>(() => {
    const q = new URLSearchParams(location.search).get("variant");
    return KEYS.includes(q as Key) ? (q as Key) : "A";
  });
  const [s, setS] = useState<State>(DEFAULT);
  const state = { ...s, on: { ...s.on, nest } };
  const set = (n: State) => {
    setS(n);
    if (n.on.nest !== nest) setNest(n.on.nest);
  };
  const go = (d: number) => {
    const n = KEYS[(KEYS.indexOf(v) + d + KEYS.length) % KEYS.length]!;
    setV(n);
    const u = new URL(location.href);
    u.searchParams.set("variant", n);
    history.replaceState(null, "", u);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      go(e.key === "ArrowLeft" ? -1 : 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const [label, View] = VARIANTS[v];
  return (
    <>
      <View s={state} set={set} linear={linear} />
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-2 py-1 text-background shadow-lg">
        <button aria-label="Previous variant" onClick={() => go(-1)} className="p-1">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs">
          {v} ({label}) · ⌥←/→
        </span>
        <button aria-label="Next variant" onClick={() => go(1)} className="p-1">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </>
  );
}
