import {
  ArrowRight,
  Ban,
  CirclePause,
  ExternalLink,
  LoaderCircle,
  MessagesSquare,
  Play,
  Send,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { RunItem } from "../shared/runs.ts";
import type { SendError } from "../shared/send.ts";
import { ago } from "./format.ts";
import { SendErrorAlert } from "./send-dialog.tsx";
import { postAnswer, postCancel, postResume, type Result } from "./send.ts";
import { Cap, useTriageKeys } from "./triage-keys.tsx";
import type { Outcome } from "./triage.ts";

type RunCardProps = {
  r: RunItem;
  gone: boolean;
  pos: number;
  total: number;
  fresh: number;
  now: number;
  upcoming: string[];
  onSkip: () => void;
  onFinish: (outcome: Outcome) => void;
  close: () => void;
};

/** The Triage card of a Run question or a Paused run. Keyed by item, so each starts with no pick, reason or error. */
export function RunCard({ r, gone, pos, total, fresh, now, upcoming, onSkip, onFinish, close }: RunCardProps) {
  const question = r.kind === "question";
  const [pick, setPick] = useState<string>();
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  const [confirm, setConfirm] = useState(false);
  /** The outcome of the call in flight. */
  const [busy, setBusy] = useState<Outcome>();
  const [err, setErr] = useState<SendError>();
  const field = useRef<HTMLTextAreaElement>(null);

  /** The disabled fieldset drops focus from the field, so a failure gives it back. */
  useEffect(() => {
    if (err) field.current?.focus();
  }, [err]);

  const run = async (call: () => Promise<Result>, outcome: Outcome) => {
    if (busy) return;
    setBusy(outcome);
    setErr(undefined);
    const res = await call();
    setBusy(undefined);
    if (res.ok) onFinish(outcome);
    else setErr(res.err);
  };
  const answer = () =>
    r.kind === "question" && pick && void run(() => postAnswer(r.runId, r.name, pick, reason), "answered");
  const open = () => {
    onSkip();
    window.open(r.href, "_blank", "noopener");
  };
  const talk = () => {
    if (!question || !r.threadHref) return;
    onSkip();
    location.assign(r.threadHref);
  };

  /** `useTriageKeys` drops modifier presses, so Cmd/Ctrl+Enter has its own listener. */
  useEffect(() => {
    if (r.kind !== "question") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.repeat || !pick) return;
      if (document.querySelector("[data-find], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      e.preventDefault();
      answer();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  useTriageKeys((e, inField) => {
    if (inField) {
      if (e.key === "Escape" && e.target === field.current) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "t") return close();
    if (busy) return;
    const n = Number(e.key);
    const choices = question ? r.choices : [];
    const act: Record<string, (() => void) | undefined> = gone
      ? { j: onSkip, ArrowRight: onSkip }
      : { o: open, j: onSkip, ArrowRight: onSkip, " ": question ? undefined : () => setMore((m) => !m) };
    const choose = !gone && n >= 1 && n <= choices.length ? () => setPick(choices[n - 1]) : act[e.key];
    if (!choose) return;
    e.preventDefault();
    choose();
  });

  const since = ago(r.since, now);
  const tone = question ? "text-status-plan" : "text-status-failed";
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs">
        {question ? (
          <Workflow className="size-3.5 text-status-plan" />
        ) : (
          <CirclePause className="size-3.5 text-status-failed" />
        )}
        <span className={cn(tone, "font-semibold")}>{question ? "Run question" : "Paused run"}</span>
        <span className="text-muted-foreground">· {r.workflow}</span>
        <span className={cn(tone, "tabular-nums")}>{since}</span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {pos} of {total}
          {fresh > 0 && <span className="ml-1 text-status-needs-input">+{fresh} new</span>}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Close Triage" onClick={close}>
          <X />
        </Button>
      </div>
      <div className="text-sm font-semibold break-words">{r.title}</div>
      {gone ? (
        <div className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
          No longer waits.{" "}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={onSkip}>
            Next
          </Button>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {question ? r.runTitle : r.retired ? "Its workflow version is gone. It cannot resume." : "Waits for you"}
          </div>
          {!question && r.detail && (
            <>
              <p
                className={cn(
                  "m-0 text-sm break-words whitespace-pre-wrap text-muted-foreground",
                  !more && "line-clamp-3",
                )}
              >
                {r.detail}
              </p>
              <button
                type="button"
                className="self-start text-xs text-muted-foreground hover:underline"
                onClick={() => setMore((m) => !m)}
              >
                {more ? "Hide" : "Show"} detail <Cap>space</Cap>
              </button>
            </>
          )}
          <fieldset disabled={!!busy} className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
            {question ? (
              r.choices.length === 0 ? (
                <div className="flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
                  This question has no choices, and T3 takes only a choice. Answer it in T3.
                  <Button size="sm" className="self-start" onClick={open}>
                    <ExternalLink /> Open run in T3 <Cap>o</Cap>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {r.choices.map((c, i) => (
                      <Button key={c} variant={pick === c ? "default" : "outline"} size="xs" onClick={() => setPick(c)}>
                        <Cap>{String(i + 1)}</Cap> {c}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={field}
                      aria-label="Reason"
                      placeholder="Reason (optional)…"
                      rows={2}
                      className="max-h-40 min-h-9 flex-1 resize-none"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button size="sm" disabled={!pick} onClick={answer}>
                      {busy ? <LoaderCircle className="animate-spin" /> : <Send />} Answer
                    </Button>
                  </div>
                </>
              )
            ) : confirm ? (
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                Cancel run {r.title}?
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => void run(() => postCancel(r.runId), "cancelled")}
                >
                  Cancel run
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setConfirm(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                {!r.retired && (
                  <Button size="sm" onClick={() => void run(() => postResume(r.runId), "resumed")}>
                    {busy === "resumed" ? <LoaderCircle className="animate-spin" /> : <Play />} Resume
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
                  <Ban /> Cancel
                </Button>
              </span>
            )}
            {busy === "cancelled" && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" /> Cancelling…
              </span>
            )}
            {err && <SendErrorAlert err={err} />}
            <div className="flex flex-wrap items-center gap-1">
              {question && r.threadHref && (
                <Button variant="ghost" size="xs" onClick={talk}>
                  <MessagesSquare /> Talk it through
                </Button>
              )}
              {!(question && r.choices.length === 0) && (
                <Button variant="ghost" size="xs" onClick={open}>
                  <ExternalLink /> Open run in T3 <Cap>o</Cap>
                </Button>
              )}
              <Button variant="ghost" size="xs" className="ml-auto" onClick={onSkip}>
                Skip <Cap>j</Cap> <ArrowRight />
              </Button>
            </div>
          </fieldset>
        </>
      )}
      {upcoming.length > 0 && (
        <p className="m-0 truncate border-t pt-2 text-xs text-muted-foreground">Next: {upcoming.join(" · ")}</p>
      )}
    </div>
  );
}
