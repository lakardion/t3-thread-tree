// Three placements for Catch-up on the existing demo page, switchable with ?catchup=.
import { ChevronLeft, ChevronRight, Monitor, SkipForward } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ThreadNode } from "../shared/tree.ts";
import { DEMO_CATCH_UP, demoLastMessage } from "./catch-up-prototype-data.ts";
import { ago, stripKey } from "./format.ts";
import { ProjectIcon } from "./project-icon.tsx";
import { LastMessage } from "./send-dialog.tsx";
import { STATUS, StatusIcon } from "./status-icon.tsx";

const variants = [
  { key: "under-title", label: "Under title" },
  { key: "ask-first", label: "Ask first" },
  { key: "in-details", label: "In details" },
] as const;
const states = ["ready", "loading", "failed", "off"] as const;
type Variant = (typeof variants)[number];
type State = (typeof states)[number];
type Reading = { did: string; ask: string } | { raw: string | null };

const titles: Partial<Record<ThreadNode["status"], string>> = {
  "needs-input": "Needs input",
  "plan-ready": "Plan ready",
  "your-turn": "Your turn",
  failed: "Failed",
};

export const isCatchUpDemoThread = (t: ThreadNode) => t.href.startsWith("t3code://threads/demo/");
const eligible = (t: ThreadNode) => isCatchUpDemoThread(t) && !t.settled && t.status in titles;
const reading = (t: ThreadNode): Reading => DEMO_CATCH_UP[t.id] ?? { raw: demoLastMessage(t.id, t.title) };

export function useCatchUpPrototype(enabled: boolean) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      variants.findIndex((v) => v.key === new URL(location.href).searchParams.get("catchup")),
    ),
  );
  const [state, setState] = useState<State>("ready");
  const [mock, setMock] = useState(false);
  const cycle = (offset: number) => {
    const next = (index + offset + variants.length) % variants.length;
    const url = new URL(location.href);
    url.searchParams.set("catchup", variants[next]!.key);
    history.replaceState(null, "", url);
    setIndex(next);
  };
  useEffect(() => {
    if (!enabled) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        (e.target instanceof Element &&
          e.target.closest(
            "input, textarea, select, [contenteditable], [role=combobox], [role=dialog], [role=listbox], [role=menu]",
          ))
      )
        return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      cycle(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [enabled, index]);
  return { enabled, variant: variants[index]!, state, setState, mock, setMock, cycle };
}

type Prototype = ReturnType<typeof useCatchUpPrototype>;
export const CatchUpPrototype = createContext<Prototype | null>(null);

export function useCatchUpReading(t: ThreadNode, placement: Variant["key"]) {
  const prototype = useContext(CatchUpPrototype);
  if (!prototype?.enabled || prototype.variant.key !== placement || prototype.state === "off" || !eligible(t))
    return null;
  if (placement === "ask-first" && (t.status === "your-turn" || prototype.state !== "ready")) return null;
  return { state: prototype.state, line: reading(t) };
}

export function CatchUpText({
  line,
  variant,
  actionOnly,
}: {
  line: Reading;
  variant: Variant["key"];
  actionOnly?: boolean;
}) {
  if ("raw" in line)
    return line.raw ? (
      <>
        <span className="font-medium">Last message</span> · {line.raw}
      </>
    ) : null;
  if (variant === "ask-first")
    return (
      <>
        <strong className="font-semibold text-foreground">Ask · {line.ask}</strong>
        {!actionOnly && (
          <>
            {" "}
            <span className="text-muted-foreground">· {line.did}</span>
          </>
        )}
      </>
    );
  if (variant === "in-details")
    return (
      <>
        {line.did} <span className="rounded bg-muted px-1 font-semibold text-foreground">Ask</span> {line.ask}
      </>
    );
  return (
    <>
      {line.did} <strong className="font-semibold text-foreground">Asks · {line.ask}</strong>
    </>
  );
}

export function CatchUpStateText({ state }: { state: "loading" | "failed" }) {
  return state === "loading" ? "Preparing Catch-up…" : "Catch-up unavailable";
}

export function CatchUpSubline({ line, state, showSource }: { line: Reading; state: State; showSource: () => void }) {
  if (state === "off") return null;
  return (
    <div className="flex items-baseline gap-2 text-xs leading-4 text-muted-foreground">
      <span className="min-w-0 break-words">
        {state === "ready" ? <CatchUpText line={line} variant="under-title" /> : <CatchUpStateText state={state} />}
      </span>
      <button
        type="button"
        className="shrink-0 text-[11px] underline-offset-2 hover:underline"
        onClick={showSource}
        aria-label="Show last message"
      >
        Source
      </button>
    </div>
  );
}

export function CatchUpBar({ prototype: p }: { prototype: Prototype }) {
  return (
    <div className="fixed bottom-2 left-1/2 z-30 flex w-max max-w-[calc(100%-12px)] -translate-x-1/2 items-center gap-1 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
      <Button variant="ghost" size="icon-sm" aria-label="Previous variant" onClick={() => p.cycle(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-[66px] text-center text-xs font-semibold" aria-live="polite">
        {p.variant.label}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Next variant" onClick={() => p.cycle(1)}>
        <ChevronRight />
      </Button>
      <div className="mx-0.5 h-5 border-l" />
      <select
        aria-label="Catch-up state"
        className="h-8 rounded-md border bg-background px-1.5 text-xs capitalize"
        value={p.state}
        onChange={(e) => p.setState(e.target.value as State)}
      >
        {states.map((state) => (
          <option key={state} value={state}>
            {state}
          </option>
        ))}
      </select>
      <Button
        variant={p.mock ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={p.mock}
        onClick={() => p.setMock(!p.mock)}
      >
        <Monitor /> Desktop
      </Button>
    </div>
  );
}

type Sample = { thread: ThreadNode; project: string };

export function CatchUpDesktopMock({
  prototype: p,
  samples,
  now,
  targetId,
}: {
  prototype: Prototype;
  samples: Sample[];
  now: number;
  targetId?: string;
}) {
  const [id, setId] = useState("demo-2");
  const [showSource, setShowSource] = useState(false);
  const waiting = samples.filter(({ thread }) => eligible(thread));
  const sample = waiting.find(({ thread }) => thread.id === id) ?? waiting[0];
  if (!sample) return null;

  const { thread: t, project } = sample;
  const line = reading(t);
  const raw = demoLastMessage(t.id, t.title);
  const ready = p.state === "ready" && (!("raw" in line) || line.raw);
  const title = titles[t.status];
  const inQueue = t.status !== "failed";
  const inMenu = t.status === "needs-input" || t.status === "plan-ready";
  const catchUp = <CatchUpText line={line} variant={p.variant.key} />;
  const box = "min-w-0 rounded-lg border bg-background";
  const heading = "mb-1.5 text-[11px] font-semibold text-muted-foreground";
  return (
    <section aria-label="Desktop mock" className="mb-3 rounded-xl border bg-card p-3 text-xs">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-semibold">Desktop mock</h2>
        <select
          className="h-8 max-w-full min-w-0 rounded-md border bg-background px-2 text-xs sm:max-w-[410px]"
          aria-label="Preview thread"
          value={t.id}
          onChange={(e) => {
            setId(e.target.value);
            setShowSource(false);
          }}
        >
          {waiting.map(({ thread }) => (
            <option key={thread.id} value={thread.id}>
              {titles[thread.status]} · {thread.title}
            </option>
          ))}
        </select>
        {raw && (
          <Button
            variant="link"
            size="xs"
            className="px-0"
            aria-expanded={showSource}
            onClick={() => setShowSource(!showSource)}
          >
            Last message
          </Button>
        )}
      </div>
      <div className="grid gap-3 min-[950px]:grid-cols-3">
        <div className="min-w-0">
          <h3 className={heading}>Notification</h3>
          {t.status === "your-turn" ? (
            <p className="text-muted-foreground">Your turn does not send a notification.</p>
          ) : (
            <div className={cn(box, "space-y-1 p-2.5")}>
              <div className="flex items-center gap-1.5 font-semibold">
                <StatusIcon t={t} now={now} />
                {title}
              </div>
              <div className="font-medium">{t.title}</div>
              {ready && <div className="text-muted-foreground">{catchUp}</div>}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className={heading}>Up next window</h3>
          {inQueue ? (
            <div className={cn(box, "overflow-hidden")}>
              <div className="flex h-9 items-center justify-between border-b px-2 font-semibold">
                Up next{" "}
                <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium">
                  <SkipForward className="size-3" /> Open next
                </span>
              </div>
              <div className="p-1">
                <div
                  className={cn(
                    "rounded-md border-l-2 border-transparent px-2",
                    t.id === targetId && "border-status-needs-input bg-accent/50",
                  )}
                >
                  <div className="flex h-7 items-center gap-1.5 text-[13px]">
                    <StatusIcon t={t} now={now} />
                    <ProjectIcon name={project} />
                    {t.key && <span className="flex-none font-mono text-[11px] text-muted-foreground">{t.key}</span>}
                    <span className="min-w-0 flex-1 truncate">{t.key ? stripKey(t.title, t.key) : t.title}</span>
                    {t.since && (
                      <span className={cn(STATUS[t.status].shape, "font-mono text-xs")}>{ago(t.since, now)}</span>
                    )}
                  </div>
                  {ready && <div className="pb-1.5 pl-5 text-muted-foreground">{catchUp}</div>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Failed threads stay out of Up next.</p>
          )}
        </div>
        <div className="min-w-0">
          <h3 className={heading}>macOS menu bar</h3>
          {inMenu ? (
            <div className={cn(box, "truncate px-2.5 py-1.5 font-medium")}>
              {ready && p.variant.key === "ask-first" && "ask" in line
                ? `${t.key ?? title} · ${line.ask}`
                : `${title} · ${t.title}`}
            </div>
          ) : (
            <p className="text-muted-foreground">The Needs-you list shows needs input and plan ready.</p>
          )}
        </div>
      </div>
      {showSource && raw && (
        <div className="mt-2.5">
          <LastMessage text={raw} />
        </div>
      )}
    </section>
  );
}
