/**
 * PROTOTYPE, throwaway. Three looks for starting a workflow, switched by `?variant=A|B|C`:
 * A: workflows are a group in Cmd+K, and the form opens inside the palette.
 * B: `>` in Cmd+K lists workflows, and the form is a separate dialog. The row opens a menu.
 * C: workflows are a group in Cmd+K, and the form is a side panel that keeps the tree in view.
 * `?wf=empty` shows the empty list. A field value that holds "fail" shows the failure. Start is a stub.
 * The fields of the fake workflows are an assumption: the payload convention is not decided.
 */
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheck, LoaderCircle, Play, Workflow, X } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { SendError } from "../shared/send.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { SendErrorAlert } from "./send-dialog.tsx";

type Field = {
  name: string;
  label: string;
  kind: "pr" | "stack" | "text" | "long" | "pick";
  optional?: boolean;
  options?: string[];
  hint?: string;
};
type Wf = { name: string; version: number; title: string; triggers: string[]; fields: Field[] };

const WORKFLOWS: Wf[] = [
  {
    name: "review-pr",
    version: 3,
    title: "Review a PR",
    triggers: [],
    fields: [
      { name: "prNumber", label: "PR", kind: "pr" },
      { name: "focus", label: "Focus", kind: "text", optional: true, hint: "What to look at first" },
    ],
  },
  {
    name: "land-stack",
    version: 1,
    title: "Land a PR stack",
    triggers: [],
    fields: [
      { name: "stack", label: "Stack", kind: "stack" },
      { name: "method", label: "Merge method", kind: "pick", options: ["squash", "merge", "rebase"] },
    ],
  },
  {
    name: "write-note",
    version: 2,
    title: "Write a note",
    triggers: ["every 1h"],
    fields: [{ name: "text", label: "Note", kind: "long", hint: "Free text" }],
  },
];

export const VARIANTS = ["A", "B", "C"] as const;
const NAMES = { A: "Form in the palette", B: "> mode and a dialog", C: "Side panel" };
export type Variant = (typeof VARIANTS)[number];
const params = () => new URLSearchParams(location.search);
export const variant = (): Variant | null => {
  const v = params().get("variant");
  return VARIANTS.includes(v as Variant) ? (v as Variant) : null;
};
const workflows = () => (params().get("wf") === "empty" ? [] : WORKFLOWS);

/** The row data that fills fields. */
type Ctx = { title: string; pr: number | null; stack: string | null };
const ctxOf = (t: ThreadNode): Ctx => {
  const own = t.prs.filter((p) => p.state === "open");
  return {
    title: t.title,
    pr: own[0]?.n ?? t.prs[0]?.n ?? null,
    stack: t.stack && t.prs[0] ? `#${t.prs[0].n} and its stack (${t.stack.total} PRs)` : null,
  };
};
const fits = (w: Wf, c: Ctx) =>
  w.fields.every(
    (f) => f.optional || (f.kind === "pr" ? c.pr !== null : f.kind === "stack" ? c.stack !== null : true),
  ) && w.fields.some((f) => f.kind === "pr" || f.kind === "stack");
const prefill = (w: Wf, c: Ctx | null): Record<string, string> =>
  Object.fromEntries(
    w.fields.map((f) => [
      f.name,
      f.kind === "pr" && c?.pr
        ? String(c.pr)
        : f.kind === "stack" && c?.stack
          ? c.stack
          : f.kind === "pick"
            ? f.options![0]!
            : "",
    ]),
  );

type Started = { wf: Wf; runId: string };
type Proto = {
  /** Open state of the variant's own surface. */
  form: { wf: Wf; ctx: Ctx | null } | null;
  setForm: (f: Proto["form"]) => void;
  /** A: the palette opens on the workflow list for a row. */
  paletteFor: Ctx | null;
  setPaletteFor: (c: Ctx | null) => void;
  openPalette: () => void;
  started: Started | null;
  setStarted: (s: Started | null) => void;
};
const ProtoContext = createContext<Proto | null>(null);
export const useProto = () => useContext(ProtoContext);

export function ProtoProvider({ openPalette, children }: { openPalette: () => void; children: ReactNode }) {
  const [form, setForm] = useState<Proto["form"]>(null);
  const [paletteFor, setPaletteFor] = useState<Ctx | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  if (!variant()) return children;
  return (
    <ProtoContext.Provider value={{ form, setForm, paletteFor, setPaletteFor, openPalette, started, setStarted }}>
      {children}
    </ProtoContext.Provider>
  );
}

const stubStart = async (wf: Wf, values: Record<string, string>): Promise<Started | SendError> => {
  await new Promise((r) => setTimeout(r, 900));
  if (Object.values(values).some((v) => v.includes("fail")))
    return {
      error: `The payload does not fit workflow ${wf.name}: Expected a number, got "fail"`,
      exitCode: 1,
      stderrTail: "",
    };
  return { wf, runId: `wr_${Math.random().toString(36).slice(2, 8)}` };
};

const Triggers = ({ w }: { w: Wf }) =>
  w.triggers.length > 0 ? <span className="text-[11px] text-muted-foreground">· {w.triggers.join(", ")}</span> : null;

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[12px] text-muted-foreground">{children}</span>
);

/** The fields, the failure and the Start button. Shared by every variant; only the frame around it differs. */
function WfForm({
  wf,
  ctx,
  compact,
  onDone,
  footer,
}: {
  wf: Wf;
  ctx: Ctx | null;
  compact?: boolean;
  onDone: () => void;
  footer?: (start: ReactNode) => ReactNode;
}) {
  const proto = useProto()!;
  const [values, setValues] = useState(() => prefill(wf, ctx));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<SendError | null>(null);
  const ready = wf.fields.every((f) => f.optional || values[f.name]!.trim() !== "");
  const run = async () => {
    setBusy(true);
    setErr(null);
    const r = await stubStart(wf, values);
    setBusy(false);
    if ("error" in r) return setErr(r);
    proto.setStarted(r);
    onDone();
  };
  const set = (n: string, v: string) => setValues((s) => ({ ...s, [n]: v }));
  const start = (
    <Button disabled={!ready || busy} onClick={() => void run()} size={compact ? "sm" : "default"}>
      {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
      {busy ? "Starting" : "Start"}
      {!busy && <kbd className="ml-1 font-mono text-[11px] opacity-70">⌘↵</kbd>}
    </Button>
  );
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready && !busy) void run();
      }}
    >
      <fieldset disabled={busy} className="grid gap-3">
        {wf.fields.map((f) => {
          const filled = ctx && (f.kind === "pr" || f.kind === "stack") && values[f.name] === prefill(wf, ctx)[f.name];
          return (
            <div key={f.name} className="grid gap-1.5">
              <Label htmlFor={`wf-${f.name}`} className="text-[12px]">
                {f.label}
                {f.optional && <span className="font-normal text-muted-foreground">optional</span>}
                {filled && <span className="font-normal text-muted-foreground">· from the row</span>}
              </Label>
              {f.kind === "long" ? (
                <Textarea
                  id={`wf-${f.name}`}
                  autoFocus
                  rows={compact ? 3 : 4}
                  placeholder={f.hint}
                  value={values[f.name]}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.kind === "pick" ? (
                <Select value={values[f.name]} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger id={`wf-${f.name}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options!.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`wf-${f.name}`}
                  autoFocus={!filled && f === wf.fields.find((x) => !(ctx && (x.kind === "pr" || x.kind === "stack")))}
                  placeholder={f.kind === "pr" ? "PR number" : f.kind === "stack" ? "PR numbers, bottom first" : f.hint}
                  className={cn((f.kind === "pr" || f.kind === "stack") && "font-mono")}
                  value={values[f.name]}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </fieldset>
      {err && <SendErrorAlert err={err} />}
      {footer ? footer(start) : <div className="flex justify-end">{start}</div>}
    </form>
  );
}

/** The row the form is for, as one line. */
const ForRow = ({ ctx }: { ctx: Ctx | null }) =>
  ctx ? (
    <div className="truncate rounded-[6px] bg-muted px-2 py-1 text-[12px] text-muted-foreground">
      For <span className="text-foreground">{ctx.title}</span>
    </div>
  ) : null;

const WfIcon = () => <Workflow className="size-4 text-muted-foreground" />;

/** No workflow on the server. The cause (off or no file) is unknown until a start. */
const EmptyWorkflows = () => (
  <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
    No workflows on this server. Turn on Workflows in T3 Settings → Labs, or add a workflow file.
  </div>
);

/**
 * The Cmd+K part. `q` is the palette query. Returns null when the variant shows no workflows for this query.
 * `takeover` is set when the palette body must show only the workflow view (A form, A row list, B `>` mode).
 */
export function usePaletteWorkflows(q: string, close: () => void) {
  const proto = useProto();
  const v = variant();
  if (!proto || !v) return null;
  const list = workflows();
  const query = q.trim().replace(/^>\s*/, "").toLowerCase();
  const match = list.filter((w) => !query || `${w.name} ${w.title}`.toLowerCase().includes(query));

  /** A: the form fills the palette. */
  if (v === "A" && proto.form) {
    const { wf, ctx } = proto.form;
    return {
      bare: true,
      takeover: (
        <div className="grid gap-3 p-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" aria-label="Back" onClick={() => proto.setForm(null)}>
              <ArrowLeft />
            </Button>
            <span className="text-[13px] font-medium">{wf.title}</span>
            <Mono>
              {wf.name} v{wf.version}
            </Mono>
          </div>
          <ForRow ctx={ctx} />
          <WfForm
            wf={wf}
            ctx={ctx}
            compact
            onDone={() => {
              proto.setForm(null);
              proto.setPaletteFor(null);
              close();
            }}
            footer={(start) => (
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-[11px] text-muted-foreground">Esc closes</span>
                {start}
              </div>
            )}
          />
        </div>
      ),
    };
  }

  const item = (w: Wf, ctx: Ctx | null) => (
    <CommandItem
      key={w.name}
      value={`wf:${w.name}`}
      onSelect={() => {
        proto.setForm({ wf: w, ctx });
        if (v !== "A") close();
      }}
      className="gap-2.5 py-2"
    >
      <WfIcon />
      <span className="text-[13px] font-medium">{w.title}</span>
      <Mono>{w.name}</Mono>
      <Triggers w={w} />
    </CommandItem>
  );

  /** A: opened from a row. The palette lists only the workflows that fit it. */
  if (v === "A" && proto.paletteFor) {
    const ctx = proto.paletteFor;
    const fit = list.filter((w) => fits(w, ctx));
    return {
      takeover: (
        <>
          <div className="px-3 pt-3">
            <ForRow ctx={ctx} />
          </div>
          {list.length === 0 ? (
            <EmptyWorkflows />
          ) : (
            <CommandGroup heading="Workflows for this thread">{fit.map((w) => item(w, ctx))}</CommandGroup>
          )}
        </>
      ),
    };
  }

  /** B: only the `>` prefix shows workflows, and then only workflows. */
  if (v === "B") {
    if (!q.startsWith(">"))
      return {
        group: (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            Type <kbd className="font-mono">&gt;</kbd> to start a workflow
          </div>
        ),
      };
    return {
      takeover:
        list.length === 0 ? (
          <EmptyWorkflows />
        ) : (
          <CommandGroup heading="Start a workflow">{match.map((w) => item(w, null))}</CommandGroup>
        ),
    };
  }

  /** A and C: a group below the threads. */
  if (list.length === 0) return { group: query ? null : <EmptyWorkflows /> };
  if (match.length === 0) return { group: null };
  return { group: <CommandGroup heading="Workflows">{match.map((w) => item(w, null))}</CommandGroup> };
}

/** The row button. A opens the palette, B opens a menu, C opens the panel. */
export function RowWorkflowButton({ t, className }: { t: ThreadNode; className: string }) {
  const proto = useProto();
  const v = variant();
  if (!proto || !v) return null;
  const ctx = ctxOf(t);
  const fit = workflows().filter((w) => fits(w, ctx));
  if (fit.length === 0) return null;
  const button = (onClick?: () => void) => (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Start workflow"
      title="Start workflow"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <Workflow className="size-3.5" />
    </Button>
  );
  if (v === "B")
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{button()}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
            Start a workflow
          </DropdownMenuLabel>
          {fit.map((w) => (
            <DropdownMenuItem key={w.name} onSelect={() => proto.setForm({ wf: w, ctx })}>
              <Workflow />
              {w.title}
              <Mono>{w.name}</Mono>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  if (v === "A")
    return button(() => {
      proto.setForm(null);
      proto.setPaletteFor(ctx);
      proto.openPalette();
    });
  return button(() => proto.setForm({ wf: fit[0]!, ctx }));
}

/** B: the form as a dialog, like Send. */
function DialogForm() {
  const proto = useProto()!;
  const f = proto.form;
  return (
    <Dialog open={!!f} onOpenChange={(o) => !o && proto.setForm(null)}>
      {f && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Workflow className="size-4" />
              {f.wf.title}
            </DialogTitle>
            <DialogDescription>
              Starts <span className="font-mono">{f.wf.name}</span> v{f.wf.version} on this server.
            </DialogDescription>
          </DialogHeader>
          <ForRow ctx={f.ctx} />
          <WfForm
            key={f.wf.name}
            wf={f.wf}
            ctx={f.ctx}
            onDone={() => proto.setForm(null)}
            footer={(start) => (
              <DialogFooter>
                <Button variant="outline" onClick={() => proto.setForm(null)}>
                  Cancel
                </Button>
                {start}
              </DialogFooter>
            )}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** C: the form as a side panel. The tree stays in view and usable. A row click while open swaps the row. */
function PanelForm() {
  const proto = useProto()!;
  const f = proto.form;
  if (!f) return null;
  const others = f.ctx ? workflows().filter((w) => fits(w, f.ctx!)) : [];
  return (
    <aside className="fixed top-3 right-3 bottom-3 z-40 flex w-[340px] flex-col gap-3 overflow-auto rounded-[10px] border bg-popover p-4 shadow-xl max-[720px]:inset-x-0 max-[720px]:top-auto max-[720px]:w-auto max-[720px]:rounded-b-none">
      <div className="flex items-center gap-2">
        <Workflow className="size-4 text-muted-foreground" />
        <span className="flex-1 text-[13px] font-semibold">Start a workflow</span>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={() => proto.setForm(null)}>
          <X />
        </Button>
      </div>
      <ForRow ctx={f.ctx} />
      {others.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {others.map((w) => (
            <Button
              key={w.name}
              size="sm"
              variant={w.name === f.wf.name ? "secondary" : "ghost"}
              onClick={() => proto.setForm({ wf: w, ctx: f.ctx })}
            >
              {w.title}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-0.5">
        <span className="text-[14px] font-medium">{f.wf.title}</span>
        <span className="flex items-center gap-1.5">
          <Mono>
            {f.wf.name} v{f.wf.version}
          </Mono>
          <Triggers w={f.wf} />
        </span>
      </div>
      <WfForm key={`${f.wf.name}:${f.ctx?.title}`} wf={f.wf} ctx={f.ctx} onDone={() => proto.setForm(null)} />
    </aside>
  );
}

/** After a start: a toast with the run. The after-start view is not decided; this is a stand-in. */
function StartedToast() {
  const proto = useProto()!;
  const s = proto.started;
  useEffect(() => {
    if (!s) return;
    const id = setTimeout(() => proto.setStarted(null), 6000);
    return () => clearTimeout(id);
  }, [s]);
  if (!s) return null;
  return (
    <div className="fixed right-4 bottom-16 z-50 flex items-center gap-2 rounded-[8px] border bg-popover px-3 py-2 text-[13px] shadow-lg">
      <CircleCheck className="size-4 text-status-done" />
      Started {s.wf.title}
      <Mono>{s.runId}</Mono>
      <a className="text-[12px] underline" href="#">
        Open run
      </a>
    </div>
  );
}

/** Variant surfaces, the toast and the switcher bar. */
export function ProtoLayer() {
  const proto = useProto();
  const v = variant();
  useEffect(() => {
    if (!v) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement;
      if (el?.closest("input, textarea, [contenteditable], [role=dialog], [role=menu]")) return;
      go(e.key === "ArrowLeft" ? -1 : 1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [v]);
  if (!proto || !v) return null;
  return (
    <>
      {v === "B" && <DialogForm />}
      {v === "C" && <PanelForm />}
      <StartedToast />
      <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-2 py-1 text-[12px] text-background shadow-lg">
        <button
          className="rounded-full p-1 hover:bg-background/20"
          aria-label="Previous variant"
          onClick={() => go(-1)}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-1 font-medium">
          {v} ({NAMES[v]})
        </span>
        <button className="rounded-full p-1 hover:bg-background/20" aria-label="Next variant" onClick={() => go(1)}>
          <ChevronRight className="size-4" />
        </button>
      </div>
    </>
  );
}

const go = (d: number) => {
  const p = params();
  const i = VARIANTS.indexOf(variant() ?? "A");
  p.set("variant", VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length]!);
  location.search = p.toString();
};
