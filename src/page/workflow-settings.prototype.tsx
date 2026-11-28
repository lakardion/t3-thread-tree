/**
 * PROTOTYPE, throwaway. Looks for the Workflows fold in Settings, switched by `?variant=`:
 * A: one "Workflows" fold in Setup; a heading per workflow, label-left/control-right rows, save on blur.
 * B: a "Workflows" group with one fold per workflow; stacked form, one Save button per workflow.
 * C: one "Workflows" fold with a workflow picker at the top and the picked workflow's settings below.
 * D+: variants from the Sol agent (workflow-settings.sol.prototype.tsx).
 * `?wse=off|scan|none` shows the empty states, `?wsc=off` the disabled state (no `t3` CLI).
 */
import { ChevronLeft, ChevronRight, RotateCcw, Terminal, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { Fold, Row, SettingsGroup } from "./app.tsx";
import { SOL_VARIANTS } from "./workflow-settings.sol.prototype.tsx";
import { type Setting, useProtoSettings, type Value, type VariantProps } from "./workflow-settings.prototype-data.ts";

const HINT = "text-xs text-muted-foreground";
const label = (field: string) => (field === "extra-prompt" ? "Extra prompt" : field[0]!.toUpperCase() + field.slice(1));
const countSet = (p: VariantProps, s: Setting[]) => s.filter((x) => x.key in p.values).length;

const Empty = ({ p }: { p: VariantProps }) =>
  p.empty && (
    <p className={cn(HINT, "m-0 flex gap-1.5")}>
      {p.empty.kind === "scan" && <TriangleAlert className="size-3.5 shrink-0 text-status-needs-input-fg" />}
      {p.empty.text}
    </p>
  );
const NoCli = ({ p }: { p: VariantProps }) =>
  p.disabled && <p className={cn(HINT, "m-0")}>Install the t3 CLI to edit workflow settings.</p>;

const ClearButton = ({ p, k }: { p: VariantProps; k: string }) =>
  k in p.values ? (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Use the default"
      title="Use the default"
      disabled={p.disabled}
      onClick={() => p.set(k, null)}
    >
      <RotateCcw />
    </Button>
  ) : null;

const CliHint = ({ k }: { k: string }) => (
  <code className="flex items-center gap-1 rounded-[6px] bg-muted px-2 py-1 text-[11px] break-all">
    <Terminal className="size-3 shrink-0" />
    t3 workflow store set {k} '…'
  </code>
);

/** One control that saves on blur (text, number) or at once (switch). */
function Control({ p, s, wide }: { p: VariantProps; s: Setting; wide?: boolean }) {
  const v = p.values[s.key];
  const [draft, setDraft] = useState(v === undefined ? "" : String(v));
  useEffect(() => setDraft(v === undefined ? "" : String(v)), [v]);
  const commit = () => {
    if (draft === "") return v !== undefined && p.set(s.key, null);
    p.set(s.key, s.type === "number" ? Number(draft) : draft);
  };
  if (s.type === "other") return <CliHint k={s.key} />;
  if (s.type === "boolean")
    return <Switch checked={v === true} disabled={p.disabled} onCheckedChange={(c) => p.set(s.key, c)} />;
  if (s.field === "extra-prompt")
    return (
      <Textarea
        rows={3}
        placeholder="None. Text here adds one last agent step to each run."
        value={draft}
        disabled={p.disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="text-[13px]"
      />
    );
  return (
    <Input
      type={s.type === "number" ? "number" : "text"}
      placeholder="Default"
      value={draft}
      disabled={p.disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn("h-8 text-[13px]", !wide && "w-32")}
    />
  );
}

/** A: one fold, headed sections, rows like the View group. */
function VariantA(p: VariantProps) {
  const total = p.workflows.reduce((n, w) => n + countSet(p, w.settings), 0);
  return (
    <SettingsGroup title="Setup">
      <Fold
        label="Workflows"
        value={p.empty ? (p.empty.kind === "off" ? "Off" : p.empty.kind === "scan" ? "Cannot read" : "None") : `${total} set`}
        tone={p.empty?.kind === "scan" ? "warn" : p.empty ? "none" : "ok"}
        defaultOpen
      >
        <div className="grid gap-3">
          <Empty p={p} />
          <NoCli p={p} />
          {p.workflows.map((w) => (
            <section key={w.workflow} className="grid gap-1">
              <h4 className="m-0 text-xs font-semibold">
                {w.title} <span className="font-normal text-muted-foreground">{w.workflow}</span>
              </h4>
              <div className="divide-y rounded-md border">
                {w.settings.map((s) =>
                  s.field === "extra-prompt" ? (
                    <div key={s.key} className="grid gap-1.5 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[13px] font-normal">Extra prompt</Label>
                        <ClearButton p={p} k={s.key} />
                      </div>
                      <Control p={p} s={s} wide />
                    </div>
                  ) : (
                    <Row key={s.key} label={label(s.field)} hint={s.type === "other" ? "Edit with the CLI" : undefined}>
                      <span className="flex items-center gap-1">
                        <ClearButton p={p} k={s.key} />
                        <Control p={p} s={s} />
                      </span>
                    </Row>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </Fold>
    </SettingsGroup>
  );
}

/** B: own group, a fold per workflow, explicit Save. */
function VariantB(p: VariantProps) {
  return (
    <SettingsGroup title="Workflows">
      {p.empty || p.disabled ? (
        <div className="px-3 py-2.5">
          <Empty p={p} />
          <NoCli p={p} />
        </div>
      ) : null}
      {p.workflows.map((w) => (
        <WorkflowForm key={w.workflow} p={p} w={w} />
      ))}
    </SettingsGroup>
  );
}
function WorkflowForm({ p, w }: { p: VariantProps; w: VariantProps["workflows"][number] }) {
  const init = () => Object.fromEntries(w.settings.map((s) => [s.key, p.values[s.key]]));
  const [draft, setDraft] = useState<Record<string, Value | undefined>>(init);
  const dirty = w.settings.some((s) => draft[s.key] !== p.values[s.key]);
  const n = countSet(p, w.settings);
  return (
    <Fold label={w.title} value={n ? `${n} of ${w.settings.length} set` : "Defaults"} tone={n ? "ok" : "none"}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          for (const s of w.settings) {
            const v = draft[s.key];
            if (v !== p.values[s.key]) p.set(s.key, v === undefined || v === "" ? null : v);
          }
        }}
      >
        {w.settings.map((s) => (
          <div key={s.key} className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">{label(s.field)}</Label>
              {draft[s.key] !== undefined && s.type !== "other" && (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground hover:underline"
                  onClick={() => setDraft((d) => ({ ...d, [s.key]: undefined }))}
                >
                  Use default
                </button>
              )}
            </div>
            {s.type === "other" ? (
              <CliHint k={s.key} />
            ) : s.type === "boolean" ? (
              <Switch
                checked={draft[s.key] === true}
                disabled={p.disabled}
                onCheckedChange={(c) => setDraft((d) => ({ ...d, [s.key]: c }))}
              />
            ) : s.field === "extra-prompt" ? (
              <Textarea
                rows={3}
                placeholder="None"
                value={String(draft[s.key] ?? "")}
                disabled={p.disabled}
                onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                className="text-[13px]"
              />
            ) : (
              <Input
                type={s.type === "number" ? "number" : "text"}
                placeholder="Default"
                value={String(draft[s.key] ?? "")}
                disabled={p.disabled}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [s.key]: s.type === "number" && e.target.value ? Number(e.target.value) : e.target.value }))
                }
                className="h-8 text-[13px]"
              />
            )}
            {s.field === "extra-prompt" && <p className={cn(HINT, "m-0")}>Adds one last agent step to each run.</p>}
          </div>
        ))}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!dirty || p.disabled}>
            Save
          </Button>
        </div>
      </form>
    </Fold>
  );
}

/** C: one fold, pick a workflow, see only its settings. */
function VariantC(p: VariantProps) {
  const [pick, setPick] = useState(p.workflows[0]?.workflow ?? "");
  const w = p.workflows.find((x) => x.workflow === pick);
  return (
    <SettingsGroup title="Setup">
      <Fold label="Workflows" value={p.empty ? "—" : `${p.workflows.length} with settings`} tone="none" defaultOpen>
        <div className="grid gap-2">
          <Empty p={p} />
          <NoCli p={p} />
          {p.workflows.length > 0 && (
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {p.workflows.map((x) => (
                  <SelectItem key={x.workflow} value={x.workflow}>
                    {x.title} · {countSet(p, x.settings)} set
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {w?.settings.map((s) => (
            <div key={s.key} className="grid gap-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {label(s.field)}
                  {!(s.key in p.values) && s.type !== "other" && <span className="ml-1 text-muted-foreground">· default</span>}
                </Label>
                <ClearButton p={p} k={s.key} />
              </div>
              <Control p={p} s={s} wide />
            </div>
          ))}
        </div>
      </Fold>
    </SettingsGroup>
  );
}

const VARIANTS: { key: string; name: string; C: (p: VariantProps) => ReactNode }[] = [
  { key: "A", name: "One fold, rows", C: VariantA },
  { key: "B", name: "Fold per workflow, Save", C: VariantB },
  { key: "C", name: "Workflow picker", C: VariantC },
  ...SOL_VARIANTS,
];

/** Mounted in the Settings panel: the current variant plus the floating switcher. */
export function WorkflowSettingsProto() {
  const p = useProtoSettings();
  const [key, setKey] = useState(() => new URLSearchParams(location.search).get("variant") ?? "A");
  const i = Math.max(0, VARIANTS.findIndex((v) => v.key === key));
  const go = (d: number) => {
    const next = VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length]!.key;
    const u = new URL(location.href);
    u.searchParams.set("variant", next);
    history.replaceState(null, "", u);
    setKey(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable], [role=combobox]")) return;
      if (e.key === "ArrowLeft" && e.altKey) go(-1);
      if (e.key === "ArrowRight" && e.altKey) go(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const V = VARIANTS[i]!;
  return (
    <>
      <V.C key={V.key} {...p} />
      <pre className="m-0 max-h-32 overflow-auto rounded-md bg-muted p-2 text-[10px]">
        {JSON.stringify(p.values, null, 1)}
      </pre>
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-background shadow-lg">
        <button aria-label="Previous variant" onClick={() => go(-1)} className="p-1">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-medium">
          {V.key} ({V.name}) · Alt+←/→
        </span>
        <button aria-label="Next variant" onClick={() => go(1)} className="p-1">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </>
  );
}
