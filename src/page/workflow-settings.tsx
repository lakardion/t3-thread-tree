/** The Workflows group in Settings: one fold per workflow that reads settings from the T3 store. */
import { Terminal, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { CliStatus, SendError, StoreValue } from "../shared/send.ts";
import type { Setting, Workflow } from "../shared/workflow-start.ts";
import { postSetting } from "./send.ts";
import { Fold, HINT, SettingsGroup } from "./settings-ui.tsx";

type Values = Record<string, unknown>;
type Draft = Record<string, string | boolean | undefined>;

const NO_VALUES: Values = {};

/** The field in sentence case: `extra-prompt` is "Extra prompt". */
export const label = (field: string) => {
  const text = field.replaceAll("-", " ");
  return text[0].toUpperCase() + text.slice(1);
};

const initial = (settings: Setting[], values: Values): Draft =>
  Object.fromEntries(
    settings.map((s) => {
      const v = values[s.key];
      return [s.key, v === undefined || typeof v === "boolean" ? v : typeof v === "string" ? v : JSON.stringify(v)];
    }),
  );

/** The writes that make the stored values match the draft. An empty field deletes its key (value null). */
export function changes(settings: Setting[], draft: Draft, values: Values) {
  const out: { key: string; value: string | number | boolean | null }[] = [];
  for (const s of settings) {
    if (s.type === "other") continue;
    const d = draft[s.key];
    const next = d === undefined || d === "" ? null : s.type === "number" ? Number(d) : d;
    if (next === null ? s.key in values : next !== values[s.key]) out.push({ key: s.key, value: next });
  }
  return out;
}

type Loaded = { values: Values | null; error: string | null };

async function load(): Promise<Loaded> {
  try {
    const r = await fetch("/t3/workflows/settings");
    if (!r.ok) {
      const err = (await r.json().catch(() => null)) as SendError | null;
      return { values: null, error: err?.error ?? `HTTP ${r.status}` };
    }
    const list = (await r.json()) as StoreValue[];
    return { values: Object.fromEntries(list.map((v) => [v.key, v.value])), error: null };
  } catch {
    return { values: null, error: "The server did not answer." };
  }
}

function WorkflowForm({
  w,
  settings,
  values,
  disabled,
  reload,
}: {
  w: Workflow;
  settings: Setting[];
  values: Values;
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => initial(settings, values));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seen, setSeen] = useState(values);
  if (seen !== values) {
    setSeen(values);
    const fresh = initial(settings, values);
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(fresh)) if (values[k] !== seen[k]) next[k] = fresh[k];
      return next;
    });
  }
  const pending = changes(settings, draft, values);
  const set = (key: string, v: string | boolean | undefined) => setDraft((d) => ({ ...d, [key]: v }));
  const n = settings.filter((s) => s.key in values).length;

  async function save() {
    setSaving(true);
    setError(null);
    for (const c of pending) {
      const r = await postSetting(c.key, c.value);
      if (!r.ok) {
        setError(r.err.error);
        break;
      }
    }
    await reload();
    setSaving(false);
  }

  return (
    <Fold label={w.name} value={n ? `${n} of ${settings.length} set` : "Defaults"} tone={n ? "ok" : "none"}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {settings.map((s) => {
          const d = draft[s.key];
          const id = `setting-${s.key}`;
          return (
            <div key={s.key} className="grid gap-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={id} className="text-xs">
                  {label(s.field)}
                </Label>
                {d !== undefined && d !== "" && s.type !== "other" && (
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-[11px] text-muted-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => set(s.key, undefined)}
                  >
                    Use default
                  </button>
                )}
              </div>
              {s.type === "other" ? (
                <code className="flex items-center gap-1 rounded-[6px] bg-muted px-2 py-1 text-[11px] break-all">
                  <Terminal className="size-3 shrink-0" />
                  t3 workflow store set {s.key} '…'
                </code>
              ) : s.type === "boolean" ? (
                <Switch id={id} checked={d === true} disabled={disabled} onCheckedChange={(c) => set(s.key, c)} />
              ) : s.field === "extra-prompt" ? (
                <>
                  <Textarea
                    id={id}
                    rows={3}
                    placeholder="None"
                    value={String(d ?? "")}
                    disabled={disabled}
                    onChange={(e) => set(s.key, e.target.value)}
                    className="text-[13px]"
                  />
                  <p className={cn(HINT, "m-0")}>Adds one last agent step to each run.</p>
                </>
              ) : (
                <Input
                  id={id}
                  type={s.type === "number" ? "number" : "text"}
                  placeholder="Default"
                  value={String(d ?? "")}
                  disabled={disabled}
                  onChange={(e) => set(s.key, e.target.value)}
                  className="h-8 text-[13px]"
                />
              )}
            </div>
          );
        })}
        {error && <p className={cn(HINT, "m-0 text-destructive")}>{error}</p>}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!pending.length || disabled || saving}>
            Save
          </Button>
        </div>
      </form>
    </Fold>
  );
}

/** Mounts with the panel. Loads the stored values at once and after each Save. */
export function WorkflowSettings({
  workflows,
  scanError,
  scopeHint,
  t3cli,
}: {
  workflows: Workflow[] | null | undefined;
  scanError: string | null | undefined;
  scopeHint: string;
  t3cli: CliStatus | null;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ values: null, error: null });
  const { values, error: loadError } = loaded;
  const withSettings = (workflows ?? []).filter((w) => w.settings?.length);
  const off = t3cli?.available === false;
  const wanted = t3cli?.available === true && withSettings.length > 0;
  const reload = () => load().then(setLoaded);
  useEffect(() => {
    if (wanted) void load().then(setLoaded);
  }, [wanted]);

  const empty = scanError
    ? `Workflow settings are not available: the app cannot read the workflow files (${scanError}).${scopeHint}`
    : !workflows?.length
      ? "Turn on Workflows in T3 Settings → Labs, or add a workflow file."
      : !withSettings.length
        ? "No workflow reads settings yet."
        : off
          ? "Install the t3 CLI to edit workflow settings."
          : null;

  return (
    <SettingsGroup title="Workflows">
      {empty !== null || loadError ? (
        <p className={cn(HINT, "m-0 flex gap-1.5 px-3 py-2.5")}>
          {scanError && <TriangleAlert className="size-3.5 shrink-0 text-status-needs-input-fg" />}
          {empty ?? loadError}
        </p>
      ) : null}
      {!scanError &&
        withSettings.map((w) => (
          <WorkflowForm
            key={w.name}
            w={w}
            settings={w.settings ?? []}
            values={values ?? NO_VALUES}
            disabled={off || values === null}
            reload={reload}
          />
        ))}
    </SettingsGroup>
  );
}
