/** PROTOTYPE, throwaway.
 * D: Key/value table with one inline editor per workflow.
 * E: Overrides list with an inline menu for adding a setting.
 */
import { Pencil, Plus, X } from "lucide-react";
import { Fragment, useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Setting, Value, VariantProps, WorkflowSettings } from "./workflow-settings.prototype-data";

const HINT = "text-xs text-muted-foreground";
const CARD = "min-w-0 overflow-hidden rounded-lg border bg-background";

function fieldName(setting: Setting) {
  return setting.field === "extra-prompt" ? "Extra prompt" : setting.field;
}

function ValueText({ value }: { value: Value | undefined }) {
  const label =
    value === undefined
      ? "Default"
      : value === ""
        ? "Empty text"
        : typeof value === "boolean"
          ? value
            ? "On"
            : "Off"
          : String(value);
  return (
    <span className={cn("block truncate text-xs", value === undefined ? HINT : "text-status-working-fg")} title={label}>
      {label}
    </span>
  );
}

function CliSetting({ setting }: { setting: Setting }) {
  return (
    <div className="grid gap-1">
      <span className={HINT}>Edit with the CLI</span>
      <code className="block rounded bg-muted px-2 py-1 text-xs break-all select-all">
        {`t3 workflow store set ${setting.key} '<json>'`}
      </code>
    </div>
  );
}

function SettingEditor({
  setting,
  value,
  disabled,
  set,
  close,
}: {
  setting: Setting;
  value: Value | undefined;
  disabled: boolean;
  set: VariantProps["set"];
  close: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [checked, setChecked] = useState(value === true);
  const isPrompt = setting.field === "extra-prompt";
  const numeric = draft.trim() === "" ? NaN : Number(draft);
  const next = setting.type === "boolean" ? checked : setting.type === "number" ? numeric : draft;
  const canApply = !disabled && next !== value && !(typeof next === "number" && !Number.isFinite(next));

  return (
    <form
      aria-label={`Edit ${fieldName(setting)}`}
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canApply) return;
        set(setting.key, next);
        close();
      }}
    >
      <label htmlFor={id} className="text-xs font-medium">
        {fieldName(setting)}
      </label>
      {isPrompt ? (
        <Textarea
          id={id}
          value={draft}
          placeholder="Default"
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : setting.type === "boolean" ? (
        <div className="flex items-center gap-2">
          <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={setChecked} />
          <span className={HINT}>
            {checked ? "On" : "Off"}
            {value === undefined && " · Currently using default"}
          </span>
        </div>
      ) : (
        <Input
          id={id}
          className="h-8"
          type={setting.type === "number" ? "number" : "text"}
          step={setting.type === "number" ? "any" : undefined}
          value={draft}
          placeholder="Default"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {isPrompt && (
        <p id={`${id}-hint`} className={cn(HINT, "m-0")}>
          Adds one last agent step to the run.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-1">
        {value !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              set(setting.key, null);
              close();
            }}
          >
            Clear
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={close}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canApply}>
          {setting.type === "boolean" && value === undefined ? (checked ? "Set On" : "Set Off") : "Apply"}
        </Button>
      </div>
    </form>
  );
}

type WorkflowProps = { workflow: WorkflowSettings; p: VariantProps };

function KeyValueTable({ workflow, p }: WorkflowProps) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="grid min-w-0 gap-1.5">
      <h4 className={cn(HINT, "m-0 px-1 font-semibold")}>{workflow.title}</h4>
      <div className={CARD}>
        <table aria-label={workflow.title} className="w-full table-fixed border-collapse text-left">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-[45%] px-3 py-1.5 font-medium">
                Setting
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Value
              </th>
              <th scope="col" className="w-10">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {workflow.settings.map((setting) => {
              const value = p.values[setting.key];
              const cli = setting.type === "other";
              const open = !p.disabled && editing === setting.key;
              return (
                <Fragment key={setting.key}>
                  <tr className="border-b last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-[13px] font-normal wrap-break-word">
                      {fieldName(setting)}
                    </th>
                    {cli ? (
                      <td colSpan={2} className="py-2 pr-3">
                        <CliSetting setting={setting} />
                      </td>
                    ) : (
                      <>
                        <td className="py-2">
                          <ValueText value={value} />
                        </td>
                        <td className="py-1 pr-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${fieldName(setting)}`}
                            aria-expanded={open}
                            disabled={p.disabled}
                            onClick={() => setEditing(open ? null : setting.key)}
                          >
                            <Pencil />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                  {open && (
                    <tr className="border-b bg-muted/25 last:border-b-0">
                      <td colSpan={3} className="p-3">
                        <SettingEditor
                          setting={setting}
                          value={value}
                          disabled={p.disabled}
                          set={p.set}
                          close={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OverridesList({ workflow, p }: WorkflowProps) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const optionsId = useId();
  const editable = workflow.settings.filter((setting) => setting.type !== "other");
  const available = editable.filter((setting) => p.values[setting.key] === undefined);
  const saved = editable.filter((setting) => p.values[setting.key] !== undefined);
  const active = p.disabled ? undefined : editable.find((setting) => setting.key === editing);
  const showOptions = adding && !p.disabled && available.length > 0;

  return (
    <section className={cn(CARD, "divide-y")}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h4 className="m-0 text-[13px] font-medium wrap-break-word">{workflow.title}</h4>
        {available.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-expanded={showOptions}
            aria-controls={showOptions ? optionsId : undefined}
            disabled={p.disabled}
            onClick={() => {
              setAdding(!showOptions);
              setEditing(null);
            }}
          >
            <Plus /> Add setting
          </Button>
        )}
      </div>
      {showOptions && (
        <ul id={optionsId} className="m-0 grid list-none gap-0.5 bg-muted/25 p-2">
          {available.map((setting) => (
            <li key={setting.key}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-between"
                onClick={() => {
                  setAdding(false);
                  setEditing(setting.key);
                }}
              >
                {fieldName(setting)}
                <span className={HINT}>Default</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {active && (
        <div className="bg-muted/25 p-3">
          <SettingEditor
            key={active.key}
            setting={active}
            value={p.values[active.key]}
            disabled={p.disabled}
            set={p.set}
            close={() => setEditing(null)}
          />
        </div>
      )}
      {saved.length > 0 ? (
        <ul className="m-0 list-none divide-y p-0">
          {saved.map((setting) => (
            <li key={setting.key} className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                className="grid min-w-0 flex-1 gap-0.5 rounded text-left text-[13px] hover:text-primary focus-visible:outline-ring disabled:opacity-60"
                disabled={p.disabled}
                aria-label={`Edit ${fieldName(setting)}`}
                aria-expanded={active?.key === setting.key}
                onClick={() => {
                  setAdding(false);
                  setEditing(active?.key === setting.key ? null : setting.key);
                }}
              >
                <span className="wrap-break-word">{fieldName(setting)}</span>
                <ValueText value={p.values[setting.key]} />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Clear ${fieldName(setting)}`}
                title={`Clear ${fieldName(setting)}`}
                disabled={p.disabled}
                onClick={() => {
                  p.set(setting.key, null);
                  if (editing === setting.key) setEditing(null);
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn(HINT, "m-0 px-3 py-2")}>No overrides set.</p>
      )}
      {workflow.settings
        .filter((setting) => setting.type === "other")
        .map((setting) => (
          <div key={setting.key} className="grid gap-1 px-3 py-2">
            <span className="text-[13px]">{fieldName(setting)}</span>
            <CliSetting setting={setting} />
          </div>
        ))}
    </section>
  );
}

function WorkflowSection({ p, children }: { p: VariantProps; children: ReactNode }) {
  if (p.empty) return <p className={cn(HINT, "m-0 px-3 py-2.5")}>{p.empty.text}</p>;
  return (
    <section className="grid min-w-0 gap-2 px-3 py-2.5">
      <h3 className="m-0 text-[13px] font-medium">Workflows</h3>
      {p.disabled && <p className={cn(HINT, "m-0")}>The t3 CLI is missing.</p>}
      {children}
    </section>
  );
}

export function SolVariantD(p: VariantProps): ReactNode {
  return (
    <WorkflowSection p={p}>
      {p.workflows
        .filter((workflow) => workflow.settings.length > 0)
        .map((workflow) => (
          <KeyValueTable key={workflow.workflow} workflow={workflow} p={p} />
        ))}
    </WorkflowSection>
  );
}

export function SolVariantE(p: VariantProps): ReactNode {
  return (
    <WorkflowSection p={p}>
      {p.workflows
        .filter((workflow) => workflow.settings.length > 0)
        .map((workflow) => (
          <OverridesList key={workflow.workflow} workflow={workflow} p={p} />
        ))}
    </WorkflowSection>
  );
}

export const SOL_VARIANTS: { key: string; name: string; C: (p: VariantProps) => ReactNode }[] = [
  { key: "D", name: "Key/value table", C: SolVariantD },
  { key: "E", name: "Overrides list", C: SolVariantE },
];
