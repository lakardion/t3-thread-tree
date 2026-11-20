import { SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { catchUpLines, type UpNext, type UpNextRow } from "../shared/desktop.ts";
import { ago, stripKey } from "./format.ts";
import { ProjectIcon } from "./project-icon.tsx";
import { STATUS, StatusIcon } from "./status-icon.tsx";

const THEME_KEY = "thread-tree:theme";

/** Follows the app theme: the saved choice, or the system when it is not "light" or "dark". */
function useTheme() {
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let theme: string | null = null;
      try {
        theme = localStorage.getItem(THEME_KEY);
      } catch {}
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme !== "light" && mq.matches));
    };
    const onStorage = (e: StorageEvent) => e.key === THEME_KEY && apply();
    apply();
    mq.addEventListener("change", apply);
    addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", apply);
      removeEventListener("storage", onStorage);
    };
  }, []);
}

/** The list that main holds. A push that arrives before the first answer wins. */
function useUpNext(): UpNext | undefined {
  const [list, setList] = useState<UpNext>();
  useEffect(() => {
    const bridge = window.upNextBridge;
    if (!bridge) return;
    const off = bridge.onUpNext(setList);
    void bridge.upNext().then((l) => setList((cur) => cur ?? l));
    return off;
  }, []);
  return list;
}

/** The second line of a row: the ask, else what the thread did; a skeleton while the call runs; a dashed tag and the raw question when there is no clear ask. */
function SecondLine({ row }: { row: UpNextRow }) {
  const { catchUp } = row;
  if (!catchUp) return null;
  const lines = catchUpLines(catchUp);
  let line;
  if (!lines) line = <Skeleton className="h-2.5 w-40" />;
  else if (lines.ask) line = <span className="truncate">{`Asks: ${lines.ask}`}</span>;
  else
    line = (
      <>
        <span className="mr-1 flex-none rounded-sm border border-dashed px-1 text-[10px] tracking-wide uppercase">
          {lines.why}
        </span>
        <span className="truncate italic">{lines.raw ? `“${lines.raw}”` : (lines.did ?? row.title)}</span>
      </>
    );
  return <span className="flex h-4 min-w-0 items-center pl-[20px] text-[11px] text-muted-foreground">{line}</span>;
}

function Row({ row, target, now }: { row: UpNextRow; target: boolean; now: number }) {
  const bridge = window.upNextBridge;
  const open = () => bridge?.openThread(row.id);
  const { linearUrl } = row;
  return (
    <div
      role="button"
      tabIndex={0}
      title={row.title}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()}
      className={cn(
        "flex w-full flex-col justify-center rounded-md border-l-2 border-transparent px-2 text-left text-[13px] hover:bg-accent",
        target && "border-status-needs-input bg-accent/50",
        row.catchUp && "pb-1",
      )}
    >
      <div className="flex h-7 min-w-0 items-center gap-1.5">
        <StatusIcon t={row} now={now} />
        <span className="flex-none" aria-label={row.project}>
          <ProjectIcon name={row.project} />
        </span>
        {row.key &&
          (linearUrl ? (
            <a
              href={linearUrl}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                bridge?.openLinear(linearUrl);
              }}
              className="flex-none font-mono text-[11px] text-muted-foreground hover:underline"
            >
              {row.key}
            </a>
          ) : (
            <span className="flex-none font-mono text-[11px] text-muted-foreground">{row.key}</span>
          ))}
        <span className="min-w-0 flex-1 truncate">
          {(row.key ? stripKey(row.title, row.key) : row.title) || row.id}
        </span>
        <span className={cn(STATUS[row.status].shape, "font-mono text-[12px] tabular-nums")}>
          {row.since ? ago(row.since, now) : ""}
        </span>
      </div>
      <SecondLine row={row} />
    </div>
  );
}

function UpNextWindow() {
  useTheme();
  const list = useUpNext() ?? { rows: [], targetId: null };
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <TooltipProvider disableHoverableContent>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex h-9 flex-none items-center gap-2 border-b px-2">
          <span className="text-xs font-semibold">Up next</span>
          {list.rows.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{list.rows.length}</span>
          )}
          <Button
            variant="outline"
            size="xs"
            disabled={list.targetId === null}
            onClick={() => window.upNextBridge?.openNext()}
            className="ml-auto"
          >
            <SkipForward /> Open next
          </Button>
        </div>
        {list.rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <span className="text-sm font-medium">Nothing waits</span>
            <span className="text-xs">Threads that need you show here.</span>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto p-1">
            {list.rows.map((row) => (
              <li key={row.id}>
                <Row row={row} target={row.id === list.targetId} now={now} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<UpNextWindow />);
