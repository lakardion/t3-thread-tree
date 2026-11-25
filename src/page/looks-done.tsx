import { ArrowLeft, CircleCheckBig, Eye, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SendError } from "../shared/send.ts";
import { reasonText, type Offer, type Skip } from "./looks-done.ts";
import { Markdown } from "./markdown.tsx";
import { ProjectIcon } from "./project-icon.tsx";
import { useLastMessage } from "./send-dialog.tsx";
import { postSettle } from "./send.ts";
import { StatusIcon } from "./status-icon.tsx";
import { StartMenu } from "./workflow-start.tsx";

/** The header button that opens the dialog. Nothing shows at 0. */
export function LooksDoneButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" aria-label={`${count} look done`} onClick={onOpen}>
          <CircleCheckBig />
          <span className="max-[720px]:hidden">{count} look done</span>
          <span className="tabular-nums min-[721px]:hidden">{count}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{count === 1 ? "1 thread looks done" : `${count} threads look done`}</TooltipContent>
    </Tooltip>
  );
}

/** The last message of `t` in place of the list. The body mounts only while shown, so a row fetches nothing on its own. */
function Preview({ t, back }: { t: Offer["thread"]; back: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex min-w-0 items-center gap-1.5 pr-6">
          <Button variant="ghost" size="icon-xs" aria-label="Back to the list" onClick={back}>
            <ArrowLeft />
          </Button>
          <span className="truncate">{t.title || t.id}</span>
        </DialogTitle>
        <DialogDescription>Last message</DialogDescription>
      </DialogHeader>
      <PreviewText t={t} />
    </>
  );
}

/** Animates its height to the height of its content. */
function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="-m-2 overflow-hidden transition-[height] duration-200 ease-out" style={{ height }}>
      <div ref={inner} className="grid gap-4 p-2">
        {children}
      </div>
    </div>
  );
}

function PreviewText({ t }: { t: Offer["thread"] }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return (
    <div className="max-h-[60vh] overflow-auto rounded-[6px] bg-muted p-3 text-sm">
      {text == null ? text === undefined ? "Loading…" : "No message." : <Markdown text={text} className="text-sm" />}
    </div>
  );
}

/** The list of the dialog. It mounts on open, so `items` is a snapshot: rows stay while the tree drops the settled threads. */
function Body({
  items,
  onDone,
  close,
  onPreview,
  busy,
  setBusy,
}: {
  items: Offer[];
  onDone: (settled: string[], skipped: Skip[]) => void;
  close: () => void;
  onPreview: (t: Offer["thread"]) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState(items);
  const [checked, setChecked] = useState(() => new Set(items.map((o) => o.thread.id)));
  const [errors, setErrors] = useState(new Map<string, SendError>());
  const n = rows.filter((o) => checked.has(o.thread.id)).length;

  const settle = async () => {
    setBusy(true);
    const ok: string[] = [];
    const failed = new Map<string, SendError>();
    for (const { thread } of rows) {
      if (!checked.has(thread.id)) continue;
      const r = await postSettle(thread.id, true);
      if (r.ok) ok.push(thread.id);
      else failed.set(thread.id, r.err);
    }
    onDone(
      ok,
      rows.filter((o) => !checked.has(o.thread.id)).map((o) => ({ id: o.thread.id, lastRun: o.thread.lastRun })),
    );
    setRows(rows.filter((o) => !ok.includes(o.thread.id)));
    setErrors(failed);
    setBusy(false);
    if (failed.size === 0) close();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Threads that look done</DialogTitle>
        <DialogDescription>Settle the checked threads. Uncheck a thread to keep it.</DialogDescription>
      </DialogHeader>
      <ul className="m-0 flex max-h-[60vh] list-none flex-col gap-1 overflow-auto p-0">
        {rows.map(({ thread: t, reason, project }) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm select-none hover:bg-accent">
              <input
                type="checkbox"
                className="mt-1 flex-none"
                checked={checked.has(t.id)}
                disabled={busy}
                onChange={(e) =>
                  setChecked((c) => {
                    const next = new Set(c);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    return next;
                  })
                }
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <StatusIcon t={t} />
                  <span className="truncate">{t.title || t.id}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <ProjectIcon name={project} />
                  <span className="flex-none">{project}</span>
                  <span className="truncate">· {reasonText(reason)}</span>
                </span>
                {errors.has(t.id) && <span className="text-xs text-status-failed">{errors.get(t.id)?.error}</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="ml-auto flex-none self-center hover:bg-foreground/10 dark:hover:bg-foreground/10"
                aria-label="Show last message"
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPreview(t);
                }}
              >
                <Eye />
              </Button>
            </label>
          </li>
        ))}
      </ul>
      <DialogFooter className="select-none">
        <StartMenu
          point={{ kind: "threads", ids: rows.flatMap((o) => (checked.has(o.thread.id) ? o.thread.id : [])) }}
          label="Start a workflow"
          disabled={n === 0 || busy}
          onPick={close}
        />
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button className="min-w-36 tabular-nums" disabled={n === 0 || busy} onClick={() => void settle()}>
          {busy && <LoaderCircle className="animate-spin" />} Settle {n}
        </Button>
      </DialogFooter>
    </>
  );
}

export function LooksDoneDialog({
  open,
  items,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  items: Offer[];
  onOpenChange: (open: boolean) => void;
  onDone: (settled: string[], skipped: Skip[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Offer["thread"]>();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (preview) setPreview(undefined);
        else if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        className={cn("transition-[max-width] duration-200 ease-out", preview && "sm:max-w-2xl")}
      >
        <AnimatedHeight>
          {preview && <Preview t={preview} back={() => setPreview(undefined)} />}
          <div className={cn("contents", preview && "hidden")}>
            <Body
              items={items}
              onDone={onDone}
              close={() => onOpenChange(false)}
              onPreview={setPreview}
              busy={busy}
              setBusy={setBusy}
            />
          </div>
        </AnimatedHeight>
      </DialogContent>
    </Dialog>
  );
}

/** "Settled N · Undo" for 10 s. Undo unsettles the threads. */
export function UndoToast({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current(), 10_000);
    return () => clearTimeout(timer);
  }, []);
  const [left, setLeft] = useState(ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const undo = async () => {
    setBusy(true);
    const failed: string[] = [];
    let message: string | undefined;
    for (const id of left) {
      const r = await postSettle(id, false);
      if (!r.ok) {
        failed.push(id);
        message = r.err.error;
      }
    }
    setBusy(false);
    if (failed.length === 0) return onClose();
    setLeft(failed);
    setError(message);
  };
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-md"
    >
      <span>{error ?? `Settled ${ids.length} ·`}</span>
      <Button variant="ghost" size="xs" disabled={busy} onClick={() => void undo()}>
        Undo
      </Button>
    </div>
  );
}
