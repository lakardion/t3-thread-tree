import { LoaderCircle, Send } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { CliStatus, SendError } from "../shared/send.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { isBusy, postSend } from "./send.ts";
import { StatusIcon } from "./status-icon.tsx";

type Props = {
  threadIds: string[];
  live: Map<string, ThreadNode>;
  titles?: Record<string, string>;
  message: string;
  /** Shows the first thread as a fixed target instead of a picker. */
  fixed?: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: (threadId: string) => void;
};

type FormProps = Props & { sending: boolean; setSending: (v: boolean) => void };

/** Mounted only while open, so each open starts from the initial draft and target. */
function SendForm({ threadIds, live, titles, message, fixed, onOpenChange, onSent, sending, setSending }: FormProps) {
  const [target, setTarget] = useState(() => threadIds.find((id) => live.has(id)) ?? "");
  const [draft, setDraft] = useState(message);
  const [err, setErr] = useState<SendError>();
  const [fixedTitle] = useState(() => {
    const t = live.get(threadIds[0]);
    return t?.title || threadIds[0];
  });
  const selected = live.get(target);
  const canSend = !!selected && draft.trim() !== "" && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setErr(undefined);
    const r = await postSend(target, draft);
    setSending(false);
    if (r.ok) {
      onSent?.(target);
      onOpenChange(false);
    } else setErr(r.err);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send message</DialogTitle>
        <DialogDescription>
          {fixed ? "Send this message to the thread." : "Send this message to a thread."}
        </DialogDescription>
      </DialogHeader>
      {fixed ? (
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {selected ? (
            <>
              <StatusIcon t={selected} />
              <span className="min-w-0 break-words">{selected.title || selected.id}</span>
            </>
          ) : (
            <span className="line-through">{fixedTitle}</span>
          )}
        </div>
      ) : (
        <Select value={target} onValueChange={setTarget} disabled={sending}>
          <SelectTrigger className="w-full" aria-label="Thread">
            <SelectValue placeholder="No active thread">{selected?.title || selected?.id}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {threadIds.map((id) => {
              const t = live.get(id);
              return (
                <SelectItem key={id} value={id} disabled={!t}>
                  {t ? (
                    <>
                      <StatusIcon t={t} />
                      {t.title || t.id}
                    </>
                  ) : (
                    <span className="line-through">{titles?.[id] ?? id}</span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}
      {selected && isBusy(selected.status) && (
        <p className="m-0 text-xs text-muted-foreground">
          This thread is working. The message waits for its next turn.
        </p>
      )}
      <Textarea
        aria-label="Message"
        className="max-h-60 min-h-32"
        value={draft}
        disabled={sending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      {err && (
        <Alert className="border-l-[3px] border-l-status-failed">
          <AlertDescription className="block text-foreground">
            {err.error}
            {err.exitCode !== null && <span className="text-muted-foreground"> exit {err.exitCode}</span>}
            {err.stderrTail && (
              <pre className="mt-1.5 max-h-24 overflow-auto rounded-[6px] bg-muted p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-muted-foreground">
                {err.stderrTail}
              </pre>
            )}
          </AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="ghost" disabled={sending} onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button disabled={!canSend} onClick={() => void send()}>
          {sending ? <LoaderCircle className="animate-spin" /> : <Send />} Confirm send
        </Button>
      </DialogFooter>
    </>
  );
}

/** Wraps a send button. Shows a focusable tooltip in its place when no t3 CLI is available. */
export function CliGate({ t3cli, children }: { t3cli: CliStatus | null; children: ReactNode }) {
  if (t3cli?.available !== false) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a disabled button gets no focus, so the wrapper takes it to show the tooltip */}
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>No t3 CLI at {t3cli.path}. Set T3_BIN in .env.</TooltipContent>
    </Tooltip>
  );
}

/** While a send runs, nothing closes the dialog. */
export function SendDialog(p: Props & { open: boolean }) {
  const [sending, setSending] = useState(false);
  return (
    <Dialog open={p.open} onOpenChange={(o) => !sending && p.onOpenChange(o)}>
      <DialogContent showCloseButton={!sending}>
        <SendForm {...p} sending={sending} setSending={setSending} />
      </DialogContent>
    </Dialog>
  );
}
