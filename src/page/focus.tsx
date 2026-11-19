import { CollisionPriority } from "@dnd-kit/abstract";
import { useDroppable } from "@dnd-kit/react";
import { Crosshair, X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

import type { ThreadNode } from "../shared/tree.ts";
import { needsYou } from "./attention.ts";
import { FOCUS_MAX } from "./focus.ts";
import { ago } from "./format.ts";
import { STATUS, StatusIcon } from "./status-icon.tsx";

/** The Focus list for the add buttons of rows. */
export const Focus = createContext<{
  ids: string[];
  add: (id: string) => void;
  remove: (id: string) => void;
  full: boolean;
  /** Unfolds the path to the row of a thread and scrolls to it. False when the row stays hidden. */
  reveal: (id: string) => Promise<boolean>;
}>({ ids: [], add: () => {}, remove: () => {}, full: false, reveal: async () => false });

/** A drop of thread `id` on slot `slot`, which holds `over`, that waits for the user to confirm the replace. */
export type Pending = { slot: number; id: string; over: string };

const SLOT = "focus:";
/** The slot index of a drop target id, or null when the target is not a slot. */
export const slotOf = (id: unknown): number | null =>
  typeof id === "string" && id.startsWith(SLOT) ? Number(id.slice(SLOT.length)) : null;

/**
 * Scrolls the tree to the row of thread `id`, then flashes it. False when the row is not visible
 * (filter, hidden snoozed threads, or a flat stack that hides the row).
 */
export function revealRow(id: string): boolean {
  const row = document.querySelector<HTMLElement>(`.thread-row[data-thread="${CSS.escape(id)}"]`);
  if (!row?.checkVisibility() || row.getBoundingClientRect().height === 0) return false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  /** The flash waits for the scroll to end. With no scroll, the first timer flashes. */
  let timer = 0;
  const flash = () => {
    clearTimeout(timer);
    document.removeEventListener("scrollend", flash, true);
    document.removeEventListener("scroll", moving, true);
    const ring = "inset 0 0 0 2px var(--ring)";
    row.animate([{ boxShadow: ring }, { boxShadow: ring, offset: 0.6 }, { boxShadow: "inset 0 0 0 2px transparent" }], {
      duration: 1500,
      easing: "ease-out",
    });
  };
  const moving = () => {
    clearTimeout(timer);
    timer = window.setTimeout(flash, 150);
  };
  timer = window.setTimeout(flash, 600);
  document.addEventListener("scrollend", flash, true);
  document.addEventListener("scroll", moving, true);
  return true;
}

export function FocusButton({
  count,
  shown,
  setShown,
}: {
  count: number;
  shown: boolean;
  setShown: (s: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      size="sm"
      className="gap-1.5 text-foreground"
      aria-label={`Focus, ${count} of ${FOCUS_MAX}`}
      pressed={shown}
      onPressedChange={setShown}
    >
      <Crosshair />
      <span className="max-[720px]:hidden">Focus</span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {count}/{FOCUS_MAX}
      </span>
    </Toggle>
  );
}

/** "Approval 12m" for a thread that waits on the user, else the phrase. */
const waitText = (t: ThreadNode, now: number) =>
  needsYou(t.status) && t.since ? `${t.phrase} · ${ago(t.since, now)}` : t.phrase;

/** The ring and wash of a slot that is the drop target. */
const OVER = "border-ring bg-accent ring-2 ring-ring/50";

/** One slot. A drag of a thread row can drop on it. */
function Slot({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  const { ref, isDropTarget } = useDroppable({
    id: `${SLOT}${index}`,
    accept: (source) => typeof source.data?.thread === "string",
    collisionPriority: CollisionPriority.High,
  });
  return (
    <div ref={ref} className={cn("rounded-[12px]", isDropTarget && OVER, className)}>
      {children}
    </div>
  );
}

/** Asks in the card to replace the entry. Escape and a pointer-down outside the card cancel. */
function Confirm({ title, replace, cancel }: { title: string; replace: () => void; cancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => yes.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    const onDown = (e: PointerEvent) =>
      e.target instanceof Node && !box.current?.closest("[data-card]")?.contains(e.target) && cancel();
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onDown);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onDown);
    };
  }, [cancel]);
  return (
    <div ref={box} role="group" aria-label="Replace" className="mt-auto flex flex-col gap-1.5">
      <p className="m-0 text-[12px] leading-4 break-words">Replace with {title}?</p>
      <div className="flex items-center gap-1">
        <Button ref={yes} size="sm" className="h-7" onClick={replace}>
          Replace
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FocusCard({
  t,
  now,
  remove,
  confirm,
}: {
  t: ThreadNode;
  now: number;
  remove: () => void;
  confirm?: { title: string; replace: () => void; cancel: () => void };
}) {
  const { reveal } = useContext(Focus);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!hidden) return;
    const id = setTimeout(() => setHidden(false), 4000);
    return () => clearTimeout(id);
  }, [hidden]);
  return (
    <div data-card className="flex h-full flex-col gap-1.5 rounded-[12px] border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <StatusIcon t={t} now={now} />
        <span className={cn(STATUS[t.status].shape, "truncate text-[12px] font-medium tabular-nums")}>
          {waitText(t, now)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto text-muted-foreground"
          aria-label={`Remove ${t.title || t.id} from Focus`}
          onClick={remove}
        >
          <X />
        </Button>
      </div>
      <p className="m-0 line-clamp-2 text-[13px] leading-5 font-medium break-words max-[720px]:line-clamp-none">
        {t.title || t.id}
      </p>
      {confirm ? (
        <Confirm {...confirm} />
      ) : (
        <div className="mt-auto flex items-center gap-1">
          <Button size="sm" className="h-7" asChild>
            <a href={t.href}>Open</a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground"
            onClick={() => void reveal(t.id).then((shown) => setHidden(!shown))}
          >
            {hidden ? "Hidden in the tree" : "Show in tree"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A slot whose thread is not in the loaded tree. It keeps its place until the tree is live. */
const NotLoaded = ({ remove }: { remove: () => void }) => (
  <div className="flex h-full items-center gap-1.5 rounded-[12px] border border-dashed bg-card px-3 py-2.5 text-[12px] text-muted-foreground">
    Not loaded
    <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Remove from Focus" onClick={remove}>
      <X />
    </Button>
  </div>
);

/** Three fixed slots above the tree. The filled slots come first. */
export function FocusStrip({
  ids,
  live,
  now,
  remove,
  pending,
  replace,
  cancel,
}: {
  ids: string[];
  live: Map<string, ThreadNode>;
  now: number;
  remove: (id: string) => void;
  pending: Pending | null;
  replace: () => void;
  cancel: () => void;
}) {
  const full = ids.length >= FOCUS_MAX;
  return (
    <section aria-label="Focus" className="mb-3">
      <h2 className="mb-1.5 flex items-baseline gap-2 text-[12px] font-medium text-muted-foreground">
        Focus{" "}
        <span className="tabular-nums">
          {ids.length} of {FOCUS_MAX}
        </span>
        {full && <span>· full, remove one to add another</span>}
      </h2>
      <div className="grid grid-cols-3 gap-2 max-[720px]:grid-cols-1">
        {Array.from({ length: FOCUS_MAX }, (_, i) => {
          const id = ids[i];
          const t = id === undefined ? undefined : live.get(id);
          const next = pending?.slot === i ? live.get(pending.id) : undefined;
          return (
            <Slot key={i} index={i} className={cn(id === undefined && i > ids.length && "max-[720px]:hidden")}>
              {id === undefined ? (
                <div className="flex h-full min-h-[92px] items-center justify-center rounded-[12px] border border-dashed px-3 text-center text-[12px] text-muted-foreground max-[720px]:min-h-0 max-[720px]:py-2">
                  <span>
                    Empty. Use <Crosshair className="inline size-3 align-[-1px]" /> on a row.
                  </span>
                </div>
              ) : t ? (
                <FocusCard
                  key={id}
                  t={t}
                  now={now}
                  remove={() => remove(id)}
                  confirm={next && { title: next.title || next.id, replace, cancel }}
                />
              ) : (
                <NotLoaded remove={() => remove(id)} />
              )}
            </Slot>
          );
        })}
      </div>
    </section>
  );
}
