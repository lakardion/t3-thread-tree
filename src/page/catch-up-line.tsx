import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { catchUpLines } from "../shared/desktop.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { Markdown } from "./markdown.tsx";
import { hasCatchUpLine } from "./needs-you.ts";
import { useLastMessage } from "./send-dialog.tsx";
import { STATUS } from "./status-icon.tsx";

/** Mounts only while the tooltip is open, so a row fetches nothing on its own. */
function Source({ t }: { t: ThreadNode }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return (
    <div className="max-w-sm space-y-1 text-xs">
      <span className="block font-semibold opacity-70">Last message</span>
      {text == null ? text === undefined ? "Loading…" : "No message." : <Markdown text={text} />}
    </div>
  );
}

/** "Asks:" in the status color. */
export const AsksLabel = ({ status }: { status: ThreadNode["status"] }) => (
  <span className={cn(STATUS[status].shape, "font-semibold")}>Asks:</span>
);

/** The line of a Catch-up with no clear ask or a failed call: a dashed tag, then the first line of the raw question, else what the thread did. */
export function NoAsk({ lines }: { lines: NonNullable<ReturnType<typeof catchUpLines>> }) {
  const raw = lines.raw?.split("\n").find((l) => l.trim());
  return (
    <>
      <span className="mr-1 rounded-sm border border-dashed px-1 text-[10px] tracking-wide uppercase">{lines.why}</span>
      {(raw ?? lines.did) && <span className={raw ? "italic" : undefined}>{raw ? `“${raw}”` : lines.did}</span>}
    </>
  );
}

/** Wraps the row title. Adds the Catch-up line under it when the thread has one. */
export function CatchUpTitle({ t, children }: { t: ThreadNode; children: ReactNode }) {
  if (!hasCatchUpLine(t)) return children;
  const lines = catchUpLines(t.catchUp);
  let line: ReactNode;
  if (!lines) line = <Skeleton className="my-[3px] h-3 w-56 max-w-full motion-reduce:animate-none" />;
  else {
    line = (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 truncate">
            {lines.ask ? (
              <>
                {lines.did} <AsksLabel status={t.status} /> <span className="text-foreground">{t.catchUp?.ask}</span>{" "}
                {t.catchUp?.options?.map((o) => (
                  <Badge key={o} variant="outline" size="chip" className="h-[18px]">
                    {o}
                  </Badge>
                ))}
              </>
            ) : (
              <NoAsk lines={lines} />
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
