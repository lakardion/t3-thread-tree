import { Archive, LocateFixed, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { find, type Hit } from "../shared/find.ts";
import { needsYou } from "./attention.ts";
import { ago } from "./format.ts";
import { StatusIcon } from "./status-icon.tsx";

/** True on macOS, where Find is Cmd+K. */
export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export const FIND_KEY = MAC ? "⌘K" : "Ctrl+K";

/** The most threads that the empty query lists. */
const RECENT_MAX = 8;
const SETTLED_ROW = "find:settled-search";

export function FindButton({ open }: { open: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Find"
          aria-keyshortcuts={MAC ? "Meta+K" : "Control+K"}
          onClick={open}
        >
          <Search />
          <span className="max-[720px]:hidden">Find</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Find {FIND_KEY}</TooltipContent>
    </Tooltip>
  );
}

/** The recent threads of the empty query: the Focus threads, then the newest updated. */
const recent = (list: Hit[], focus: string[]): Hit[] => {
  const slots = focus.flatMap((id) => list.filter((h) => h.t.id === id));
  const rest = list
    .filter((h) => !focus.includes(h.t.id))
    .toSorted((a, b) => Number(b.t.updatedAt > a.t.updatedAt) - Number(b.t.updatedAt < a.t.updatedAt));
  return [...slots, ...rest].slice(0, RECENT_MAX);
};

type RowProps = {
  h: Hit;
  now: number;
  canShow: boolean;
  open: (h: Hit) => void;
  show: (id: string) => void;
};

function Row({ h, now, canShow, open, show }: RowProps) {
  const { t } = h;
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
            {needsYou(t.status) || t.status === "failed"
              ? `${t.phrase}${needsYou(t.status) && t.since ? ` · ${ago(t.since, now)}` : ""}`
              : ago(t.updatedAt, now)}
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
          title="Show in tree"
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

const IconState = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
    {icon}
    {children}
  </div>
);

type BodyProps = {
  list: Hit[];
  focus: string[];
  settledOn: boolean;
  canShow: (id: string) => boolean;
  now: number;
  open: (h: Hit) => void;
  show: (id: string) => void;
};

/** The search and the results. It mounts with the dialog, so the query and the settled search reset on close. */
function FindBody({ list, focus, settledOn, canShow, now, open, show }: BodyProps) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [settledMode, setSettledMode] = useState(false);
  /** The settled hits with the query they answer, so a newer query never shows older hits. */
  const [settledHits, setSettledHits] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (!settledMode || !query) return;
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
  }, [settledMode, query]);

  const active = query ? find(list, query) : recent(list, focus);
  const settled = settledMode && query && settledHits.q === query ? settledHits.hits : [];
  const offerSettled = query !== "" && !settledOn && !settledMode;
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
        {active.length === 0 &&
          settled.length === 0 &&
          (query ? (
            <IconState icon={<SearchX className="size-6" aria-hidden />}>No thread matches</IconState>
          ) : (
            <IconState icon={<Search className="size-6" aria-hidden />}>
              Find by title, issue key, project, branch or #PR
            </IconState>
          ))}
        {active.length > 0 && (
          <CommandGroup heading={query ? "Threads" : "Recent"}>{active.map((h) => row(h))}</CommandGroup>
        )}
        {settled.length > 0 && <CommandGroup heading="Settled">{settled.map((h) => row(h))}</CommandGroup>}
        {offerSettled && (
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
  focus,
  settledOn,
  canShow,
  reveal,
  now,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  list: Hit[];
  focus: string[];
  settledOn: boolean;
  canShow: (id: string) => boolean;
  reveal: (id: string) => Promise<boolean>;
  now: number;
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
          focus={focus}
          settledOn={settledOn}
          canShow={canShow}
          now={now}
          open={(h) => {
            setOpen(false);
            location.assign(h.t.href);
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
