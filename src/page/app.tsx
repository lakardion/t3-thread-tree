import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { allThreads, type Branch, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only";
const RUNNING = "bg-status-running";
const DONE = "bg-status-completed";
const CANCELLED = "bg-status-cancelled";
const DOT: Record<Status, string> = {
  "needs-input": "bg-status-needs-input",
  working: `${RUNNING} animate-pulse motion-reduce:animate-none`,
  starting: RUNNING,
  waiting: RUNNING,
  "plan-ready": DONE,
  "your-turn": DONE,
  done: DONE,
  failed: CANCELLED,
  interrupted: CANCELLED,
  idle: "bg-status-idle",
  snoozed: "bg-status-snoozed",
};
const CLOSED_KEY = "thread-tree:closed";
const SETTLED_KEY = "thread-tree:settled";

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

const Dot = ({ t }: { t: ThreadNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className={cn("inline-block size-[9px] flex-none rounded-full", DOT[t.status])} />
    </TooltipTrigger>
    <TooltipContent>
      {t.phrase} · {t.raw}
    </TooltipContent>
  </Tooltip>
);

const ROW = "flex min-w-0 items-center gap-2 rounded-[5px] px-1 py-0.5 hover:bg-accent";
const PILL = "gap-[3px] rounded-[10px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";

function ThreadRow({ t }: { t: ThreadNode }) {
  return (
    <li className="my-px">
      <div className={ROW}>
        <Dot t={t} />
        <a
          className={cn("min-w-0 truncate hover:underline", t.snoozedUntil && "opacity-55")}
          href={t.href}
        >
          {t.title || t.id}
        </a>
        <span className="ml-auto flex flex-none items-center gap-1.5">
          {t.snoozedUntil && (
            <Badge variant="outline" className={PILL}>
              ⏾ until {until(t.snoozedUntil)}
            </Badge>
          )}
          {t.stack && (
            <Badge
              variant="outline"
              className={cn(PILL, "border-status-running/45 text-status-running")}
              title="PR stack"
            >
              ⧉ {t.stack.pos ? `${t.stack.pos}/${t.stack.total}` : `base · ${t.stack.total}`}
            </Badge>
          )}
          {t.prs.map((p) => (
            <Badge key={p.n} variant="outline" className={PILL} asChild>
              <a href={p.url} target="_blank" rel="noreferrer" title={p.state}>
                #{p.n}
                {p.state !== "open" && ` ${p.state}`}
              </a>
            </Badge>
          ))}
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
                <Dot key={t.id} t={t} />
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
  const [closed, setClosed] = useState(() => new Set<string>(JSON.parse(load(CLOSED_KEY) ?? "[]") as string[]));

  useEffect(() => {
    save(SETTLED_KEY, settled ? "1" : "0");
    const es = new EventSource(settled ? "/events?settled=1" : "/events");
    es.onmessage = (e) => setTree(JSON.parse(e.data) as Tree);
    return () => es.close();
  }, [settled]);

  const toggle = (id: string) => {
    const n = new Set(closed);
    n.has(id) ? n.delete(id) : n.add(id);
    setClosed(n);
    save(CLOSED_KEY, JSON.stringify([...n]));
  };

  return (
    <TooltipProvider>
      <header className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-3 text-muted-foreground">
        <h1 className="m-0 text-[15px] font-semibold text-foreground">Thread tree</h1>
        <div className="flex items-center gap-2">
          <Switch id="settled" checked={settled} onCheckedChange={setSettled} />
          <Label htmlFor="settled" className="font-normal">
            show settled
          </Label>
        </div>
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
      <div className={tree && tree.conn !== "up" ? "opacity-45 grayscale" : ""}>
        {tree && tree.projects.length === 0 && <p className="text-muted-foreground">No active threads.</p>}
        <ul className="m-0 list-none p-0">
          {tree?.projects.map((p) => (
            <BranchRow key={p.id} b={p} top closed={closed} toggle={toggle} />
          ))}
        </ul>
      </div>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
