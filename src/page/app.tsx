import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Diamond,
  ExternalLink,
  Layers,
  ListChecks,
  LoaderCircle,
  Moon,
  Square,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { createRoot } from "react-dom/client";
import type { BriefState, Cli } from "../shared/brief.ts";
import { allThreads, type Branch, type PrNode, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";
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
import { countAttention, needsYou, onlyNeedsYou } from "./attention.ts";
import { BriefControls, BriefPanel, type Offered } from "./brief.tsx";
import { ago, folded, isKeyGroup, linearHref, phraseWith, stackRuns, stripKey } from "./format.ts";

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only";
const STATUS: Record<Status, { icon: LucideIcon; shape: string; text: string }> = {
  "needs-input": { icon: Diamond, shape: "text-status-needs-input", text: "text-status-needs-input-fg" },
  working: { icon: LoaderCircle, shape: "text-status-working", text: "text-status-working-fg" },
  starting: { icon: CircleDashed, shape: "text-status-working", text: "text-status-working-fg" },
  waiting: { icon: CirclePause, shape: "text-status-working", text: "text-status-working-fg" },
  "plan-ready": { icon: ListChecks, shape: "text-status-plan", text: "text-status-plan-fg" },
  "your-turn": { icon: CircleCheck, shape: "text-status-done", text: "text-status-done-fg" },
  done: { icon: Check, shape: "text-status-done", text: "text-status-done-fg" },
  failed: { icon: CircleX, shape: "text-status-failed", text: "text-status-failed-fg" },
  interrupted: { icon: Square, shape: "text-status-failed", text: "text-status-failed-fg" },
  snoozed: { icon: Moon, shape: "text-status-idle", text: "text-muted-foreground" },
  idle: { icon: Circle, shape: "text-status-idle", text: "text-muted-foreground" },
};
const CLOSED_KEY = "thread-tree:closed";
const SETTLED_KEY = "thread-tree:settled";
const FILTER_KEY = "thread-tree:filter";
const THEME_KEY = "thread-tree:theme";
const CLI_KEY = "thread-tree:cli";
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

export const StatusIcon = ({ t }: { t: ThreadNode }) => {
  const { icon: Icon, shape } = STATUS[t.status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-none" role="img" aria-label={t.phrase}>
          <Icon className={cn("status-icon size-3", shape)} fill={t.status === "needs-input" ? "currentColor" : "none"} />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t.phrase} · {t.raw}
      </TooltipContent>
    </Tooltip>
  );
};

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

function PrChip({ p }: { p: PrNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP,
        "font-mono focus-visible:ring-0",
        p.draft && "border-dashed",
        p.state === "merged" && "text-pr-merged",
        p.state === "closed" && "line-through",
      )}
      asChild
    >
      <a href={p.url} target="_blank" rel="noreferrer" title={p.draft ? `${p.state} · draft` : p.state}>
        #{p.n}
        {p.checks === "passing" && <Mark title="Checks passing"><span className="size-1.5 rounded-full bg-status-done" /></Mark>}
        {p.checks === "failing" && <Mark title="Checks failing"><span className="size-1.5 rounded-full bg-status-failed" /></Mark>}
        {p.checks === "pending" && (
          <Mark title="Checks pending"><span className="size-1.5 rounded-full border border-status-needs-input" /></Mark>
        )}
        {p.review === "approved" && <Mark title="Approved"><Check className="text-status-done" /></Mark>}
        {p.review === "changes-requested" && <Mark title="Changes requested"><X className="text-status-failed" /></Mark>}
        {p.conflicting && <Mark title="Merge conflict"><TriangleAlert className="text-status-needs-input" /></Mark>}
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
  const limit = [d.limitResetAt && `resets ${hhmm(d.limitResetAt)}`, d.autoResume && "auto-resume"].filter(Boolean).join(" · ");
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

function ThreadRow({ t, chip }: { t: ThreadNode; chip?: string }) {
  const now = useContext(Now);
  const { open, toggle, show } = useContext(Details);
  const dim = useContext(NeedsOnly) && !needsYou(t.status);
  const linear = useContext(Linear);
  const chipHref = chip ? linearHref(chip, linear) : null;
  return (
    <Collapsible asChild open={open.has(t.id)} onOpenChange={() => toggle(t.id)}>
    <li className="my-px">
      <div
        className="thread-row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 text-[13px] leading-5 max-[720px]:flex-wrap max-[720px]:py-1"
        data-status={t.status}
      >
        <StatusIcon t={t} />
        <span className={cn("w-[120px] flex-none truncate text-xs font-medium", dim ? "text-muted-foreground" : STATUS[t.status].text)}>
          {phraseWith(t, now)}
        </span>
        {chip && (
          <Badge variant="outline" className={cn(CHIP, "flex-none font-mono", chipHref && "hover:underline")} asChild={!!chipHref}>
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
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{ago(t.updatedAt, now)}</span>
            </TooltipTrigger>
            <TooltipContent>Updated {new Date(t.updatedAt).toLocaleString()}</TooltipContent>
          </Tooltip>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className={cn(ROW_BUTTON, "group")} aria-label="Details">
              <ChevronDown className="size-3.5 group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
        </span>
      </div>
      <CollapsibleContent>
        <DetailBlock t={t} />
      </CollapsibleContent>
      {t.children.length > 0 && (
        <ul className="m-0 list-none pl-4">
          {t.children.map((c) => (
            <ThreadRow key={c.id} t={c} />
          ))}
        </ul>
      )}
    </li>
    </Collapsible>
  );
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

function GroupRow({ b, closed, toggle }: { b: Branch } & Fold) {
  const open = !closed.has(b.id);
  const one = folded(b);
  const linear = useContext(Linear);
  const groupHref = isKeyGroup(b) ? linearHref(b.label, linear) : null;
  if (one) return <ThreadRow t={one} chip={b.label} />;
  return (
    <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
      <li className="my-px">
        <div className="flex h-7 min-w-0 items-center gap-2 rounded-[8px] px-2 hover:bg-accent max-[720px]:h-auto max-[720px]:min-h-7 max-[720px]:flex-wrap">
          <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-center gap-2 select-none max-[720px]:min-h-11">
            <Chevron open={open} />
            <span className={cn("truncate text-xs font-semibold", isKeyGroup(b) ? "font-mono" : "text-muted-foreground")}>
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
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none pl-4">
            {b.branches.map((c) => (
              <GroupRow key={c.id} b={c} closed={closed} toggle={toggle} />
            ))}
            {b.threads.map((t) => (
              <ThreadRow key={t.id} t={t} />
            ))}
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

/** Key groups of one PR stack, in one rail with a label row. */
function StackRail({ run, closed, toggle }: { run: Branch[] } & Fold) {
  const { total, base } = run[0]!.stack!;
  return (
    <li className="stack-rail my-1">
      <div className="flex min-h-6 flex-wrap items-center gap-x-1.5 px-2 text-xs text-muted-foreground">
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
      </div>
      <ul className="m-0 list-none p-0">
        {run.map((c) => (
          <GroupRow key={c.id} b={c} closed={closed} toggle={toggle} />
        ))}
      </ul>
    </li>
  );
}

function ProjectCard({ b, closed, toggle }: { b: Branch } & Fold) {
  const open = !closed.has(b.id);
  return (
    <li>
      <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
        <Card className="gap-0 overflow-hidden rounded-[12px] py-0 shadow-none">
          <CardHeader className="project-head flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1">
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
          </CardHeader>
          <CollapsibleContent asChild>
            <CardContent className="p-1.5">
              <ul className="m-0 list-none p-0">
                {stackRuns(b.branches).map((run) =>
                  run[0]!.stack ? (
                    <StackRail key={`rail:${run[0]!.id}`} run={run} closed={closed} toggle={toggle} />
                  ) : (
                    <GroupRow key={run[0]!.id} b={run[0]!} closed={closed} toggle={toggle} />
                  ),
                )}
              </ul>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </li>
  );
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
    n.has(id) ? n.delete(id) : n.add(id);
    setClosed(n);
    save(CLOSED_KEY, JSON.stringify([...n]));
  };

  const details = {
    open: shown,
    toggle: (id: string) =>
      setShown((s) => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    show: (id: string) => setShown((s) => new Set(s).add(id)),
  };
  const pick = clis?.find((c) => c.id === cli)?.id ?? clis?.[0]?.id;
  const runBrief = () => {
    if (!pick) return;
    setHideBrief(false);
    fetch(`/brief/run?settled=${settled ? 1 : 0}`, { method: "POST", body: JSON.stringify({ cli: pick }) });
  };
  const live = new Map((tree?.projects ?? []).flatMap(allThreads).map((t) => [t.id, t]));
  const counts = countAttention(tree?.projects ?? []);
  const connecting = !tree || tree.conn === "connecting";
  const projects = connecting ? undefined : needsOnly ? onlyNeedsYou(tree.projects) : tree.projects;

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
        <Now value={now}>
          <div
            className={!connecting && tree.conn !== "up" ? "grayscale" : ""}
            data-conn={!connecting && tree.conn !== "up" ? "down" : undefined}
          >
            {projects?.length === 0 && <p className="text-muted-foreground">No active threads.</p>}
            {projects ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {projects.map((p) => (
                  <ProjectCard key={p.id} b={p} closed={closed} toggle={toggle} />
                ))}
              </ul>
            ) : (
              <>
              <p className="mb-2 text-sm text-muted-foreground" role="status">Connecting to T3…</p>
              <Card className="gap-0 rounded-[12px] py-0 shadow-none" aria-busy="true" aria-label="Loading threads">
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
