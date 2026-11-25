import { Archive, LocateFixed, Search, SearchX, Workflow as WorkflowIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { find, type Hit } from "../shared/find.ts";
import { CATCH_UP, isIn } from "../shared/status.ts";
import type { Workflow } from "../shared/workflow-start.ts";
import { ago, agoAt } from "./format.ts";
import { IconState } from "./icon-state.tsx";
import { needsYou } from "./needs-you.ts";
import { StatusIcon } from "./status-icon.tsx";
import { byNewest, lastRunOf } from "./view.ts";
import { fits } from "./workflow-start.ts";

/** True on macOS, where Find is Cmd+K. */
export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const FIND_KEY = MAC ? "⌘K" : "Ctrl+K";

/** The most threads that the empty query lists. */
const RECENT_MAX = 8;
const SETTLED_ROW = "find:settled-search";

/** The recent threads of the empty query: the newest Last run. */
const recent = (list: Hit[]): Hit[] => byNewest(list, (h) => lastRunOf(h.t)).slice(0, RECENT_MAX);

type RowProps = {
  h: Hit;
  now: number;
  canShow: boolean;
  open: (h: Hit) => void;
  show: (id: string) => void;
};

function Row({ h, now, canShow, open, show }: RowProps) {
  const { t } = h;
  const lastRun = lastRunOf(t);
  const meta = [h.project, t.key, t.detail.branch].filter(Boolean).join(" · ") + (h.parent ? ` · in ${h.parent}` : "");
  return (
    <CommandItem value={t.id} onSelect={() => open(h)} className="items-start gap-2.5 py-2">
      <span className="mt-1 flex-none">
        <StatusIcon t={t} now={now} />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 text-[13px] leading-5 font-medium break-words",
              t.settled && "text-muted-foreground",
            )}
          >
            {t.title || t.id}
          </span>
          <span className="flex-none text-[12px] leading-5 text-muted-foreground tabular-nums">
            {isIn(CATCH_UP, t.status)
              ? `${t.phrase}${needsYou(t.status) && t.since ? ` · ${ago(t.since, now)}` : ""}`
              : lastRun > -Infinity && agoAt(lastRun, now)}
          </span>
        </span>
        <span className="truncate text-[12px] text-muted-foreground">{meta}</span>
      </span>
      {canShow && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="flex-none text-muted-foreground"
          aria-label={`Show ${t.title || t.id} in tree`}
          title="Show in tree (Shift+Enter)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            show(t.id);
          }}
        >
          <LocateFixed />
        </Button>
      )}
    </CommandItem>
  );
}

type BodyProps = {
  list: Hit[];
  canShow: (id: string) => boolean;
  now: number;
  open: (h: Hit) => void;
  show: (id: string) => void;
  workflows: Workflow[] | null;
  start: (w: Workflow) => void;
};

/** The "Start a workflow" group of the `>` mode. `text` is the query after the `>`. */
function StartGroup({
  workflows,
  text,
  start,
}: {
  workflows: Workflow[] | null;
  text: string;
  start: (w: Workflow) => void;
}) {
  /** No workflows snapshot yet: the list is not known, so no empty text. */
  if (!workflows) return null;
  const list = workflows.filter((w) => fits(w, { kind: "none" }));
  const shown = list.filter((w) => w.name.toLowerCase().includes(text.toLowerCase()));
  if (shown.length === 0)
    return (
      <IconState icon={<WorkflowIcon className="size-6" aria-hidden />}>
        {list.length === 0
          ? "No workflows. Turn on Workflows in T3 Settings → Labs, or add a workflow file."
          : "No workflow matches"}
      </IconState>
    );
  return (
    <CommandGroup heading="Start a workflow">
      {shown.map((w) => (
        <CommandItem key={w.name} value={`wf:${w.name}`} onSelect={() => start(w)} className="gap-2.5 py-2">
          <WorkflowIcon className="size-4 text-muted-foreground" />
          <span className="font-mono text-[13px] font-medium">{w.name}</span>
          <span className="text-[11px] text-muted-foreground">v{w.version}</span>
          {w.triggers.length > 0 && (
            <span className="truncate text-[11px] text-muted-foreground">· {w.triggers.join(", ")}</span>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** The search and the results. It mounts with the dialog, so the query and the settled search reset on close. */
function FindBody({ list, canShow, now, open, show, workflows, start }: BodyProps) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [settledMode, setSettledMode] = useState(false);
  /** The settled hits with the query they answer, so a newer query never shows older hits. */
  const [settledHits, setSettledHits] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const query = q.trim();
  /** A query that starts with `>` lists workflows only. */
  const startMode = query.startsWith(">");
  useEffect(() => {
    if (!settledMode || !query || startMode) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/find?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<Hit[]>)
        .then(
          (hits) => setSettledHits({ q: query, hits }),
          () => {},
        );
    }, 200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [settledMode, query, startMode]);

  const active = query ? find(list, query) : recent(list);
  const settled = settledMode && query && settledHits.q === query ? settledHits.hits : [];
  const offerSettled = query !== "" && !settledMode;
  const byValue = new Map([...active, ...settled].map((h) => [h.t.id, h]));
  const row = (h: Hit) => <Row key={h.t.id} h={h} now={now} canShow={canShow(h.t.id)} open={open} show={show} />;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || !e.shiftKey) return;
    /** cmdk skips its own select on a handled event. */
    e.preventDefault();
    const h = byValue.get(sel);
    if (h && canShow(h.t.id)) show(h.t.id);
  };
  return (
    <Command
      shouldFilter={false}
      value={sel}
      onValueChange={setSel}
      onKeyDown={onKeyDown}
      className="min-h-0 rounded-[inherit] [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:pr-11"
    >
      <CommandInput value={q} onValueChange={setQ} placeholder="Find a thread" className="h-12 text-[15px]" />
      <CommandList className="max-h-[min(60vh,480px)] max-[720px]:max-h-none max-[720px]:flex-1">
        {startMode && <StartGroup workflows={workflows} text={query.slice(1).trim()} start={start} />}
        {!startMode &&
          active.length === 0 &&
          settled.length === 0 &&
          (query ? (
            <IconState icon={<SearchX className="size-6" aria-hidden />}>No thread matches</IconState>
          ) : (
            <IconState icon={<Search className="size-6" aria-hidden />}>
              Find by title, issue key, project, branch or #PR
            </IconState>
          ))}
        {!startMode && active.length > 0 && (
          <CommandGroup heading={query ? "Threads" : "Recent"}>{active.map((h) => row(h))}</CommandGroup>
        )}
        {!startMode && settled.length > 0 && (
          <CommandGroup heading="Settled">{settled.map((h) => row(h))}</CommandGroup>
        )}
        {offerSettled && !startMode && (
          <CommandGroup>
            <CommandItem
              value={SETTLED_ROW}
              onSelect={() => setSettledMode(true)}
              className="cursor-pointer hover:bg-foreground/10 data-[selected=true]:hover:bg-foreground/10"
            >
              <Archive />
              Search settled threads
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
      {!startMode && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Type <Kbd>&gt;</Kbd> to start a workflow
        </div>
      )}
      <div
        aria-hidden
        data-hint="find-bar"
        className="key-hint right-2 bottom-2 left-2 h-8 items-center gap-3 rounded-md border bg-popover/95 px-3 text-[11px] text-muted-foreground shadow-md backdrop-blur"
      >
        <span className="flex items-center gap-1">
          <Kbd>↑↓</Kbd> Move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> Open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⇧↵</Kbd> Show in tree
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>esc</Kbd> Close
        </span>
      </div>
    </Command>
  );
}

/**
 * Finds any loaded thread. Enter or a click opens it. Shift+Enter or the row button closes the dialog and shows the
 * row in the tree.
 */
export function FindDialog({
  open,
  setOpen,
  list,
  canShow,
  reveal,
  now,
  workflows,
  start,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  list: Hit[];
  canShow: (id: string) => boolean;
  reveal: (id: string) => Promise<boolean>;
  now: number;
  workflows: Workflow[] | null;
  /** Called with the picked workflow. The dialog closes first. */
  start: (w: Workflow) => void;
}) {
  /** Set while a Show in tree closes the dialog, so the focus return does not fight the scroll. */
  const revealing = useRef(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-find=""
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 max-[720px]:top-0 max-[720px]:left-0 max-[720px]:h-dvh max-[720px]:max-w-none! max-[720px]:translate-x-0 max-[720px]:rounded-none max-[720px]:border-0 sm:max-w-xl"
        onCloseAutoFocus={(e) => {
          if (revealing.current) e.preventDefault();
          revealing.current = false;
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Find</DialogTitle>
          <DialogDescription>Find a thread by title, issue key, project, branch or PR number.</DialogDescription>
        </DialogHeader>
        <FindBody
          list={list}
          canShow={canShow}
          now={now}
          workflows={workflows}
          start={(w) => {
            setOpen(false);
            start(w);
          }}
          open={(h) => {
            setOpen(false);
            if (h.t.run) window.open(h.t.href, "_blank");
            else location.assign(h.t.href);
          }}
          show={(id) => {
            revealing.current = true;
            setOpen(false);
            void reveal(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
