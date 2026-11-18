import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  List,
  MessageSquarePlus,
  RefreshCw,
  RotateCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  changedLines,
  foldHead,
  hasMore,
  hhmm,
  markRows,
  shortRows,
  type ActionKind,
  type BriefAction,
  type BriefState,
  type Cli,
  type Mark,
  type Snapshot,
} from "../shared/brief.ts";
import type { CliStatus } from "../shared/send.ts";
import type { Branch, ThreadNode } from "../shared/tree.ts";
import { FOCUS_FULL } from "./focus.ts";
import { Focus } from "./focus.tsx";
import { phraseWith } from "./format.ts";
import { MorphProviderIcon, ProviderIcon } from "./provider-icon.tsx";
import { CliGate, SendDialog } from "./send-dialog.tsx";
import { markKey } from "./send.ts";
import { StartDialog } from "./start-dialog.tsx";
import { StatusIcon } from "./status-icon.tsx";

export type Offered = { id: Cli; label: string }[];

/** Each kind takes the colours of one status token. */
const KIND: Record<ActionKind, { label: string; token: string }> = {
  answer: { label: "Answer", token: "needs-input" },
  merge: { label: "Merge", token: "done" },
  unblock: { label: "Unblock", token: "plan" },
  fix: { label: "Fix", token: "failed" },
  review: { label: "Review", token: "working" },
  "clean-up": { label: "Clean up", token: "idle" },
};

export function BriefControls(p: {
  clis: Offered | null;
  cli: Cli | undefined;
  setCli: (c: Cli) => void;
  running: boolean;
  run: () => void;
}) {
  const none = p.clis?.length === 0;
  const model = p.clis?.find((c) => c.id === p.cli)?.label;
  const button = (
    <Button
      size="sm"
      className="rounded-r-none max-[720px]:rounded-r-md!"
      aria-label="What's next"
      disabled={!p.cli || p.running}
      onClick={p.run}
    >
      {p.cli ? <MorphProviderIcon cli={p.cli} /> : <List />}
      <span className="max-[720px]:hidden">What's next</span>
    </Button>
  );
  return (
    <ButtonGroup>
      {none ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a disabled button gets no focus, so the wrapper takes it to show the tooltip */}
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>No logged-in claude or codex CLI found</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
      <ButtonGroupSeparator className="bg-primary-foreground/30 max-[720px]:hidden" />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={!p.clis?.length}>
          <Button size="icon-sm" className="w-7 max-[720px]:hidden" aria-label={model ? `Model: ${model}` : "Model"}>
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Model</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={p.cli ?? ""} onValueChange={(v) => p.setCli(v as Cli)}>
            {p.clis?.map((c) => (
              <DropdownMenuRadioItem key={c.id} value={c.id}>
                <ProviderIcon cli={c.id} className="size-3.5" />
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

function KindChip({ kind }: { kind: ActionKind }) {
  const { label, token } = KIND[kind];
  return (
    <Badge
      variant="outline"
      className="mt-px w-[72px] flex-none justify-start gap-1 rounded-[6px] border-transparent px-1.5 py-0 text-[11px] font-medium"
      style={{
        background: `color-mix(in oklch, var(--status-${token}) var(--wash), transparent)`,
        color: token === "idle" ? "var(--muted-foreground)" : `var(--status-${token}-fg)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: `var(--status-${token})` }} />
      {label}
    </Badge>
  );
}

/** The thread title in full as a heading, or its saved title struck through when it left the tree. */
function ThreadHeading({
  id,
  live,
  saved,
  done,
}: {
  id: string;
  live: Map<string, ThreadNode>;
  saved: string | undefined;
  done: boolean;
}) {
  const t = live.get(id);
  if (!t)
    return (
      <span className="block text-muted-foreground line-through" title="No longer active">
        {saved ?? id}
      </span>
    );
  return (
    <a href={t.href} className="flex items-start gap-1.5 font-[650] hover:underline">
      <span className="pt-[3px]">
        <StatusIcon t={t} />
      </span>
      <span className={done ? "line-through" : ""}>{t.title || t.id}</span>
    </a>
  );
}

export function CopyPrompt({ prompt, label = "Copy prompt" }: { prompt: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="flex-none text-muted-foreground"
          aria-label={label}
          onClick={() => navigator.clipboard?.writeText(prompt).then(() => setDone(true))}
        >
          {done ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px]">{done ? "Copied" : prompt}</TooltipContent>
    </Tooltip>
  );
}

/** Adds a live thread of the Action to the Focus list. With more than one, a menu offers them. */
function FocusAdd({ ids, live }: { ids: string[]; live: Map<string, ThreadNode> }) {
  const { ids: listed, add, full } = useContext(Focus);
  const threads = ids.flatMap((id) => {
    const t = live.get(id);
    return t && !t.settled ? [t] : [];
  });
  if (threads.length === 0) return null;
  const open = threads.filter((t) => !listed.includes(t.id));
  const off = full || open.length === 0;
  const button = (
    <Button
      variant="ghost"
      size="icon-xs"
      className="flex-none text-muted-foreground"
      aria-label="Add to Focus"
      disabled={off}
      onClick={threads.length === 1 ? () => add(threads[0].id) : undefined}
    >
      <Crosshair />
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/** A disabled button gets no hover, so the wrapper keeps the tooltip. */}
        <span className="inline-flex flex-none">
          {threads.length === 1 ? (
            button
          ) : (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-80">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Add to Focus</DropdownMenuLabel>
                {threads.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={listed.includes(t.id)}
                    disabled={listed.includes(t.id)}
                    onSelect={() => add(t.id)}
                  >
                    <StatusIcon t={t} />
                    <span className="truncate">{t.title || t.id}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{full ? FOCUS_FULL : off ? "In Focus" : "Add to Focus"}</TooltipContent>
    </Tooltip>
  );
}

function SendPrompt(p: {
  a: BriefAction;
  prompt: string;
  live: Map<string, ThreadNode>;
  titles: Record<string, string>;
  notes: string[];
  t3cli: CliStatus | null;
  onSent: (key: string, threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const off = p.t3cli?.available === false;
  const button = (
    <Button
      variant="ghost"
      size="icon-xs"
      className="flex-none text-muted-foreground"
      aria-label="Send prompt"
      disabled={off}
      onClick={() => setOpen(true)}
    >
      <Send />
    </Button>
  );
  return (
    <>
      <CliGate t3cli={p.t3cli}>{button}</CliGate>
      <SendDialog
        open={open}
        onOpenChange={setOpen}
        threadIds={p.a.threadIds}
        live={p.live}
        titles={p.titles}
        message={p.prompt}
        notes={p.notes}
        onSent={(id) => p.onSent(markKey(p.a), id)}
      />
    </>
  );
}

function StartPrompt(p: {
  a: BriefAction;
  prompt: string;
  live: Map<string, ThreadNode>;
  projects: Branch[];
  t3cli: CliStatus | null;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <Button
      variant="ghost"
      size="icon-xs"
      className="flex-none text-muted-foreground"
      aria-label="Start thread"
      disabled={p.t3cli?.available === false}
      onClick={() => setOpen(true)}
    >
      <MessageSquarePlus />
    </Button>
  );
  return (
    <>
      <CliGate t3cli={p.t3cli}>{button}</CliGate>
      <StartDialog open={open} onOpenChange={setOpen} a={p.a} prompt={p.prompt} live={p.live} projects={p.projects} />
    </>
  );
}

/** Per-letter weight wave with a shimmer. */
function LoadingText({ text }: { text: string }) {
  return (
    <span className="brief-loading" role="status" aria-label={text}>
      {Array.from(new Intl.Segmenter().segment(text), (s) => s.segment).map((c, i) => (
        <span key={i} aria-hidden style={{ animationDelay: `${i * 60}ms` }}>
          {c}
        </span>
      ))}
    </span>
  );
}

function Row({
  a,
  rank,
  mark,
  snap,
  at,
  live,
  now,
  titles,
  projects,
  t3cli,
  sent,
  onSent,
}: {
  a: BriefAction;
  rank: number;
  mark: Mark | null;
  snap: Snapshot;
  at: string | null;
  now: number;
  live: Map<string, ThreadNode>;
  titles: Record<string, string>;
  projects: Branch[];
  t3cli: CliStatus | null;
  sent: string[] | undefined;
  onSent: (key: string, threadId: string) => void;
}) {
  const waiting = a.kind === "answer" ? live.get(a.threadIds[0]) : undefined;
  const done = mark === "done";
  const badge = mark && (
    <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[11px] font-normal text-muted-foreground">
      {done ? <Check className="size-3" aria-hidden /> : <RefreshCw className="size-3" aria-hidden />}
      {done ? "Done" : "Changed"}
    </Badge>
  );
  return (
    <li
      className={`flex items-start gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-accent ${mark ? "opacity-55 transition-opacity hover:opacity-100" : ""}`}
    >
      <span className="w-4 flex-none pt-px text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {done ? <Check className="ml-auto size-3.5 text-status-done-fg" aria-label="Done" /> : rank}
      </span>
      <div className="min-w-0 flex-1">
        {a.threadIds.map((id) => (
          <ThreadHeading key={id} id={id} live={live} saved={titles[id]} done={done} />
        ))}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <KindChip kind={a.kind} />
          <span className="text-[13px]">{a.title}</span>
          {waiting && <span className="font-mono text-[11px] text-muted-foreground">{phraseWith(waiting, now)}</span>}
          {badge}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{a.reason}</div>
        {sent && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3" aria-hidden />
            Sent to {sent.map((id) => live.get(id)?.title || titles[id] || id).join(", ")}
          </div>
        )}
      </div>
      {a.prompt && (
        <>
          <div className={done ? "hidden" : "contents"}>
            <SendPrompt
              a={a}
              prompt={a.prompt}
              live={live}
              titles={titles}
              notes={mark === "changed" && at ? changedLines(a, live, snap, at) : []}
              t3cli={t3cli}
              onSent={onSent}
            />
            <StartPrompt a={a} prompt={a.prompt} live={live} projects={projects} t3cli={t3cli} />
          </div>
          <CopyPrompt prompt={a.prompt} />
        </>
      )}
      <FocusAdd ids={a.threadIds} live={live} />
    </li>
  );
}

export function BriefPanel(p: {
  state: BriefState;
  clis: Offered | null;
  live: Map<string, ThreadNode>;
  now: number;
  projects: Branch[];
  t3cli: CliStatus | null;
  sent: Map<string, string[]>;
  onSent: (key: string, threadId: string) => void;
  run: () => void;
  cancel: () => void;
  close: () => void;
  folded: boolean;
  fold: (f: boolean) => void;
}) {
  const s = p.state;
  /** A run starts in `running`, or goes straight to a rules-only `done` when no thread needs the model. */
  const runId = s.status === "running" ? s.startedAt : s.status === "done" && s.rulesOnly ? s.generatedAt : null;
  const [all, setAll] = useState(false);
  const [lastRun, setLastRun] = useState(runId);
  if (runId && runId !== lastRun) {
    setLastRun(runId);
    setAll(false);
  }
  const label = s.status !== "idle" ? (p.clis?.find((c) => c.id === s.cli)?.label ?? s.cli) : "";
  const marked = s.status === "done" ? markRows(s.actions, p.live, s) : null;
  const placed = s.status === "idle" ? [] : (marked ?? s.actions.map((a, i) => ({ a, i, mark: null })));
  const count = (m: Mark) => placed.filter((r) => r.mark === m).length;
  const bar = [count("done") && `${count("done")} done`, count("changed") && `${count("changed")} changed`]
    .filter(Boolean)
    .join(" · ");
  const shown = shortRows(placed, all);
  const rows = s.status !== "idle" && shown.length > 0 && (
    <ol className="m-0 list-none p-1.5">
      {shown.map(({ a, i, mark }) => (
        <Row
          key={i}
          a={a}
          rank={i + 1}
          mark={mark}
          snap={s}
          at={s.status === "done" ? s.generatedAt : null}
          live={p.live}
          now={p.now}
          titles={s.titles}
          projects={p.projects}
          t3cli={p.t3cli}
          sent={p.sent.get(markKey(a))}
          onSent={p.onSent}
        />
      ))}
    </ol>
  );
  return (
    <Card className="mb-3 gap-0 overflow-hidden rounded-[12px] py-0 shadow-none">
      <div className="project-head flex min-h-10 items-center gap-2 px-3">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <h2 className="m-0 text-sm font-semibold whitespace-nowrap">Next steps</h2>
        {p.folded ? (
          <span className="font-mono text-[11px] text-muted-foreground">{foldHead(placed)}</span>
        ) : (
          s.status === "done" && (
            <span className="font-mono text-[11px] text-muted-foreground">
              generated {hhmm(s.generatedAt)} · {s.rulesOnly ? "rules only" : label}
            </span>
          )
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto text-muted-foreground"
          aria-label={p.folded ? "Unfold" : "Fold"}
          aria-expanded={!p.folded}
          onClick={() => p.fold(!p.folded)}
        >
          <ChevronRight
            className={`size-3.5 flex-none text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${p.folded ? "" : "rotate-90"}`}
          />
        </Button>
        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label="Hide" onClick={p.close}>
          <X />
        </Button>
      </div>
      {!p.folded && (
        <>
          {s.status === "done" && bar && (
            <div className="flex items-center border-b bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
              {bar} since {hhmm(s.generatedAt)}
              <Button variant="link" size="xs" className="ml-auto" onClick={p.run}>
                <RotateCw /> Run again
              </Button>
            </div>
          )}
          {rows}
          {hasMore(placed) && (
            <div className="flex items-center px-3 pb-1.5 text-xs text-muted-foreground">
              {shown.length === 0 && !all && "Nothing open ·"}
              <Button variant="link" size="xs" onClick={() => setAll(!all)}>
                {all ? "Show less" : `Show all ${placed.length}`}
              </Button>
            </div>
          )}
          {s.status === "running" && (
            <div className={`flex items-center gap-3 px-3 py-3 ${s.actions.length > 0 ? "border-t" : ""}`}>
              <LoadingText text={`Reading ${s.threadCount} threads…`} />
              <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={p.cancel}>
                Cancel
              </Button>
            </div>
          )}
          {s.status === "failed" && (
            <div className="p-1.5">
              <Alert className="border-l-[3px] border-l-status-failed">
                <AlertDescription className="block text-foreground">
                  <div className="flex items-center gap-2">
                    The brief failed.
                    <span className="truncate text-muted-foreground">{s.error}</span>
                    <Button variant="ghost" size="xs" className="ml-auto" onClick={p.run}>
                      <RotateCw /> Retry
                    </Button>
                  </div>
                  {s.stderrTail && (
                    <pre className="mt-1.5 max-h-24 overflow-auto rounded-[6px] bg-muted p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-muted-foreground">
                      {s.stderrTail}
                    </pre>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}
          {s.status === "done" && s.actions.length === 0 && (
            <p className="m-0 px-3 py-3 text-muted-foreground">Nothing needs you right now.</p>
          )}
        </>
      )}
    </Card>
  );
}
