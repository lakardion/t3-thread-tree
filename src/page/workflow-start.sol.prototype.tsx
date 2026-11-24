// Throwaway workflow start layouts on the thread tree (?variant=D, E, F).
// The fake server list supplies name, version and triggers. Descriptions, field
// metadata and row prefill conventions below are assumptions for the demo.
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GitPullRequest,
  Layers,
  LoaderCircle,
  Play,
  StickyNote,
  Workflow,
  X,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { SendError } from "../shared/send.ts";
import type { ThreadNode } from "../shared/tree.ts";
import { SendErrorAlert } from "./send-dialog.tsx";

type Field = { name: string; label: string; optional?: boolean; multiline?: boolean; options?: string[] };
type WorkflowExample = {
  name: string;
  version: string;
  triggers: string[];
  description: string;
  icon: typeof Workflow;
  fields: Field[];
};

const WORKFLOWS: WorkflowExample[] = [
  {
    name: "review-pr",
    version: "1",
    triggers: [],
    description: "Review a pull request",
    icon: GitPullRequest,
    fields: [
      { name: "pr", label: "PR number" },
      { name: "focus", label: "Review focus", optional: true },
    ],
  },
  {
    name: "land-stack",
    version: "2",
    triggers: [],
    description: "Merge a stack of pull requests",
    icon: Layers,
    fields: [
      { name: "stack", label: "Stack (PR numbers, comma separated)" },
      { name: "method", label: "Merge method", options: ["Squash", "Merge", "Rebase"] },
    ],
  },
  {
    name: "write-note",
    version: "1",
    triggers: ["every 1h"],
    description: "Write a note from a prompt",
    icon: StickyNote,
    fields: [{ name: "text", label: "What should the note say?", multiline: true }],
  },
];

const VARIANTS = [
  { key: "D", label: "Command and confirm" },
  { key: "E", label: "Side panel" },
  { key: "F", label: "Inline composer" },
] as const;
type Variant = (typeof VARIANTS)[number];
type Session = {
  inputs?: Record<string, string>;
  thread?: ThreadNode;
  workflow?: WorkflowExample;
  origin?: HTMLElement | null;
};
type Prototype = {
  variant: Variant;
  workflows: WorkflowExample[];
  session: Session | null;
  open: (session: Session) => void;
  select: (workflow: WorkflowExample) => void;
  close: () => void;
};
const WorkflowPrototype = createContext<Prototype | null>(null);
const empty = "No workflows available on this server.";

export function WorkflowPrototypeProvider({ children }: { children: ReactNode }) {
  const [variant, setVariant] = useState(() =>
    process.env.NODE_ENV !== "production"
      ? VARIANTS.find(({ key }) => key === new URLSearchParams(location.search).get("variant"))
      : undefined,
  );
  const [session, setSession] = useState<Session | null>(null);
  const [workflows] = useState(() => (new URLSearchParams(location.search).get("wf") === "empty" ? [] : WORKFLOWS));
  const close = () => {
    const origin = session?.origin;
    setSession(null);
    if (origin) requestAnimationFrame(() => origin.focus());
  };

  const switchVariant = useCallback(
    (step: number) => {
      if (!variant) return;
      const next = VARIANTS[(VARIANTS.indexOf(variant) + step + VARIANTS.length) % VARIANTS.length];
      const url = new URL(location.href);
      url.searchParams.set("variant", next.key);
      history.replaceState(history.state, "", url);
      setSession(null);
      setVariant(next);
    },
    [variant],
  );

  useEffect(() => {
    if (!variant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (
        document.activeElement?.closest(
          "input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=combobox]",
        ) ||
        document.querySelector("[role=dialog][data-state=open], [role=menu][data-state=open]")
      )
        return;
      e.preventDefault();
      switchVariant(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, switchVariant]);

  if (!variant) return children;
  const value: Prototype = {
    variant,
    workflows,
    session,
    open: setSession,
    close,
    select: (workflow) => setSession((current) => current && { ...current, workflow }),
  };
  return (
    <WorkflowPrototype.Provider value={value}>
      {children}
      {session && <WorkflowSurface key={variant.key} prototype={value} session={session} />}
      <div
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-1.5 py-1 text-xs font-medium whitespace-nowrap text-background shadow-lg"
        aria-label="Prototype variants"
      >
        <Button
          size="icon-xs"
          variant="ghost"
          className="rounded-full hover:bg-background/20 hover:text-background"
          aria-label="Previous variant"
          onClick={() => switchVariant(-1)}
        >
          <ChevronLeft />
        </Button>
        <span aria-live="polite">
          {variant.key} · {variant.label}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="rounded-full hover:bg-background/20 hover:text-background"
          aria-label="Next variant"
          onClick={() => switchVariant(1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </WorkflowPrototype.Provider>
  );
}

export function WorkflowFindItems({ query, onChoose }: { query: string; onChoose: () => void }) {
  const prototype = useContext(WorkflowPrototype);
  if (!prototype) return null;
  const { variant, workflows, open } = prototype;
  const choose = (workflow?: WorkflowExample) => {
    onChoose();
    open({ workflow });
  };
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  if (variant.key !== "D") {
    return matches("Start a workflow") ? (
      <CommandGroup heading="Actions">
        <CommandItem value="workflow:open" onSelect={() => choose()}>
          <Workflow /> Start a workflow…
        </CommandItem>
      </CommandGroup>
    ) : null;
  }
  const results = workflows.filter((workflow) => matches(workflow.name) || matches(workflow.description));
  if (!results.length && (workflows.length || query)) return null;
  return (
    <CommandGroup heading="Workflows">
      {results.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>}
      {results.map((workflow) => (
        <CommandItem key={workflow.name} value={`workflow:${workflow.name}`} onSelect={() => choose(workflow)}>
          <workflow.icon />
          <span className="font-mono text-xs">{workflow.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{workflow.triggers[0] ?? workflow.description}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function WorkflowRowAction({
  thread,
  stackPrs,
  className,
}: {
  thread: ThreadNode;
  stackPrs?: number[];
  className: string;
}) {
  const prototype = useContext(WorkflowPrototype);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!prototype) return null;
  const { variant, workflows, open, session, close } = prototype;
  const inputs: Record<string, string> = {
    pr: thread.prs[0] ? String(thread.prs[0].n) : "",
    stack: stackPrs?.join(", ") ?? "",
  };
  const expanded = variant.key === "F" && session?.thread?.id === thread.id;
  const button = (
    <Button
      ref={trigger}
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Start workflow"
      title="Start workflow"
      aria-expanded={variant.key === "F" ? expanded : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (variant.key === "D") return;
        if (expanded) return close();
        const suggested = inputs.stack ? "stack" : inputs.pr ? "pr" : "";
        const workflow =
          variant.key === "E" && suggested
            ? workflows.find((item) => item.fields.some((field) => field.name === suggested))
            : undefined;
        open({ thread, workflow, inputs, origin: trigger.current });
      }}
    >
      <Workflow className="size-3.5" />
    </Button>
  );
  if (variant.key !== "D") return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Start workflow</DropdownMenuLabel>
        {workflows.length === 0 && <DropdownMenuItem disabled>{empty}</DropdownMenuItem>}
        {workflows.map((workflow) => (
          <DropdownMenuItem
            key={workflow.name}
            onSelect={() => open({ thread, workflow, inputs, origin: trigger.current })}
          >
            <workflow.icon /> <span className="font-mono text-xs">{workflow.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {workflow.fields.some((field) => inputs[field.name]) ? "Prefilled" : workflow.triggers[0]}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkflowRowComposer({ thread }: { thread: ThreadNode }) {
  const prototype = useContext(WorkflowPrototype);
  if (prototype?.variant.key !== "F" || prototype.session?.thread?.id !== thread.id) return null;
  return <Composer prototype={prototype} session={prototype.session} inline />;
}

function WorkflowSurface({ prototype, session }: { prototype: Prototype; session: Session }) {
  const { workflow, thread } = session;
  const { close, variant } = prototype;
  if (variant.key === "D" && workflow)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            if (session.origin) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-mono">{workflow.name}</DialogTitle>
            <DialogDescription>
              {workflow.description} · v{workflow.version}
              {workflow.triggers.map((trigger) => ` · ${trigger}`)}
            </DialogDescription>
          </DialogHeader>
          {thread && <ThreadContext thread={thread} />}
          <WorkflowForm key={workflow.name} workflow={workflow} inputs={session.inputs} close={close} />
        </DialogContent>
      </Dialog>
    );
  if (variant.key === "E") return <SidePanel prototype={prototype} session={session} />;
  if (variant.key === "F" && !thread)
    return (
      <div className="pointer-events-none fixed inset-x-3 bottom-14 z-30 mx-auto max-w-2xl">
        <Composer prototype={prototype} session={session} />
      </div>
    );
  return null;
}

function ThreadContext({ thread }: { thread: ThreadNode }) {
  return (
    <p className="truncate text-xs text-muted-foreground" title={thread.title}>
      From {thread.title || thread.id}
    </p>
  );
}

function SidePanel({ prototype, session }: { prototype: Prototype; session: Session }) {
  const { thread, workflow } = session;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section
      aria-label="Workflow side panel"
      className="fixed inset-y-0 right-0 z-30 flex w-[440px] max-w-full flex-col overflow-auto border-l bg-background shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="grid min-w-0 gap-1">
          <h2 ref={heading} tabIndex={-1} className="font-semibold outline-none">
            Workflows
          </h2>
          {thread && <ThreadContext thread={thread} />}
        </div>
        <CloseButton onClick={prototype.close} />
      </header>
      <div className="grid gap-1 border-b p-3">
        {!prototype.workflows.length && <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>}
        {prototype.workflows.map((item) => (
          <Button
            key={item.name}
            type="button"
            variant="ghost"
            aria-pressed={item === workflow}
            className="h-auto justify-start gap-3 px-3 py-2.5 text-left aria-pressed:bg-accent"
            onClick={() => prototype.select(item)}
          >
            <item.icon className="shrink-0 text-muted-foreground" />
            <span className="grid flex-1 gap-0.5">
              <span className="font-mono text-xs">{item.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              v{item.version}
              {item.triggers.map((trigger) => ` · ${trigger}`)}
            </span>
          </Button>
        ))}
      </div>
      {workflow ? (
        <div className="grid gap-4 p-5">
          <h3 className="text-sm font-semibold">Run inputs</h3>
          <WorkflowForm
            key={`${thread?.id ?? "find"}:${workflow.name}`}
            workflow={workflow}
            inputs={session.inputs}
            close={prototype.close}
          />
        </div>
      ) : (
        prototype.workflows.length > 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground">Choose a workflow to see its inputs.</p>
        )
      )}
    </section>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Close workflow" onClick={onClick}>
      <X />
    </Button>
  );
}

function Composer({ prototype, session, inline }: { prototype: Prototype; session: Session; inline?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { workflow } = session;
  useEffect(() => {
    // Wait for Find's modal focus lock to be removed before transferring focus.
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <section
      aria-label={inline ? "Row workflow composer" : "Workflow composer"}
      className={cn(
        "pointer-events-auto grid gap-3 rounded-lg border bg-card p-3",
        inline ? "my-1 mr-2 ml-8 border-l-2 border-l-primary" : "p-4 shadow-2xl",
      )}
    >
      <header className="flex items-center justify-between">
        <h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold outline-none">
          <Workflow className="size-4 text-muted-foreground" /> Start a workflow
        </h2>
        <CloseButton onClick={prototype.close} />
      </header>
      <div className="flex flex-wrap gap-1.5">
        {!prototype.workflows.length && <p className="text-sm text-muted-foreground">{empty}</p>}
        {prototype.workflows.map((item) => (
          <Button
            key={item.name}
            size="sm"
            variant="outline"
            aria-pressed={item === workflow}
            onClick={() => prototype.select(item)}
            className="rounded-full font-mono text-xs aria-pressed:border-primary aria-pressed:bg-accent"
          >
            <item.icon />
            {item.name}
          </Button>
        ))}
      </div>
      {workflow && (
        <div className="grid gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            v{workflow.version} · {workflow.description}
            {workflow.triggers.map((trigger) => ` · ${trigger}`)}
          </p>
          <WorkflowForm
            key={workflow.name}
            workflow={workflow}
            inputs={session.inputs}
            close={prototype.close}
            compact
          />
        </div>
      )}
    </section>
  );
}

function WorkflowForm({
  workflow,
  inputs,
  close,
  compact,
}: {
  workflow: WorkflowExample;
  inputs?: Record<string, string>;
  close: () => void;
  compact?: boolean;
}) {
  const [values, setValues] = useState(() => inputs ?? {});
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState("");
  const [error, setError] = useState<SendError>();
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return runId ? (
    <div className="grid gap-3 rounded-md border bg-muted/50 p-3">
      <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
        <CheckCircle2 className="size-4" /> Workflow started{" "}
        <code className="text-xs text-muted-foreground">{runId}</code>
      </p>
      <Button className="justify-self-end" size="sm" variant="outline" onClick={close}>
        Done
      </Button>
    </div>
  ) : (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setError(undefined);
        setBusy(true);
        const failed = workflow.fields.some(({ name }) => values[name]?.toLowerCase().includes("fail"));
        timer.current = window.setTimeout(() => {
          setBusy(false);
          if (failed) {
            const stderrTail =
              workflow.name === "review-pr"
                ? "The payload does not fit workflow review-pr: Expected a number"
                : workflow.name === "land-stack"
                  ? "The payload does not fit workflow land-stack: Expected a list of PR numbers"
                  : "Workflows are off on this server. Turn them on in its Settings → Labs → Workflows";
            setError({ error: "Could not start workflow", exitCode: 1, stderrTail });
          } else {
            setRunId(`run-${crypto.randomUUID().slice(0, 8)}`);
          }
        }, 1000);
      }}
    >
      <fieldset disabled={busy} className={cn("grid gap-3", compact && "sm:grid-cols-2")}>
        {workflow.fields.map((field) => {
          const props = {
            id: `${id}-${field.name}`,
            value: values[field.name] ?? "",
            required: !field.optional,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
              setValues((current) => ({ ...current, [field.name]: e.target.value })),
          };
          return (
            <div key={field.name} className={cn("grid gap-1.5", compact && field.multiline && "sm:col-span-2")}>
              <label htmlFor={props.id} className="text-xs font-medium">
                {field.label}
                {field.optional && <span className="ml-1 text-muted-foreground">(optional)</span>}
              </label>
              {field.options ? (
                <select {...props} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                  <option value="" disabled>
                    Choose a method
                  </option>
                  {field.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : field.multiline ? (
                <Textarea {...props} rows={2} />
              ) : (
                <Input {...props} />
              )}
            </div>
          );
        })}
      </fieldset>
      {error && <SendErrorAlert err={error} />}
      <Button type="submit" size="sm" className="justify-self-end" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
        {busy ? "Starting…" : "Start workflow"}
      </Button>
    </form>
  );
}
