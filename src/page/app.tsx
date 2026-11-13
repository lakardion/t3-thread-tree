import {
  Accessibility,
  type defaultPreset,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Draggable,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { Check, ChevronDown, ChevronRight, ExternalLink, GripVertical, Layers, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BriefState, Cli } from "../shared/brief.ts";
import { allThreads, type Branch, type PrNode, type ThreadNode, type Tree } from "../shared/tree.ts";
import { countAttention, needsYou, onlyNeedsYou } from "./attention.ts";
import { BriefControls, BriefPanel, type Offered } from "./brief.tsx";
import { ago, folded, isKeyGroup, linearHref, phraseWith, stackRuns, stripKey } from "./format.ts";
import {
  PROJECTS,
  arrange,
  isTail,
  parseOrders,
  prune,
  groupsKey,
  reorder,
  runUnitId,
  threadUnitId,
  threadsKey,
  type Freeze,
} from "./order.ts";
import { Presence, useMotion } from "./presence.tsx";
import { STATUS, StatusIcon } from "./status-icon.tsx";
import { Swap, useChanges } from "./swap.tsx";

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only";
const CLOSED_KEY = "thread-tree:closed";
const SETTLED_KEY = "thread-tree:settled";
const FILTER_KEY = "thread-tree:filter";
const THEME_KEY = "thread-tree:theme";
const CLI_KEY = "thread-tree:cli";
const ORDER_KEY = "thread-tree:order";
const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const load = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const forget = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {}
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const until = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

const Now = createContext(Date.now());
const Details = createContext<{ open: Set<string>; toggle: (id: string) => void; show: (id: string) => void }>({
  open: new Set(),
  toggle: () => {},
  show: () => {},
});
const NeedsOnly = createContext(false);
const Linear = createContext<Tree["linear"]>(null);
/** The rendered ids of each list, by list key. */
const Lists = createContext(new Map<string, string[]>());

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
const ROW_BUTTON =
  "size-5 rounded-[6px] text-muted-foreground motion-reduce:transition-none pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const NEED_CHIP =
  "border-transparent bg-[color-mix(in_oklch,var(--status-needs-input)_var(--wash),transparent)] text-status-needs-input-fg";
const FILTER_ITEM =
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const Mark = ({ title, children }: { title: string; children: ReactNode }) => (
  <span title={title} className="inline-flex [&>svg]:size-3">
    {children}
  </span>
);

type RefFn = (el: Element | null) => void;
type Sort = { id: string; list: string; index: number; name: string };

/** A unit gets sort props only when its list has two or more units and it is in the list. */
const sortOf = (lists: Map<string, string[]>, list: string, id: string, name: string): Sort | undefined => {
  const ids = lists.get(list);
  const index = ids?.indexOf(id) ?? -1;
  return ids && ids.length > 1 && index >= 0 ? { id, list, index, name } : undefined;
};

function SortHook({ sort, children }: { sort: Sort; children: (ref: RefFn, handleRef: RefFn) => ReactNode }) {
  const motion = useMotion();
  const { ref, handleRef } = useSortable({
    id: sort.id,
    index: sort.index,
    group: sort.list,
    type: sort.list,
    accept: sort.list,
    data: { name: sort.name },
  });
  const both = useCallback<RefFn>(
    (el) => {
      ref(el);
      motion(el);
    },
    [ref, motion],
  );
  return children(both, handleRef);
}

function MotionHook({ children }: { children: (ref: RefFn) => ReactNode }) {
  return children(useMotion());
}

/** Renders `children` with the sort refs of `sort`, or with only the motion ref when `sort` is unset. */
const Sortable = ({ sort, children }: { sort?: Sort; children: (ref: RefFn, handleRef?: RefFn) => ReactNode }) =>
  sort ? <SortHook sort={sort}>{children}</SortHook> : <MotionHook>{children}</MotionHook>;

const DragHandle = ({ handleRef, name, className }: { handleRef?: RefFn; name: string; className?: string }) =>
  handleRef && (
    <Button
      ref={handleRef}
      variant="ghost"
      size="icon"
      aria-label={`Move ${name}`}
      className={cn(
        ROW_BUTTON,
        "cursor-grab opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        className,
      )}
    >
      <GripVertical className="size-3.5" />
    </Button>
  );

function PrChip({ p }: { p: PrNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP,
        "font-mono focus-visible:ring-0",
        p.draft && "border-dashed",
        "duration-300 motion-reduce:transition-none",
        p.state === "merged" && "text-pr-merged",
      )}
      asChild
    >
      <a href={p.url} target="_blank" rel="noreferrer" title={p.draft ? `${p.state} · draft` : p.state}>
        <Swap k={`${p.state}|${p.draft}`}>
          <span className={cn(p.state === "closed" && "line-through")}>#{p.n}</span>
        </Swap>
        <Swap k={p.checks ?? ""}>
          {p.checks === "passing" && (
            <Mark title="Checks passing">
              <span className="size-1.5 rounded-full bg-status-done" />
            </Mark>
          )}
          {p.checks === "failing" && (
            <Mark title="Checks failing">
              <span className="size-1.5 rounded-full bg-status-failed" />
            </Mark>
          )}
          {p.checks === "pending" && (
            <Mark title="Checks pending">
              <span className="size-1.5 rounded-full border border-status-needs-input" />
            </Mark>
          )}
        </Swap>
        <Swap k={p.review ?? ""}>
          {p.review === "approved" && (
            <Mark title="Approved">
              <Check className="text-status-done" />
            </Mark>
          )}
          {p.review === "changes-requested" && (
            <Mark title="Changes requested">
              <X className="text-status-failed" />
            </Mark>
          )}
        </Swap>
        <Swap k={p.conflicting ? "1" : ""}>
          {p.conflicting && (
            <Mark title="Merge conflict">
              <TriangleAlert className="text-status-needs-input" />
            </Mark>
          )}
        </Swap>
      </a>
    </Badge>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  );
}

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono">{children}</span>;

function DetailBlock({ t }: { t: ThreadNode }) {
  const now = useContext(Now);
  const d = t.detail;
  const limit = [d.limitResetAt && `resets ${hhmm(d.limitResetAt)}`, d.autoResume && "auto-resume"]
    .filter(Boolean)
    .join(" · ");
  const tags = [d.tags.join(", "), d.pinned && "Pinned"].filter(Boolean).join(" · ");
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-1 pl-[156px] text-xs max-[720px]:pl-7">
      {d.request && <Line label="Request">{d.request}</Line>}
      {d.error && (
        <Line label="Error">
          {[[d.error.class, d.error.code].filter(Boolean).join(" · "), d.error.text].filter(Boolean).join(" ")}
        </Line>
      )}
      {limit && <Line label="Limit">{limit}</Line>}
      {d.stopRequested && <Line label="Run">Stop requested</Line>}
      {(d.model || d.planMode) && (
        <Line label="Model">
          {d.model && <Mono>{d.model}</Mono>}
          {d.model && d.planMode && " · "}
          {d.planMode && "plan mode"}
        </Line>
      )}
      {d.branch && (
        <Line label="Branch">
          <Mono>{d.branch}</Mono>
        </Line>
      )}
      {d.worktreePath && (
        <Line label="Worktree">
          <Mono>{d.worktreePath}</Mono>
        </Line>
      )}
      {d.launchedBy && (
        <Line label="Launched by">
          <a className="hover:underline" href={d.launchedBy.href}>
            {d.launchedBy.title}
          </a>
        </Line>
      )}
      {d.origin && <Line label="Origin">{d.origin}</Line>}
      {d.startedBy && <Line label="Started by">{d.startedBy}</Line>}
      {d.createdAt && <Line label="Created">{ago(d.createdAt, now)}</Line>}
      {d.goal && (
        <Line label="Goal">
          {d.goal.objective} · {d.goal.status}
        </Line>
      )}
      {tags && <Line label="Tags">{tags}</Line>}
      {t.prs.map((p, i) => (
        <Line key={p.n} label={i === 0 ? "PRs" : ""}>
          <a className="font-mono hover:underline" href={p.url} target="_blank" rel="noreferrer">
            #{p.n}
          </a>{" "}
          {[
            p.title,
            p.draft ? `${p.state} (draft)` : p.state,
            p.checks && `checks ${p.checks}`,
            p.review,
            p.additions !== null && p.deletions !== null && `+${p.additions} -${p.deletions}`,
            p.changedFiles !== null && `${p.changedFiles} ${p.changedFiles === 1 ? "file" : "files"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Line>
      ))}
    </dl>
  );
}

function ThreadRow({ t, chip, sort }: { t: ThreadNode; chip?: string; sort?: Sort }) {
  const now = useContext(Now);
  const { open, toggle, show } = useContext(Details);
  const dim = useContext(NeedsOnly) && !needsYou(t.status);
  const linear = useContext(Linear);
  const chipHref = chip ? linearHref(chip, linear) : null;
  const pulse = useChanges(t.status);
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open.has(t.id)} onOpenChange={() => toggle(t.id)}>
      <li ref={ref} className="my-px">
        <div
          className="thread-row group/row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 text-[13px] leading-5 max-[720px]:flex-wrap max-[720px]:py-1"
          data-status={t.status}
        >
          <StatusIcon t={t} />
          {pulse > 0 && <span key={pulse} aria-hidden className={cn("row-pulse", STATUS[t.status].shape)} />}
          <Swap
            k={`${t.status}|${t.phrase}`}
            className={cn(
              "w-[120px] flex-none grid-cols-[minmax(0,1fr)] text-xs font-medium transition-colors duration-300 motion-reduce:transition-none [&>*]:truncate",
              dim ? "text-muted-foreground" : STATUS[t.status].text,
            )}
          >
            {phraseWith(t, now)}
          </Swap>
          {chip && (
            <Badge
              variant="outline"
              className={cn(CHIP, "flex-none font-mono", chipHref && "hover:underline")}
              asChild={!!chipHref}
            >
              {chipHref ? (
                <a href={chipHref} target="_blank" rel="noreferrer" title="Open in Linear">
                  {chip}
                </a>
              ) : (
                chip
              )}
            </Badge>
          )}
          <a
            className={cn(
              "min-w-0 flex-1 truncate hover:underline max-[720px]:line-clamp-2 max-[720px]:whitespace-normal",
              t.status === "your-turn" ? "font-[650]" : "font-medium",
              (t.status === "snoozed" || t.settled || dim) && "text-muted-foreground",
              chip && "max-[720px]:basis-full max-[720px]:pl-5",
            )}
            href={t.href}
          >
            {(chip ? stripKey(t.title, chip) : t.title) || t.id}
          </a>
          <span className="ml-auto flex flex-none items-center gap-1.5 max-[720px]:ml-0 max-[720px]:basis-full max-[720px]:flex-wrap max-[720px]:pl-5">
            {t.input && (
              <Badge variant="outline" className={CHIP}>
                Input
              </Badge>
            )}
            {t.snoozedUntil && (
              <Badge variant="outline" className={CHIP}>
                until {until(t.snoozedUntil)}
              </Badge>
            )}
            {t.settled && (
              <Badge variant="outline" className={CHIP}>
                Settled
              </Badge>
            )}
            {t.stack && (
              <Badge variant="outline" className={cn(CHIP, "chip-stack")} title="PR stack">
                <Layers />
                {t.stack.pos ? `${t.stack.pos}/${t.stack.total}` : `base · ${t.stack.total}`}
              </Badge>
            )}
            {t.prs.slice(0, 2).map((p) => (
              <PrChip key={p.n} p={p} />
            ))}
            {t.prs.length > 2 && (
              <Button
                variant="ghost"
                className={cn(ROW_BUTTON, "w-auto px-1 text-[11px] font-normal")}
                title={`Show all ${t.prs.length} pull requests`}
                onClick={() => show(t.id)}
              >
                +{t.prs.length - 2}
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {ago(t.updatedAt, now)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Updated {new Date(t.updatedAt).toLocaleString()}</TooltipContent>
            </Tooltip>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(ROW_BUTTON, "group")} aria-label="Details">
                <ChevronDown className="size-3.5 group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            {handleRef ? (
              <DragHandle handleRef={handleRef} name={t.title || t.id} />
            ) : (
              <span aria-hidden className="size-5 flex-none pointer-coarse:min-h-11 pointer-coarse:min-w-11" />
            )}
          </span>
        </div>
        <CollapsibleContent>
          <DetailBlock t={t} />
        </CollapsibleContent>
        {t.children.length > 0 && (
          <ul className="m-0 list-none pl-4">
            <Presence items={t.children} keyOf={(c) => c.id}>
              {(c) => <ThreadRow t={c} />}
            </Presence>
          </ul>
        )}
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

const Chevron = ({ open }: { open: boolean }) => {
  const Icon = open ? ChevronDown : ChevronRight;
  return <Icon className="size-3.5 flex-none text-muted-foreground" />;
};

/** One status icon for each thread of a closed branch, in tree order. */
const Icons = ({ b }: { b: Branch }) => (
  <span className="inline-flex flex-wrap items-center gap-[3px]">
    {allThreads(b).map((t) => (
      <StatusIcon key={t.id} t={t} />
    ))}
  </span>
);

type Fold = { closed: Set<string>; toggle: (id: string) => void };

function GroupRow({ b, closed, toggle, sort }: { b: Branch; sort?: Sort } & Fold) {
  const open = !closed.has(b.id);
  const one = folded(b);
  const linear = useContext(Linear);
  const lists = useContext(Lists);
  const groupHref = isKeyGroup(b) ? linearHref(b.label, linear) : null;
  if (one) return <ThreadRow t={one} chip={b.label} sort={sort} />;
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
      <li ref={ref} className="my-px">
        <div className="group/row flex h-7 min-w-0 items-center gap-2 rounded-[8px] px-2 hover:bg-accent max-[720px]:h-auto max-[720px]:min-h-7 max-[720px]:flex-wrap">
          <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-center gap-2 select-none max-[720px]:min-h-11">
            <Chevron open={open} />
            <span
              className={cn("truncate text-xs font-semibold", isKeyGroup(b) ? "font-mono" : "text-muted-foreground")}
            >
              {b.label}
            </span>
          </CollapsibleTrigger>
          {groupHref && (
            <a
              href={groupHref}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${b.label} in Linear`}
              title="Open in Linear"
              className="flex-none text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          {!open && <Icons b={b} />}
          <DragHandle handleRef={handleRef} name={b.label} className="ml-auto" />
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none pl-4">
            <Presence items={b.branches} keyOf={(c) => c.id}>
              {(c) => (
                <GroupRow b={c} closed={closed} toggle={toggle} sort={sortOf(lists, groupsKey(b.id), c.id, c.label)} />
              )}
            </Presence>
            <Presence items={b.threads} keyOf={(t) => t.id}>
              {(t) => <ThreadRow t={t} sort={sortOf(lists, threadsKey(b.id), threadUnitId(t), t.title || t.id)} />}
            </Presence>
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** Key groups of one PR stack, in one rail with a label row. */
function StackRail({ run, closed, toggle, sort }: { run: Branch[]; sort?: Sort } & Fold) {
  const { total, base } = run[0].stack!;
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <li ref={ref} className="stack-rail my-1">
      <div className="group/row flex min-h-6 flex-wrap items-center gap-x-1.5 px-2 text-xs text-muted-foreground">
        <Layers className="size-3 flex-none" aria-hidden />
        <span>
          PR stack · {total} PRs
          {base && (
            <>
              {" "}
              · base <code className="font-mono">{base}</code>
            </>
          )}
        </span>
        <DragHandle handleRef={handleRef} name={`PR stack of ${run[0].label}`} className="ml-auto" />
      </div>
      <ul className="m-0 list-none p-0">
        <Presence items={run} keyOf={(c) => c.id}>
          {(c) => <GroupRow b={c} closed={closed} toggle={toggle} />}
        </Presence>
      </ul>
    </li>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

function ProjectCard({ b, closed, toggle }: { b: Branch } & Fold) {
  const open = !closed.has(b.id);
  const lists = useContext(Lists);
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <li ref={ref} className="not-last:mb-3">
      <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
        <Card className="gap-0 overflow-hidden rounded-[12px] py-0 shadow-none">
          <CardHeader className="project-head group/row flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1">
            <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-center gap-2 select-none max-[720px]:min-h-11">
              <Chevron open={open} />
              <span
                aria-hidden
                className="flex size-5 flex-none items-center justify-center rounded-[5px] bg-muted text-[11px] font-semibold text-muted-foreground uppercase"
              >
                {b.label[0]}
              </span>
              <span data-slot="card-title" className="truncate text-sm leading-5 font-semibold">
                {b.label}
              </span>
            </CollapsibleTrigger>
            {b.repo && <CardDescription className="truncate font-mono text-xs">{b.repo}</CardDescription>}
            {!open && <Icons b={b} />}
            <DragHandle handleRef={handleRef} name={b.label} className="ml-auto" />
          </CardHeader>
          <CollapsibleContent asChild>
            <CardContent className="p-1.5">
              <ul className="m-0 list-none p-0">
                <Presence
                  items={stackRuns(b.branches)}
                  keyOf={(run) => (run[0].stack ? `rail:${run[0].id}` : run[0].id)}
                >
                  {(run) => {
                    const sort = !isTail(run[0])
                      ? sortOf(
                          lists,
                          groupsKey(b.id),
                          runUnitId(b.id, run),
                          run[0].stack ? `PR stack of ${run[0].label}` : run[0].label,
                        )
                      : undefined;
                    return run[0].stack ? (
                      <StackRail run={run} closed={closed} toggle={toggle} sort={sort} />
                    ) : (
                      <GroupRow b={run[0]} closed={closed} toggle={toggle} sort={sort} />
                    );
                  }}
                </Presence>
              </ul>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </li>
  );
  return <Sortable sort={sortOf(lists, PROJECTS, b.id, b.label)}>{render}</Sortable>;
}

function App() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [settled, setSettled] = useState(load(SETTLED_KEY) === "1");
  const [needsOnly, setNeedsOnly] = useState(load(FILTER_KEY) === "needs");
  const [theme, setTheme] = useState<Theme>(() => THEMES.find((t) => t === load(THEME_KEY)) ?? "system");
  const [now, setNow] = useState(Date.now);
  const [shown, setShown] = useState(() => new Set<string>());
  const [closed, setClosed] = useState(() => new Set<string>(JSON.parse(load(CLOSED_KEY) ?? "[]") as string[]));
  const [brief, setBrief] = useState<BriefState>({ status: "idle" });
  const [clis, setClis] = useState<Offered | null>(null);
  const [cli, setCli] = useState(load(CLI_KEY) as Cli | null);
  const [hideBrief, setHideBrief] = useState(false);
  const [orders, setOrders] = useState(() => parseOrders(load(ORDER_KEY)));
  const [freeze, setFreeze] = useState<Freeze>();

  useEffect(() => {
    fetch("/brief/clis")
      .then((r) => r.json() as Promise<Offered>)
      .then(setClis, () => setClis([]));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save(SETTLED_KEY, settled ? "1" : "0");
    const es = new EventSource(settled ? "/events?settled=1" : "/events");
    es.onmessage = (e) => setTree(JSON.parse(e.data) as Tree);
    es.addEventListener("brief", (e) => setBrief(JSON.parse(e.data) as BriefState));
    return () => es.close();
  }, [settled]);

  useEffect(() => {
    save(FILTER_KEY, needsOnly ? "needs" : "all");
  }, [needsOnly]);

  useEffect(() => {
    save(THEME_KEY, theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const toggle = (id: string) => {
    const n = new Set(closed);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setClosed(n);
    save(CLOSED_KEY, JSON.stringify([...n]));
  };

  const details = {
    open: shown,
    toggle: (id: string) =>
      setShown((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    show: (id: string) => setShown((s) => new Set(s).add(id)),
  };
  const pick = clis?.find((c) => c.id === cli)?.id ?? clis?.[0]?.id;
  const runBrief = () => {
    if (!pick) return;
    setHideBrief(false);
    void fetch(`/brief/run?settled=${settled ? 1 : 0}`, { method: "POST", body: JSON.stringify({ cli: pick }) });
  };
  const live = new Map((tree?.projects ?? []).flatMap(allThreads).map((t) => [t.id, t]));
  const counts = countAttention(tree?.projects ?? []);
  const connecting = !tree || tree.conn === "connecting";
  /** The user order on the whole tree, then the filter, then the drag freeze on what shows. */
  const full = arrange(tree?.projects ?? [], orders);
  const view = arrange(needsOnly ? onlyNeedsYou(full.projects) : full.projects, {}, freeze);
  const latest = useRef({ full, view });
  useEffect(() => {
    latest.current = { full, view };
  });
  const projects = connecting ? undefined : view.projects;

  const plugins = useCallback((defaults: typeof defaultPreset.plugins) => {
    /** The name and the "position i of n" text of a sortable `source`; n is the rendered list size. */
    const spot = (source: Draggable | null) => {
      if (!isSortable(source)) return undefined;
      const n = latest.current.view.lists.get(String(source.sortable.group))?.length ?? 0;
      return { name: String(source.data.name), at: `position ${source.sortable.index + 1} of ${n}` };
    };
    return [
      ...defaults.filter((p) => p !== Accessibility),
      Accessibility.configure({
        announcements: {
          dragstart: ({ operation }: DragStartEvent) => {
            const s = spot(operation.source);
            return s && `Picked up ${s.name}. ${s.at}.`;
          },
          dragover: ({ operation }: DragOverEvent) => {
            const s = spot(operation.source);
            return s && `${s.name} is at ${s.at}.`;
          },
          dragend: ({ operation, canceled }: DragEndEvent) => {
            const s = spot(operation.source);
            return s && (canceled ? `Move canceled. ${s.name} is back at ${s.at}.` : `${s.name} dropped at ${s.at}.`);
          },
        },
      }),
    ];
  }, []);
  const dragStart = ({ operation: { source } }: DragStartEvent) => {
    if (!isSortable(source)) return;
    const list = String(source.sortable.group);
    const ids = latest.current.view.lists.get(list);
    const units = latest.current.view.units.get(list);
    if (ids && units) setFreeze({ list, ids, units });
  };
  const dragEnd = ({ operation: { source }, canceled }: DragEndEvent) => {
    setFreeze(undefined);
    if (canceled || !isSortable(source)) return;
    const list = String(source.sortable.group);
    const all = latest.current.full.lists.get(list);
    const visible = latest.current.view.lists.get(list);
    if (!all || !visible) return;
    const moved = reorder(all, visible, source.sortable.initialIndex, source.sortable.index);
    const lists = latest.current.full.lists;
    setOrders((prev) => {
      const next = prune({ ...prev, [list]: moved }, lists);
      save(ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };
  const resetOrder = () => {
    setOrders({});
    forget(ORDER_KEY);
  };

  return (
    <TooltipProvider>
      <header className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 text-muted-foreground">
        <h1 className="m-0 text-[15px] font-semibold text-foreground">Thread tree</h1>
        {tree && (
          <div className="flex flex-wrap items-center gap-1.5">
            {counts.needYou > 0 && (
              <Badge variant="outline" className={cn(CHIP, NEED_CHIP)}>
                {counts.needYou} need you
              </Badge>
            )}
            <Badge variant="outline" className={CHIP}>
              {counts.working} working
            </Badge>
            <Badge variant="outline" className={CHIP}>
              {counts.yourTurn} your turn
            </Badge>
            <Badge variant="outline" className={CHIP}>
              {counts.stopped} stopped
            </Badge>
          </div>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Filter"
          value={needsOnly ? "needs" : "all"}
          onValueChange={(v) => v && setNeedsOnly(v === "needs")}
        >
          <ToggleGroupItem value="all" className={FILTER_ITEM}>
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="needs" className={FILTER_ITEM}>
            Needs you
          </ToggleGroupItem>
        </ToggleGroup>
        <BriefControls
          clis={clis}
          cli={pick}
          setCli={(c) => (setCli(c), save(CLI_KEY, c))}
          running={brief.status === "running"}
          run={runBrief}
        />
        <div className="ml-auto flex items-center gap-2">
          {Object.keys(orders).length > 0 && (
            <Button variant="ghost" size="sm" onClick={resetOrder}>
              Reset order
            </Button>
          )}
          <Switch id="settled" checked={settled} onCheckedChange={setSettled} />
          <Label htmlFor="settled" className="font-normal">
            show settled
          </Label>
        </div>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger size="sm" aria-label="Theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </header>
      {tree?.conn === "down" && (
        <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
          <AlertDescription className="text-foreground">
            T3 not running: last update {tree.lastUpdate ? hhmm(tree.lastUpdate) : "never"}
          </AlertDescription>
        </Alert>
      )}
      {tree?.conn === "unauthorized" && (
        <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
          <AlertDescription className="block text-foreground">
            T3 rejected the token. Issue one and put it in <code className="text-xs select-all">.env</code> as{" "}
            <code className="text-xs select-all">T3_TOKEN</code>, then restart:
            <br />
            <code className="text-xs select-all">{TOKEN_CMD}</code>
          </AlertDescription>
        </Alert>
      )}
      {!hideBrief && brief.status !== "idle" && (
        <BriefPanel
          state={brief}
          clis={clis}
          live={live}
          run={runBrief}
          cancel={() => fetch("/brief/cancel", { method: "POST" })}
          close={() => setHideBrief(true)}
        />
      )}
      <Details value={details}>
        <NeedsOnly value={needsOnly}>
          <Linear value={tree?.linear ?? null}>
            <Lists value={view.lists}>
              <Now value={now}>
                <div
                  className={!connecting && tree.conn !== "up" ? "grayscale" : ""}
                  data-conn={!connecting && tree.conn !== "up" ? "down" : undefined}
                >
                  {projects?.length === 0 && <p className="text-muted-foreground">No active threads.</p>}
                  {projects ? (
                    <DragDropProvider plugins={plugins} onDragStart={dragStart} onDragEnd={dragEnd}>
                      <ul className="m-0 flex list-none flex-col p-0">
                        <Presence items={projects} keyOf={(p) => p.id}>
                          {(p) => <ProjectCard b={p} closed={closed} toggle={toggle} />}
                        </Presence>
                      </ul>
                    </DragDropProvider>
                  ) : (
                    <>
                      <p className="mb-2 text-sm text-muted-foreground" role="status">
                        Connecting to T3…
                      </p>
                      <Card
                        className="gap-0 rounded-[12px] py-0 shadow-none"
                        aria-busy="true"
                        aria-label="Loading threads"
                      >
                        <CardContent className="flex flex-col gap-0.5 p-1.5">
                          {[0, 1, 2].map((i) => (
                            <Skeleton key={i} className="h-9 rounded-[8px] motion-reduce:animate-none" />
                          ))}
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </Now>
            </Lists>
          </Linear>
        </NeedsOnly>
      </Details>
    </TooltipProvider>
  );
}

/** Hot reload re-runs this module; reuse the root so two roots never share one container. */
const container = document.getElementById("root")!;
const root = import.meta.hot ? (import.meta.hot.data.root ??= createRoot(container)) : createRoot(container);
root.render(<App />);
