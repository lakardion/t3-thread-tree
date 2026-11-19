/**
 * PROTOTYPE, throw away. Five variants of how a Catch-up looks and where it shows, on the real demo page.
 * Switch with `?catchup=<key>` and the bottom bar; `&cstate=` sets the Catch-up state for all rows; `&cpanel=1` shows
 * the notification, Up next and menu-bar mock. Catch-ups are stubs keyed by demo thread id. No model call.
 */
import { Bell, ChevronLeft, ChevronRight, Menu, SkipForward } from "lucide-react";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ThreadNode } from "../shared/tree.ts";
import { needsYou } from "./attention.ts";
import { ago, stripKey } from "./format.ts";
import { useLastMessage } from "./send-dialog.tsx";
import { STATUS, StatusIcon } from "./status-icon.tsx";

/** `did: null` means the model found no clear ask: the raw last message shows instead. `options` only when the agent stated them. */
type CatchUp = { did: string | null; ask: string | null; options?: string[] };

const STUB: Record<string, CatchUp> = {
  "demo-2": {
    did: "Saved cards list works.",
    ask: "Make a new card the default?",
    options: ["At once", "Only when picked"],
  },
  "demo-15": { did: "Retry queue needs a new table.", ask: "Approve db:migrate retry_queue?" },
  "demo-12": { did: "Found the cart badge race; fix half done. Stopped on a rate limit.", ask: null },
  "demo-17": { did: null, ask: null },
  "demo-20": { did: "Plan: cursor pagination in 3 steps.", ask: "Approve to start step 1?" },
  "demo-22": { did: "Guest wants 'Fixed' renamed to 'Bug fixes'.", ask: "Use the guest's wording?" },
  "demo-24": {
    did: "Linked 4 release PRs; #3001 approved, checks pass.",
    ask: "Draft #3004:",
    options: ["Mark ready", "Leave for docs team"],
  },
  "demo-25": { did: "Schema change adds a nullable region column.", ask: "Approve the migration?" },
  dispatch: { did: "3 cache threads as a stack; 2 done, 1 runs.", ask: "Go ahead and request reviews?" },
  m2: { did: null, ask: null },
  "search-b": {
    did: "Backfill ready: 2.1 M docs, about 40 min.",
    ask: "When to run it?",
    options: ["One batch tonight", "By shard, daytime"],
  },
  "search-plan": { did: "Index plan written: one index per locale.", ask: "Is freshness ranking in scope?" },
};

type Key = "line" | "phrase" | "details" | "notify" | "lead";
type State = "ready" | "loading" | "failed" | "off";

const VARIANTS: { key: Key; name: string; position: string }[] = [
  {
    key: "line",
    name: "A · Line under title",
    position:
      "Muted line under the title on Needs-you, your-turn and failed rows. Loading: skeleton line. Call failed or no ask: quoted raw text. Off: today's row. Hover for source. Rows from the start.",
  },
  {
    key: "phrase",
    name: "B · Ask as the phrase",
    position:
      "The ask takes the place of the status phrase (Wait kept). Did-part and source in the tooltip. Loading, failed call, no ask, off: today's phrase. Follows the status-text toggle. Rows from the start.",
  },
  {
    key: "details",
    name: "C · Details only",
    position:
      "Rows stay as today. The details block gets a Catch-up line (Did / Asks) above the raw Last message. Notifications unchanged. Smallest first slice.",
  },
  {
    key: "notify",
    name: "D · Surfaces first",
    position:
      "Rows stay as today. Notification body, Up next (second line) and menu bar get the Catch-up. Loading: notification waits ≤ 5 s, then today's body. First slice: notifications + Up next.",
  },
  {
    key: "lead",
    name: "E · Ask leads the row",
    position:
      "While a thread waits, the ask is the row's headline and the title drops to a muted second line. Loading, failed call, no ask, off: today's row. Hover for source. Rows from the start.",
  },
];
const STATES: State[] = ["ready", "loading", "failed", "off"];

/** URL-backed state, so every variant and state has its own link. */
const read = () => {
  const p = new URLSearchParams(location.search);
  const key = (VARIANTS.find((v) => v.key === p.get("catchup"))?.key ?? "line") as Key;
  const state = (STATES.find((s) => s === p.get("cstate")) ?? "ready") as State;
  return { key, state, panel: p.get("cpanel") === "1" };
};
let snap = read();
const subs = new Set<() => void>();
function set(next: Partial<typeof snap>) {
  snap = { ...snap, ...next };
  const p = new URLSearchParams(location.search);
  p.set("catchup", snap.key);
  p.set("cstate", snap.state);
  if (snap.panel) p.set("cpanel", "1");
  else p.delete("cpanel");
  history.replaceState(null, "", `?${p}`);
  subs.forEach((f) => f());
}
const useProto = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => snap,
  );

/** Statuses that get a Catch-up at all: the Needs-you set, your turn, and failed. */
const eligible = (t: Pick<ThreadNode, "status">) => needsYou(t.status) || t.status === "failed";

/** What a row should render: a Catch-up, a raw-text fallback, a loading mark, or nothing (today's UI). */
type Shown =
  | { kind: "ready"; c: CatchUp & { did: string } }
  | { kind: "raw"; why: string }
  | { kind: "loading" }
  | null;
function shown(t: Pick<ThreadNode, "id" | "status">, state: State): Shown {
  if (state === "off" || !eligible(t)) return null;
  const c = STUB[t.id];
  if (!c) return null;
  if (state === "loading") return { kind: "loading" };
  if (state === "failed") return { kind: "raw", why: "Catch-up failed" };
  if (c.did === null) return { kind: "raw", why: "No clear ask" };
  return { kind: "ready", c: c as CatchUp & { did: string } };
}

const firstLine = (s: string | null | undefined) => (s ?? "").split("\n").find((l) => l.trim()) ?? "";

/** The thread's raw last message, for trust. */
function Source({ t }: { t: Pick<ThreadNode, "id" | "updatedAt"> }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return (
    <span className="block max-w-sm text-xs whitespace-pre-wrap">
      <span className="block font-semibold opacity-70">Last message</span>
      {text === undefined ? "Loading…" : (text ?? "No message.")}
    </span>
  );
}

const WithSource = ({ t, children }: { t: ThreadNode; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="bottom" align="start">
      <Source t={t} />
    </TooltipContent>
  </Tooltip>
);

const Options = ({ options }: { options?: string[] }) =>
  options?.map((o) => (
    <Badge key={o} variant="outline" className="h-[18px] px-1.5 text-[11px] font-normal">
      {o}
    </Badge>
  ));

/** "Asks:" in the status color, then the ask and the stated options. */
const Asks = ({ t, c }: { t: ThreadNode; c: CatchUp }) =>
  c.ask && (
    <>
      <span className={cn(STATUS[t.status].shape, "font-semibold")}>Asks:</span>{" "}
      <span className="text-foreground">{c.ask}</span> <Options options={c.options} />
    </>
  );

/** The raw first line of the last message, quoted and muted, with why it shows. Neutral color: a failed call is not a failed thread. */
function Raw({ t, why }: { t: ThreadNode; why: string }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return (
    <span className="min-w-0 truncate text-muted-foreground">
      <span className="mr-1 rounded-sm border border-dashed px-1 text-[10px] tracking-wide uppercase">{why}</span>
      <span className="italic">“{text === undefined ? "…" : firstLine(text)}”</span>
    </span>
  );
}

/** Wraps the row title. Variant A adds a line under it; variant E puts the ask above it. */
export function CatchUpTitle({ t, children }: { t: ThreadNode; children: ReactNode }) {
  const { key, state } = useProto();
  const s = shown(t, state);
  if (!s || (key !== "line" && key !== "lead")) return children;
  if (key === "lead") {
    if (s.kind !== "ready") return children;
    const { c } = s;
    return (
      <span className="flex min-w-0 flex-1 flex-col max-[720px]:basis-full max-[720px]:pl-5 [&>a]:pl-0 [&>a]:text-xs [&>a]:font-normal [&>a]:text-muted-foreground">
        <WithSource t={t}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium">
            <span>{c.ask ?? c.did}</span>
            <Options options={c.options} />
            {c.ask && <span className="truncate text-xs font-normal text-muted-foreground">· {c.did}</span>}
          </span>
        </WithSource>
        {children}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-1 flex-col max-[720px]:basis-full [&>a]:max-[720px]:basis-auto">
      {children}
      <span className="flex min-w-0 items-center gap-1 text-xs leading-[18px] text-muted-foreground max-[720px]:pl-5">
        {s.kind === "loading" && <Skeleton className="my-[3px] h-3 w-56 max-w-full motion-reduce:animate-none" />}
        {s.kind === "raw" && (
          <WithSource t={t}>
            <span className="flex min-w-0">
              <Raw t={t} why={s.why} />
            </span>
          </WithSource>
        )}
        {s.kind === "ready" && (
          <WithSource t={t}>
            <span className="min-w-0 truncate">
              {s.c.did} <Asks t={t} c={s.c} />
            </span>
          </WithSource>
        )}
      </span>
    </span>
  );
}

/** Variant B: the ask in place of the status phrase. Anything else falls back to today's phrase. */
export function CatchUpPhrase({ t, now, fallback }: { t: ThreadNode; now: number; fallback: ReactNode }) {
  const { key, state } = useProto();
  const s = shown(t, state);
  if (key !== "phrase" || s?.kind !== "ready" || !s.c.ask) return fallback;
  const { c } = s;
  const text = c.options ? `${c.ask} ${c.options.join(" or ")}?` : c.ask;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            STATUS[t.status].shape,
            "flex max-w-[34ch] min-w-0 flex-none items-baseline gap-1 text-[12px] font-medium whitespace-nowrap in-data-[status-text=off]:hidden max-[720px]:max-w-[calc(100%-40px)]",
          )}
        >
          <span className="truncate">{text}</span>
          {needsYou(t.status) && t.since && (
            <span className="flex-none font-mono tabular-nums opacity-80">{ago(t.since, now)}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <span className="block max-w-sm text-xs">
          <span className="block font-semibold">{t.phrase}</span>
          <span className="mb-1.5 block">{c.did}</span>
        </span>
        <Source t={t} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Variant C: a Catch-up line in the details block, above the raw last message. Renders `dt`/`dd` for the block's grid. */
export function CatchUpDetail({ t }: { t: ThreadNode }) {
  const { key, state } = useProto();
  const s = shown(t, state);
  if (key !== "details" || !s) return null;
  return (
    <>
      <dt className="text-muted-foreground">Catch-up</dt>
      <dd className="m-0 min-w-0 break-words">
        {s.kind === "loading" && <Skeleton className="my-0.5 h-3 w-64 max-w-full motion-reduce:animate-none" />}
        {s.kind === "raw" && (
          <span className="text-muted-foreground">
            {s.why === "No clear ask"
              ? "No clear ask. Read the last message."
              : "Could not write it. Read the last message."}
          </span>
        )}
        {s.kind === "ready" && (
          <span className="grid grid-cols-[auto_1fr] gap-x-2">
            <span className="text-muted-foreground">Did</span>
            <span>{s.c.did}</span>
            {s.c.ask && (
              <>
                <span className={cn(STATUS[t.status].shape, "font-semibold")}>Asks</span>
                <span className="flex flex-wrap items-center gap-1">
                  {s.c.ask} <Options options={s.c.options} />
                </span>
              </>
            )}
          </span>
        )}
      </dd>
    </>
  );
}

const STATUS_TITLE: Record<string, string> = {
  "needs-input": "Needs input",
  "plan-ready": "Plan ready",
  failed: "Failed",
};
const askText = (c: CatchUp) => (c.options ? `${c.ask} ${c.options.join(" or ")}?` : (c.ask ?? ""));

/** A macOS notification, as this variant would send it. */
function MockNotification({ t, now }: { t: ThreadNode; now: number }) {
  const { key, state } = useProto();
  const raw = useLastMessage(t.id, t.updatedAt);
  const s = key === "details" ? null : shown(t, state);
  let title = STATUS_TITLE[t.status];
  let body: ReactNode = t.title;
  let note: string | null = null;
  if (s?.kind === "loading") note = "Held up to 5 s for the Catch-up, then sent as today.";
  if (s?.kind === "raw") {
    title = `${STATUS_TITLE[t.status]} · ${t.title}`;
    body = <span className="italic">{firstLine(raw)}</span>;
  }
  if (s?.kind === "ready") {
    const c = s.c;
    if (key === "lead") {
      title = c.ask ? askText(c) : c.did;
      body = `${t.title} · ${c.did}`;
    } else if (key === "phrase") {
      body = (
        <>
          {t.title}
          <br />
          {c.ask ? askText(c) : c.did}
        </>
      );
    } else {
      title = `${STATUS_TITLE[t.status]} · ${t.title}`;
      body = (
        <>
          {c.ask && <span className="font-semibold">Asks: {askText(c)}</span>}
          {c.ask && <br />}
          {c.did}
        </>
      );
    }
  }
  return (
    <div className="flex gap-2.5 rounded-[14px] border bg-card/90 p-2.5 shadow-sm">
      <div className="flex size-8 flex-none items-center justify-center rounded-[8px] bg-foreground text-background">
        <Bell className="size-4" />
      </div>
      <div className="min-w-0 flex-1 text-[12px] leading-4">
        <div className="flex gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
          <span className="text-[11px] text-muted-foreground">{t.since ? ago(t.since, now) : "now"}</span>
        </div>
        <div className="line-clamp-3 text-muted-foreground">{body}</div>
        {note && <div className="mt-0.5 text-[10px] text-muted-foreground italic">{note}</div>}
      </div>
    </div>
  );
}

/** An Up next row with the look of `up-next.tsx`. */
function MockUpNextRow({ t, now, target }: { t: ThreadNode; now: number; target: boolean }) {
  const { key, state } = useProto();
  const s = key === "details" ? null : shown(t, state);
  const title = (t.key ? stripKey(t.title, t.key) : t.title) || t.id;
  const c = s?.kind === "ready" ? s.c : null;
  const second =
    s?.kind === "loading" ? (
      <Skeleton className="h-2.5 w-40" />
    ) : s?.kind === "raw" ? (
      <Raw t={t} why={s.why} />
    ) : c && key !== "phrase" && key !== "lead" ? (
      <span className="truncate text-muted-foreground">{c.ask ? `Asks: ${askText(c)}` : c.did}</span>
    ) : null;
  return (
    <div
      className={cn(
        "flex w-full flex-col justify-center rounded-md border-l-2 border-transparent px-2 py-1 text-[13px]",
        target && "border-status-needs-input bg-accent/50",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <StatusIcon t={t} now={now} />
        {t.key && <span className="flex-none font-mono text-[11px] text-muted-foreground">{t.key}</span>}
        {key === "lead" && c ? (
          <span className="min-w-0 flex-1 truncate font-medium">{c.ask ? askText(c) : c.did}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{title}</span>
        )}
        {key === "phrase" && c?.ask && (
          <span className={cn(STATUS[t.status].shape, "max-w-[45%] truncate text-[12px] font-medium")}>
            {askText(c)}
          </span>
        )}
        <span className={cn(STATUS[t.status].shape, "font-mono text-[12px] tabular-nums")}>
          {t.since ? ago(t.since, now) : ""}
        </span>
      </div>
      {key === "lead" && c && <span className="truncate pl-[20px] text-[11px] text-muted-foreground">{title}</span>}
      {second && <span className="flex min-w-0 pl-[20px] text-[11px]">{second}</span>}
    </div>
  );
}

/** A native menu item is one line of plain text. */
function menuLabel(t: ThreadNode, key: Key, state: State): string {
  const today = `${STATUS_TITLE[t.status]} · ${t.title}`;
  const s = key === "details" ? null : shown(t, state);
  if (s?.kind !== "ready" || !s.c.ask) return today;
  if (key === "lead") return `${askText(s.c)} — ${t.title}`;
  if (key === "phrase") return `${askText(s.c)} · ${t.title}`;
  return `${today} — ${askText(s.c)}`;
}

const bySince = (a: ThreadNode, b: ThreadNode) => (a.since ?? "").localeCompare(b.since ?? "");

function Panel({ threads, now }: { threads: ThreadNode[]; now: number }) {
  const { key, state } = useProto();
  const v = VARIANTS.find((x) => x.key === key)!;
  const live = threads.filter((t) => !t.settled).toSorted(bySince);
  const notify = live.filter((t) => t.status === "needs-input" || t.status === "plan-ready" || t.status === "failed");
  const upNext = live.filter((t) => needsYou(t.status));
  const menu = live.filter((t) => t.status === "needs-input" || t.status === "plan-ready");
  const h = "mt-3 mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
  return (
    <div className="fixed right-4 bottom-20 z-50 max-h-[calc(100vh-120px)] w-[400px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[12px] border bg-background p-3 shadow-lg">
      <div className="text-xs font-semibold">{v.name}</div>
      <p className="m-0 text-xs text-muted-foreground">{v.position}</p>
      <div className={h}>Notifications</div>
      <div className="flex flex-col gap-1.5">
        {notify.map((t) => (
          <MockNotification key={t.id} t={t} now={now} />
        ))}
      </div>
      <div className={h}>Up next</div>
      <div className="rounded-[10px] border">
        <div className="flex h-9 items-center gap-2 border-b px-2">
          <span className="text-xs font-semibold">Up next</span>
          <span className="text-xs text-muted-foreground tabular-nums">{upNext.length}</span>
          <Button variant="outline" size="xs" className="ml-auto" tabIndex={-1}>
            <SkipForward /> Open next
          </Button>
        </div>
        <div className="p-1">
          {upNext.map((t, i) => (
            <MockUpNextRow key={t.id} t={t} now={now} target={i === 0} />
          ))}
        </div>
      </div>
      <div className={h}>Menu bar</div>
      <div className="rounded-[8px] border bg-popover p-1 font-sans text-[13px]">
        <div className="flex items-center gap-1.5 px-2 py-0.5 text-muted-foreground">
          <Menu className="size-3.5" /> {menu.length}
        </div>
        {menu.map((t) => (
          <div key={t.id} className="truncate rounded-[4px] px-2 py-0.5 hover:bg-accent">
            {menuLabel(t, key, state)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The floating switcher, and the mock panel when it is open. */
export function CatchUpBar({ threads, now }: { threads: ThreadNode[]; now: number }) {
  const { key, state, panel } = useProto();
  const i = VARIANTS.findIndex((v) => v.key === key);
  const go = (d: number) => set({ key: VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length].key });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable)
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  return (
    <>
      {panel && <Panel threads={threads} now={now} />}
      <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-[14px] border bg-background/95 p-1 text-xs shadow-lg backdrop-blur">
        <Button variant="ghost" size="icon" className="size-7" aria-label="Previous variant" onClick={() => go(-1)}>
          <ChevronLeft />
        </Button>
        <span
          className="min-w-36 text-center font-medium max-[720px]:max-w-32 max-[720px]:min-w-0 max-[720px]:truncate"
          title={VARIANTS[i].position}
        >
          {VARIANTS[i].name}
        </span>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Next variant" onClick={() => go(1)}>
          <ChevronRight />
        </Button>
        <span className="mx-1 h-5 w-px bg-border max-[720px]:hidden" />
        {STATES.map((s) => (
          <Button
            key={s}
            variant={s === state ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={s === state}
            onClick={() => set({ state: s })}
          >
            {s}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border max-[720px]:hidden" />
        <Button variant={panel ? "secondary" : "ghost"} size="xs" onClick={() => set({ panel: !panel })}>
          <Bell /> <span className="max-[720px]:hidden">Surfaces</span>
        </Button>
      </div>
    </>
  );
}
