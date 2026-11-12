import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Diamond,
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
import { allThreads, type Branch, type PrNode, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { countAttention, needsYou, onlyNeedsYou } from "./attention.ts";
import { ago, phraseWith } from "./format.ts";

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
const NeedsOnly = createContext(false);

const StatusIcon = ({ t }: { t: ThreadNode }) => {
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

const ROW = "flex min-w-0 items-center gap-2 rounded-[5px] px-1 py-0.5 hover:bg-accent";
const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
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

function ThreadRow({ t }: { t: ThreadNode }) {
  const now = useContext(Now);
  const dim = useContext(NeedsOnly) && !needsYou(t.status);
  return (
    <li className="my-px">
      <div
        className="thread-row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 text-[13px] leading-5 max-[720px]:flex-wrap max-[720px]:py-1"
        data-status={t.status}
      >
        <StatusIcon t={t} />
        <span className={cn("w-[120px] flex-none truncate text-xs font-medium", dim ? "text-muted-foreground" : STATUS[t.status].text)}>
          {phraseWith(t, now)}
        </span>
        <a
          className={cn(
            "min-w-0 flex-1 truncate hover:underline max-[720px]:line-clamp-2 max-[720px]:whitespace-normal",
            t.status === "your-turn" ? "font-[650]" : "font-medium",
            (t.status === "snoozed" || t.settled || dim) && "text-muted-foreground",
          )}
          href={t.href}
        >
          {t.title || t.id}
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
          {t.prs.length > 2 && <span className="text-[11px] text-muted-foreground">+{t.prs.length - 2}</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{ago(t.updatedAt, now)}</span>
            </TooltipTrigger>
            <TooltipContent>Updated {new Date(t.updatedAt).toLocaleString()}</TooltipContent>
          </Tooltip>
        </span>
      </div>
      {t.children.length > 0 && (
        <ul className="m-0 list-none pl-[18px]">
          {t.children.map((c) => (
            <ThreadRow key={c.id} t={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function BranchRow({
  b,
  top,
  closed,
  toggle,
}: {
  b: Branch;
  top?: boolean;
  closed: Set<string>;
  toggle: (id: string) => void;
}) {
  const open = !closed.has(b.id);
  return (
    <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
      <li className="my-px">
        <div className={cn(ROW, top && "mt-2")}>
          <CollapsibleTrigger className="w-3.5 flex-none cursor-pointer select-none text-center text-muted-foreground">
            {open ? "▾" : "▸"}
          </CollapsibleTrigger>
          <span className={top ? "text-sm font-bold" : "font-semibold"}>{b.label}</span>
          {!open && (
            <span className="inline-flex flex-wrap gap-[3px]">
              {allThreads(b).map((t) => (
                <StatusIcon key={t.id} t={t} />
              ))}
            </span>
          )}
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none pl-[18px]">
            {b.branches.map((c) => (
              <BranchRow key={c.id} b={c} closed={closed} toggle={toggle} />
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

function App() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [settled, setSettled] = useState(load(SETTLED_KEY) === "1");
  const [needsOnly, setNeedsOnly] = useState(load(FILTER_KEY) === "needs");
  const [theme, setTheme] = useState<Theme>(() => THEMES.find((t) => t === load(THEME_KEY)) ?? "system");
  const [now, setNow] = useState(Date.now);
  const [closed, setClosed] = useState(() => new Set<string>(JSON.parse(load(CLOSED_KEY) ?? "[]") as string[]));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save(SETTLED_KEY, settled ? "1" : "0");
    const es = new EventSource(settled ? "/events?settled=1" : "/events");
    es.onmessage = (e) => setTree(JSON.parse(e.data) as Tree);
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

  const counts = countAttention(tree?.projects ?? []);
  const projects = tree && needsOnly ? onlyNeedsYou(tree.projects) : tree?.projects;

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
      <NeedsOnly value={needsOnly}>
        <Now value={now}>
          <div
            className={tree && tree.conn !== "up" ? "grayscale" : ""}
            data-conn={tree && tree.conn !== "up" ? "down" : undefined}
          >
            {tree && projects?.length === 0 && <p className="text-muted-foreground">No active threads.</p>}
            <ul className="m-0 list-none p-0">
              {projects?.map((p) => (
                <BranchRow key={p.id} b={p} top closed={closed} toggle={toggle} />
              ))}
            </ul>
          </div>
        </Now>
      </NeedsOnly>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
