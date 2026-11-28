import { ChevronDown, Play, Workflow as WorkflowIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

import type { CliStatus } from "../shared/send.ts";
import { type Field, FIELDS, startKey, type Workflow } from "../shared/workflow-start.ts";
import { MAC } from "./find.tsx";
import { ActionDialog, ActionForm, CliGate } from "./send-dialog.tsx";
import { postWorkflowStart } from "./send.ts";
import { contextOf, fillOf, fits, payloadOf, prText, type StartPoint, type Values } from "./workflow-start.ts";

/** One start: the workflow, where it starts from, and what the start point adds to the dialog. */
export type StartRequest = {
  workflow: Workflow;
  point: StartPoint;
  /** The T3 project path of the start point. */
  project?: string;
  /** The title of the thread that started it. */
  forTitle?: string;
};

/** The workflows that the server offers and the opener of the start dialog. */
export const WorkflowStarter = createContext<{
  workflows: Workflow[];
  t3cli: CliStatus | null;
  open: (req: StartRequest) => void;
}>({ workflows: [], t3cli: null, open: () => {} });

const LABEL: Record<Field, string> = {
  threadId: "Thread",
  pr: "PR",
  stack: "PR stack",
  threadIds: "Threads",
  project: "Project",
  text: "Text",
};
const HINT: Partial<Record<Field, string>> = {
  threadId: "Thread id",
  pr: "owner/name#123",
  stack: "owner/name #1 #2",
  threadIds: "id, id, …",
  project: "Project path",
};
const MONO: Field[] = ["pr", "stack", "threadIds", "project"];

/**
 * A button with a menu of the workflows that fit the point. Nothing shows when none fits or `point` is null.
 * `label` makes it a text button. `disabled` turns it off. `onPick` runs before the dialog opens.
 */
export function StartMenu({
  point,
  project,
  forTitle,
  className,
  label,
  disabled,
  onPick,
}: {
  point: StartPoint | null;
  project?: string;
  forTitle?: string;
  className?: string;
  label?: string;
  disabled?: boolean;
  onPick?: () => void;
}) {
  const { workflows, t3cli, open } = useContext(WorkflowStarter);
  const fit = point ? workflows.filter((w) => fits(w, point)) : [];
  if (!point || fit.length === 0) return null;
  return (
    <CliGate t3cli={t3cli}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={label ? "outline" : "quiet"}
            size={label ? "sm" : "icon"}
            className={className}
            aria-label="Start a workflow"
            title="Start a workflow"
            disabled={disabled || t3cli?.available === false}
          >
            <WorkflowIcon className="size-3.5" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel variant="meta">Start a workflow</DropdownMenuLabel>
          {fit.map((w) => (
            <DropdownMenuItem
              key={w.name}
              onSelect={() => {
                onPick?.();
                open({ workflow: w, point, project, forTitle });
              }}
            >
              <WorkflowIcon />
              <span className="font-mono text-[12px]">{w.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </CliGate>
  );
}

/** Mounted only while open, so each open starts from the fill and gets a new start key. */
function StartForm({ req, onStarted }: { req: StartRequest; onStarted: (runId: string) => void }) {
  const { workflow, point } = req;
  const fields = workflow.fields ?? FIELDS;
  const fill = fillOf(point, req.project);
  const [values, setValues] = useState<Values>(() => Object.fromEntries(fields.map((f) => [f, fill[f] ?? ""])));
  /** Null while untouched: the box then follows the fields. */
  const [json, setJson] = useState<string | null>(null);
  const [openedAt] = useState(Date.now);
  const built = payloadOf(fields, values);
  const edited = json !== null;
  let payload: Record<string, unknown> | null = built.ok ? built.payload : null;
  let jsonError: string | null = null;
  if (edited) {
    try {
      const v: unknown = JSON.parse(json);
      if (v && typeof v === "object" && !Array.isArray(v)) payload = v as Record<string, unknown>;
      else jsonError = "The payload must be a JSON object.";
    } catch (e) {
      jsonError = (e as Error).message;
    }
    if (jsonError) payload = null;
  }
  const errors = built.ok ? {} : built.errors;
  const prs = point.kind === "row" ? point.prs : [];
  const set = (f: Field, v: string) => setValues((s) => ({ ...s, [f]: v }));
  const control = (f: Field) => {
    const id = `wf-${f}`;
    if (f === "text") return <Textarea id={id} rows={4} value={values.text} onChange={(e) => set(f, e.target.value)} />;
    if (f === "pr" && prs.length > 1)
      return (
        <Select value={values.pr} onValueChange={(v) => set(f, v)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {prs.map((c) => (
              <SelectItem key={c.n} value={prText(c)}>
                #{c.n} {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    return (
      <Input
        id={id}
        placeholder={HINT[f]}
        className={cn(MONO.includes(f) && "font-mono")}
        value={values[f]}
        onChange={(e) => set(f, e.target.value)}
      />
    );
  };
  return (
    <ActionForm
      title={
        <span className="flex items-center gap-2">
          <WorkflowIcon className="size-4" />
          <span className="font-mono">{workflow.name}</span>
        </span>
      }
      description={
        <>
          Starts <span className="font-mono">{workflow.name}</span> v{workflow.version} on this server.
        </>
      }
      label="Start"
      busyLabel="Starting"
      hint={MAC ? "⌘↵" : "Ctrl+↵"}
      icon={<Play />}
      ready={payload !== null}
      run={async () => {
        const r = await postWorkflowStart(
          workflow.name,
          payload!,
          startKey(workflow.name, contextOf(point, workflow, payload ?? undefined), openedAt),
        );
        if (r.ok) onStarted(r.runId);
        return r;
      }}
    >
      {req.forTitle && (
        <div className="truncate rounded-[6px] bg-muted px-2 py-1 text-[12px] text-muted-foreground">
          For <span className="text-foreground">{req.forTitle}</span>
        </div>
      )}
      <fieldset disabled={edited} className="grid gap-3">
        {fields.map((f) => (
          <div key={f} className="grid gap-1.5">
            <Label htmlFor={`wf-${f}`}>
              {LABEL[f]}
              {fill[f] && values[f] === fill[f] && (
                <span className="font-normal text-muted-foreground">· from the row</span>
              )}
            </Label>
            {control(f)}
            {errors[f] && <p className="m-0 text-xs text-status-failed">{errors[f]}</p>}
          </div>
        ))}
      </fieldset>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="quiet" size="xs" className="group -ml-2">
            <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
            Advanced
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-1.5 pt-1.5">
          <Textarea
            aria-label="Payload (JSON)"
            rows={6}
            className="font-mono"
            value={json ?? (built.ok ? JSON.stringify(built.payload, null, 2) : "")}
            onChange={(e) => setJson(e.target.value)}
          />
          <p className="m-0 text-xs text-muted-foreground">
            {jsonError ??
              (edited
                ? "This text is the payload. The fields above are off."
                : "Edit this text to set the payload by hand.")}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </ActionForm>
  );
}

/** `req` stays set while the dialog closes, so the content does not vanish during the exit. */
export function StartDialog({
  req,
  open,
  onOpenChange,
  onStarted,
}: {
  req: StartRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (workflow: string, runId: string) => void;
}) {
  return (
    <ActionDialog open={open} onOpenChange={onOpenChange}>
      {req && <StartForm req={req} onStarted={(runId) => onStarted(req.workflow.name, runId)} />}
    </ActionDialog>
  );
}

/**
 * "Started <workflow> · Show in tree" for 10 s. A new run has no row until it has a step thread, so then the
 * button opens the run page in T3.
 */
export function StartedToast({
  name,
  runId,
  origin,
  reveal,
  onClose,
}: {
  name: string;
  runId: string;
  origin: string | null;
  reveal: (id: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current(), 10_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-md"
    >
      <span>
        Started <span className="font-mono">{name}</span> ·
      </span>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          void reveal(`run:${runId}`).then((found) => {
            if (!found && origin) window.open(`${origin}/workflows?run=${encodeURIComponent(runId)}`, "_blank");
          });
          onClose();
        }}
      >
        Show in tree
      </Button>
    </div>
  );
}
