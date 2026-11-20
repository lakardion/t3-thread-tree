import {
  ArrowRight,
  CheckCheck,
  CircleCheckBig,
  Crosshair,
  ExternalLink,
  Inbox,
  LoaderCircle,
  Moon,
  Send,
  X,
} from "lucide-react";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { catchUpLines } from "../shared/desktop.ts";
import type { CliStatus, SendError } from "../shared/send.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { hasCatchUpLine } from "./attention.ts";
import { AsksLabel, NoAsk } from "./catch-up-line.tsx";
import { FOCUS_FULL } from "./focus.ts";
import { Focus } from "./focus.tsx";
import { ago, stripKey } from "./format.ts";
import { Hint } from "./key-hints.prototype.tsx";
import { CliGate, LastMessage, SendErrorAlert, useLastMessage } from "./send-dialog.tsx";
import { postSend, postSettle, postSnooze, type Result } from "./send.ts";
import { STATUS, StatusIcon } from "./status-icon.tsx";
import {
  cardOf,
  chips,
  finish,
  isApproval,
  newRound,
  pin,
  restart,
  skip,
  snoozeTimes,
  type Outcome,
} from "./triage.ts";
import { SECTIONS } from "./view.ts";

const Kbd = ({ children }: { children: string }) => (
  <kbd className="font-mono text-[11px] text-muted-foreground">{children}</kbd>
);

/** The header button: the queue count, the key `t`. It opens even with an empty queue, where the card says so. */
export function TriageButton({ count, open, toggle }: { count: number; open: boolean; toggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          variant="outline"
          size="sm"
          className={cn("relative gap-1.5 text-foreground", count === 0 && "text-muted-foreground")}
          aria-label={`Triage, ${count} waiting`}
          aria-keyshortcuts="t"
          pressed={open}
          onPressedChange={toggle}
        >
          <Inbox />
          <span className="max-[720px]:hidden">Triage</span>
          <Hint surface="header" className="key-hint-float -top-2 -right-2">
            t
          </Hint>
          {count > 0 && (
            <span className="rounded-[4px] bg-status-needs-input px-1 text-[11px] text-white tabular-nums">
              {count}
            </span>
          )}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{count > 0 ? "Go through what waits, one by one" : "Nothing waits"} · t</TooltipContent>
    </Tooltip>
  );
}

/** Runs `on` for each plain key press while mounted. Pauses with a dialog, menu or Find open, and with a modifier down. */
function useTriageKeys(on: (e: KeyboardEvent, inField: boolean) => void) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      if (document.querySelector("[data-find], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      const inField =
        e.target instanceof HTMLElement &&
        !!e.target.closest("input, textarea, [contenteditable]:not([contenteditable=false])");
      latest.current(e, inField);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

/** The raw last message. It mounts only while shown, so a card fetches nothing on its own. */
function Last({ t }: { t: ThreadNode }) {
  const text = useLastMessage(t.id, t.updatedAt);
  return <LastMessage text={text === undefined ? "Loading…" : (text ?? "No message.")} />;
}

/** The Catch-up of the card. Nothing without one. */
function CatchUpText({ t }: { t: ThreadNode }) {
  if (!hasCatchUpLine(t)) return null;
  const lines = catchUpLines(t.catchUp);
  if (!lines) return <Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" />;
  if (lines.ask)
    return (
      <p className="m-0 text-sm leading-relaxed">
        <span className="text-muted-foreground">{lines.did} </span>
        <AsksLabel status={t.status} /> {lines.ask}
      </p>
    );
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-1.5 text-sm text-muted-foreground">
      <NoAsk lines={lines} />
    </p>
  );
}

type CardProps = {
  t: ThreadNode;
  gone: boolean;
  pos: number;
  total: number;
  fresh: number;
  now: number;
  t3cli: CliStatus | null;
  upcoming: string[];
  onSkip: () => void;
  onFinish: (outcome: Outcome) => void;
  close: () => void;
};

/** One card. Keyed by thread, so each thread starts with an empty draft and no error. */
function Card({ t, gone, pos, total, fresh, now, t3cli, upcoming, onSkip, onFinish, close }: CardProps) {
  const focus = useContext(Focus);
  const [draft, setDraft] = useState("");
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<SendError>();
  const field = useRef<HTMLTextAreaElement>(null);
  const approval = isApproval(t);
  const picks = chips(t);
  const inFocus = focus.ids.includes(t.id);
  const canSend = t3cli?.available !== false && draft.trim() !== "" && !busy;

  /** The disabled fieldset drops focus from the field, so a failure gives it back. */
  useEffect(() => {
    if (err) field.current?.focus();
  }, [err]);

  const run = async (call: () => Promise<Result>, outcome: Outcome) => {
    if (busy) return;
    setBusy(true);
    setErr(undefined);
    const r = await call();
    setBusy(false);
    if (r.ok) onFinish(outcome);
    else setErr(r.err);
  };
  const send = () => canSend && void run(() => postSend(t.id, draft), "sent");
  const settle = () => void run(() => postSettle(t.id, true), "settled");
  const snooze = (at: Date) => void run(() => postSnooze(t.id, at.toISOString()), "snoozed");
  const addFocus = () => !inFocus && !focus.full && focus.add(t.id);
  const open = () => {
    onSkip();
    location.assign(t.href);
  };
  const fill = (text: string) => {
    setDraft(text);
    field.current?.focus();
  };

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
    const act: Record<string, (() => void) | undefined> = gone
      ? { j: onSkip, ArrowRight: onSkip }
      : {
          e: settle,
          z: () => setMenu(true),
          f: addFocus,
          o: open,
          j: onSkip,
          ArrowRight: onSkip,
          " ": () => setMore((m) => !m),
          r: approval ? undefined : () => field.current?.focus(),
        };
    const pick = !gone && !approval && n >= 1 && n <= picks.length ? () => fill(picks[n - 1].text) : act[e.key];
    if (!pick) return;
    e.preventDefault();
    pick();
  });

  const since = t.since ? ago(t.since, now) : "";
  const toFocus = (
    <Button variant="ghost" size="xs" disabled={inFocus || focus.full} onClick={addFocus}>
      <Crosshair /> {inFocus ? "In Focus" : "Focus"} <Kbd>f</Kbd>
    </Button>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon t={t} now={now} />
        <span className={cn(STATUS[t.status].shape, "font-semibold")}>
          {SECTIONS.find(([, , statuses]) => statuses.includes(t.status))?.[1]}
        </span>
        <span className="text-muted-foreground">· {t.phrase}</span>
        {since && <span className={cn(STATUS[t.status].shape, "tabular-nums")}>{since}</span>}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {pos} of {total}
          {fresh > 0 && <span className="ml-1 text-status-needs-input">+{fresh} new</span>}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Close Triage" onClick={close}>
          <X />
        </Button>
      </div>
      <a href={t.href} className="text-sm font-semibold break-words hover:underline">
        {t.key && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{t.key}</span>}
        {(t.key ? stripKey(t.title, t.key) : t.title) || t.id}
      </a>
      {gone ? (
        <div className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
          No longer waits.{" "}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={onSkip}>
            Next
          </Button>
        </div>
      ) : (
        <>
          <CatchUpText t={t} />
          <button
            type="button"
            className="self-start text-xs text-muted-foreground hover:underline"
            onClick={() => setMore((m) => !m)}
          >
            {more ? "Hide" : "Show"} last message <Kbd>space</Kbd>
          </button>
          {more && <Last t={t} />}
          <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
            {approval ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
                T3 does not take an approval as a message. Approve it in T3.
                <Button size="sm" className="self-start" onClick={open}>
                  <ExternalLink /> Open in T3 <Kbd>o</Kbd>
                </Button>
              </div>
            ) : (
              <>
                {picks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {picks.map((c, i) => (
                      <Button
                        key={`${i}${c.label}`}
                        variant="outline"
                        size="xs"
                        title={c.text}
                        onClick={() => fill(c.text)}
                      >
                        <Kbd>{String(i + 1)}</Kbd> {c.label}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={field}
                    aria-label="Reply"
                    placeholder="Reply…"
                    rows={2}
                    className="max-h-40 min-h-9 flex-1 resize-none text-sm"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <CliGate t3cli={t3cli}>
                    <Button size="sm" disabled={!canSend} onClick={send}>
                      {busy ? <LoaderCircle className="animate-spin" /> : <Send />} Send
                    </Button>
                  </CliGate>
                </div>
              </>
            )}
            {err && <SendErrorAlert err={err} />}
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="xs" onClick={settle}>
                <CircleCheckBig /> Settle <Kbd>e</Kbd>
              </Button>
              <DropdownMenu open={menu} onOpenChange={setMenu}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs">
                    <Moon /> Snooze <Kbd>z</Kbd>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {snoozeTimes(new Date(now)).map(({ label, at }) => (
                    <DropdownMenuItem key={label} onSelect={() => snooze(at)}>
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {focus.full && !inFocus ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a disabled button gets no focus, so the wrapper takes it to show the tooltip */}
                    <span tabIndex={0}>{toFocus}</span>
                  </TooltipTrigger>
                  <TooltipContent>{FOCUS_FULL}</TooltipContent>
                </Tooltip>
              ) : (
                toFocus
              )}
              {!approval && (
                <Button variant="ghost" size="xs" onClick={open}>
                  <ExternalLink /> Open in T3 <Kbd>o</Kbd>
                </Button>
              )}
              <Button variant="ghost" size="xs" className="ml-auto" onClick={onSkip}>
                Skip <Kbd>j</Kbd> <ArrowRight />
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

/** The end of the walk: counts, a way back to the skipped threads, and a slot for an offer. */
function End({
  done,
  skippedLeft,
  onRestart,
  close,
  extra,
}: {
  done: Map<string, Outcome>;
  skippedLeft: number;
  onRestart: () => void;
  close: () => void;
  extra?: ReactNode;
}) {
  useTriageKeys((e, inField) => !inField && (e.key === "Escape" || e.key === "t") && close());
  const n = (o: Outcome) => [...done.values()].filter((x) => x === o).length;
  return (
    <div className="flex flex-col items-center gap-2 py-3 text-center">
      <CheckCheck className="size-5 text-status-done" />
      <span className="text-sm font-semibold">Nothing waits</span>
      <span className="text-xs text-muted-foreground">
        {n("sent")} sent · {n("settled")} settled · {n("snoozed")} snoozed
      </span>
      <div data-slot="triage-end-extra">{extra}</div>
      <div className="flex gap-2">
        {skippedLeft > 0 && (
          <Button variant="outline" size="sm" onClick={onRestart}>
            Start again ({skippedLeft} skipped)
          </Button>
        )}
        <Button size="sm" onClick={close}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** The sticky card at the top of the list. It mounts on open, so each open starts a new round. */
export function TriageCard({
  queue,
  live,
  now,
  t3cli,
  close,
  endExtra,
}: {
  queue: ThreadNode[];
  live: Map<string, ThreadNode>;
  now: number;
  t3cli: CliStatus | null;
  close: () => void;
  endExtra?: ReactNode;
}) {
  const { reveal } = useContext(Focus);
  const revealRef = useRef(reveal);
  useEffect(() => {
    revealRef.current = reveal;
  });
  const [round, setRound] = useState(() => newRound(queue));
  const pinned = pin(round, queue);
  if (pinned !== round) setRound(pinned);
  const card = cardOf(queue, round);
  /** A thread that left the tree keeps its last node, so its card can say it no longer waits. */
  const [kept, setKept] = useState<ThreadNode>();
  const node = card.id ? live.get(card.id) : undefined;
  if (node && node !== kept) setKept(node);
  const t = node ?? (kept?.id === card.id ? kept : undefined);
  useEffect(() => {
    const id = card.id;
    /** `reveal` flushes a render, which React forbids inside an effect. */
    if (id) queueMicrotask(() => void revealRef.current(id));
  }, [card.id]);

  return (
    <section aria-label="Triage" className="sticky top-0 z-30 mb-3 bg-background">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        {card.id && t ? (
          <Card
            key={t.id}
            t={t}
            gone={card.gone}
            pos={card.pos}
            total={card.total}
            fresh={card.fresh}
            now={now}
            t3cli={t3cli}
            upcoming={card.upcoming.map((id) => live.get(id)?.title || id)}
            onSkip={() => setRound((r) => skip(r, t.id))}
            onFinish={(o) => setRound((r) => finish(r, t.id, o))}
            close={close}
          />
        ) : (
          <End
            done={round.done}
            skippedLeft={card.skippedLeft}
            onRestart={() => setRound(restart)}
            close={close}
            extra={endExtra}
          />
        )}
      </div>
    </section>
  );
}
