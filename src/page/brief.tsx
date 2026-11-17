import { Check, ChevronDown, Copy, List, MessageSquarePlus, RotateCw, Send, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { ActionKind, BriefAction, BriefState, Cli } from "../shared/brief.ts";
import type { CliStatus } from "../shared/send.ts";
import type { Branch, ThreadNode } from "../shared/tree.ts";
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

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

/** The thread with its live status, or its saved title struck through when it left the tree. */
function ThreadLink({ id, live, saved }: { id: string; live: Map<string, ThreadNode>; saved: string | undefined }) {
  const t = live.get(id);
  if (!t)
    return (
      <span className="max-w-[260px] truncate text-xs text-muted-foreground line-through" title="No longer active">
        {saved ?? id}
      </span>
    );
  return (
    <a href={t.href} className="inline-flex max-w-[260px] min-w-0 items-center gap-1 text-xs hover:underline">
      <StatusIcon t={t} />
      <span className="truncate">{t.title || t.id}</span>
    </a>
  );
}

function CopyPrompt({ prompt }: { prompt: string }) {
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
          aria-label="Copy prompt"
          onClick={() => navigator.clipboard?.writeText(prompt).then(() => setDone(true))}
        >
          {done ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px]">{done ? "Copied" : prompt}</TooltipContent>
    </Tooltip>
  );
}

function SendPrompt(p: {
  a: BriefAction;
  prompt: string;
  live: Map<string, ThreadNode>;
  titles: Record<string, string>;
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
  i,
  live,
  titles,
  projects,
  t3cli,
  sent,
  onSent,
}: {
  a: BriefAction;
  i: number;
  live: Map<string, ThreadNode>;
  titles: Record<string, string>;
  projects: Branch[];
  t3cli: CliStatus | null;
  sent: string[] | undefined;
  onSent: (key: string, threadId: string) => void;
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-accent">
      <span className="w-4 flex-none pt-px text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {i + 1}
      </span>
      <KindChip kind={a.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-[650]">{a.title}</span>
          <span className="text-xs text-muted-foreground">{a.reason}</span>
        </div>
        {sent && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3" aria-hidden />
            Sent to {sent.map((id) => live.get(id)?.title || titles[id] || id).join(", ")}
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {a.threadIds.map((id) => (
            <ThreadLink key={id} id={id} live={live} saved={titles[id]} />
          ))}
        </div>
      </div>
      {a.prompt && (
        <>
          <SendPrompt a={a} prompt={a.prompt} live={live} titles={titles} t3cli={t3cli} onSent={onSent} />
          <StartPrompt a={a} prompt={a.prompt} live={live} projects={projects} t3cli={t3cli} />
          <CopyPrompt prompt={a.prompt} />
        </>
      )}
    </li>
  );
}

export function BriefPanel(p: {
  state: BriefState;
  clis: Offered | null;
  live: Map<string, ThreadNode>;
  projects: Branch[];
  t3cli: CliStatus | null;
  sent: Map<string, string[]>;
  onSent: (key: string, threadId: string) => void;
  run: () => void;
  cancel: () => void;
  close: () => void;
}) {
  const s = p.state;
  const label = s.status !== "idle" ? (p.clis?.find((c) => c.id === s.cli)?.label ?? s.cli) : "";
  const rows = s.status !== "idle" && s.actions.length > 0 && (
    <ol className="m-0 list-none p-1.5">
      {s.actions.map((a, i) => (
        <Row
          key={i}
          a={a}
          i={i}
          live={p.live}
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
        {s.status === "done" && (
          <span className="font-mono text-[11px] text-muted-foreground">
            generated {hhmm(s.generatedAt)} · {s.rulesOnly ? "rules only" : label}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto text-muted-foreground"
          aria-label="Hide"
          onClick={p.close}
        >
          <X />
        </Button>
      </div>
      {rows}
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
    </Card>
  );
}
