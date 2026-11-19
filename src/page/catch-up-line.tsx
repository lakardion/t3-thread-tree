import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { catchUpLines } from "../shared/desktop.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { hasCatchUpLine } from "./attention.ts";
import { useLastMessage } from "./send-dialog.tsx";
import { STATUS } from "./status-icon.tsx";

/** The raw last message of the thread. It mounts only while the tooltip is open, so a row fetches nothing on its own. */
function Source({ t }: { t: ThreadNode }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return (
    <span className="block max-w-sm text-xs whitespace-pre-wrap">
      <span className="block font-semibold opacity-70">Last message</span>
      {text === undefined ? "Loading…" : (text ?? "No message.")}
    </span>
  );
}

/** Wraps the row title. Adds the Catch-up line under it when the thread has one. */
export function CatchUpTitle({ t, children }: { t: ThreadNode; children: ReactNode }) {
  if (!hasCatchUpLine(t)) return children;
  const lines = catchUpLines(t.catchUp);
  let line: ReactNode;
  if (!lines) line = <Skeleton className="my-[3px] h-3 w-56 max-w-full motion-reduce:animate-none" />;
  else {
    const raw = lines.raw?.split("\n").find((l) => l.trim());
    line = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 truncate">
            {lines.ask ? (
              <>
                {lines.did} <span className={cn(STATUS[t.status].shape, "font-semibold")}>Asks:</span>{" "}
                <span className="text-foreground">{t.catchUp?.ask}</span>{" "}
                {t.catchUp?.options?.map((o) => (
                  <Badge key={o} variant="outline" className="h-[18px] px-1.5 text-[11px] font-normal">
                    {o}
                  </Badge>
                ))}
              </>
            ) : (
              <>
                <span className="mr-1 rounded-sm border border-dashed px-1 text-[10px] tracking-wide uppercase">
                  {lines.why}
                </span>
                {(raw ?? lines.did) && (
                  <span className={raw ? "italic" : undefined}>{raw ? `“${raw}”` : lines.did}</span>
                )}
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <Source t={t} />
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="flex min-w-0 flex-1 flex-col max-[720px]:basis-full [&>a]:max-[720px]:basis-auto">
      {children}
      <span className="flex min-w-0 items-center gap-1 text-xs leading-[18px] text-muted-foreground max-[720px]:pl-5">
        {line}
      </span>
    </span>
  );
}
