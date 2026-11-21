import { LoaderCircle, Send } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

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

import { chipsOf } from "../shared/replies.ts";
import type { CliStatus, SendError } from "../shared/send.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { isBusy, postSend, type Result } from "./send.ts";
import { StatusIcon } from "./status-icon.tsx";

type Frame = { busy: boolean; setBusy: (v: boolean) => void; close: () => void };

/** Set by `ActionDialog`, read by `ActionForm`. */
const FrameContext = createContext<Frame>(null!);

/** While an action runs, nothing closes the dialog. Children mount only while open. */
function ActionDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent showCloseButton={!busy}>
        <FrameContext.Provider value={{ busy, setBusy, close: () => onOpenChange(false) }}>
          {children}
        </FrameContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

/** The failure of a send, settle or snooze: the message, the exit code and the tail of stderr. */
export const SendErrorAlert = ({ err }: { err: SendError }) => (
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
);

/** Header, fields, failure alert and buttons of an action dialog. A `<fieldset>` disables the fields while `run` is in flight. */
function ActionForm({
  title,
  description,
  label,
  icon,
  ready,
  run,
  children,
}: {
  title: string;
  description: string;
  label: string;
  icon: ReactNode;
  ready: boolean;
  run: () => Promise<Result>;
  children: ReactNode;
}) {
  const { busy, setBusy, close } = useContext(FrameContext);
  const [err, setErr] = useState<SendError>();

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(undefined);
    const r = await run();
    setBusy(false);
    if (r.ok) close();
    else setErr(r.err);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the keydown only catches Cmd/Ctrl+Enter bubbling up from the fields */}
      <fieldset
        disabled={busy}
        className="contents"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        {children}
      </fieldset>
      {err && <SendErrorAlert err={err} />}
      <DialogFooter>
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button disabled={!ready || busy} onClick={() => void submit()}>
          {busy ? <LoaderCircle className="animate-spin" /> : icon} {label}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The tail of a thread's last message. `undefined` while the first answer for `id` loads, `null` when there is none or the fetch fails. Refetches when `id` or `key` changes, and keeps the previous text of the same thread until the new answer comes. */
export function useLastMessage(id: string, key: string | null): string | null | undefined {
  const url = `/t3/last-message?id=${encodeURIComponent(id)}&v=${encodeURIComponent(key ?? "")}`;
  const [got, setGot] = useState<{ id: string; text: string | null }>();
  useEffect(() => {
    let alive = true;
    void fetch(url)
      .then((r) => (r.ok ? r.json() : { text: null }))
      .catch(() => ({ text: null }))
      .then((b: { text: string | null }) => alive && setGot({ id, text: b.text }));
    return () => {
      alive = false;
    };
  }, [id, url]);
  return got?.id === id ? got.text : undefined;
}

/** A muted, scrollable box with the message text. */
export const LastMessage = ({ text }: { text: string }) => (
  <div className="max-h-40 overflow-auto rounded-[6px] bg-muted p-2 text-xs break-words whitespace-pre-wrap text-muted-foreground">
    {text}
  </div>
);

type Props = {
  threadIds: string[];
  live: Map<string, ThreadNode>;
  titles?: Record<string, string>;
  message: string;
  /** Muted lines above the message. */
  notes?: string[];
  /** Shows the first thread as a fixed target instead of a picker. */
  fixed?: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: (threadId: string) => void;
};

/** Mounted only while open, so each open starts from the initial draft and target. */
function SendForm({ threadIds, live, titles, message, notes, fixed, onSent }: Props) {
  const [target, setTarget] = useState(() => threadIds.find((id) => live.has(id)) ?? "");
  const [draft, setDraft] = useState(message);
  const [fixedTitle] = useState(() => {
    const t = live.get(threadIds[0]);
    return t?.title || threadIds[0];
  });
  const selected = live.get(target);
  const last = useLastMessage(target, selected?.updatedAt ?? null);
  const chips = selected?.suggestedReplies ? chipsOf(selected.suggestedReplies) : [];
  const box = useRef<HTMLTextAreaElement>(null);

  return (
    <ActionForm
      title="Send message"
      description={fixed ? "Send this message to the thread." : "Send this message to a thread."}
      label="Confirm send"
      icon={<Send />}
      ready={!!selected && draft.trim() !== ""}
      run={async () => {
        const r = await postSend(target, draft);
        if (r.ok) onSent?.(target);
        return r;
      }}
    >
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
        <Select value={target} onValueChange={setTarget}>
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
      {selected?.status === "needs-input" && selected.phrase === "Approval" && (
        <p className="m-0 text-xs text-muted-foreground">
          This thread waits for an approval. A message does not approve the request. Approve it in T3.
        </p>
      )}
      {last && (
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Last message</span>
          <LastMessage text={last} />
        </div>
      )}
      {notes?.map((n) => (
        <p key={n} className="m-0 text-xs text-muted-foreground">
          {n}
        </p>
      ))}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Suggested replies">
          {chips.map((c) => (
            <Button
              key={c}
              variant="outline"
              size="xs"
              onClick={() => {
                setDraft(c);
                box.current?.focus();
              }}
            >
              {c}
            </Button>
          ))}
        </div>
      )}
      <Textarea
        ref={box}
        /* oxlint-disable-next-line jsx-a11y/no-autofocus -- the chips sit before the textarea, so the dialog's first-field focus would land on a chip */
        autoFocus={fixed}
        aria-label="Message"
        className="max-h-60 min-h-32"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </ActionForm>
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

export function SendDialog(p: Props & { open: boolean }) {
  return (
    <ActionDialog open={p.open} onOpenChange={p.onOpenChange}>
      <SendForm {...p} />
    </ActionDialog>
  );
}
