/**
 * PROTOTYPE, throwaway. Fake data and an in-memory store for the Workflows fold variants.
 * `?wse=off` shows "Workflows off", `?wse=scan` the scan error, `?wse=none` no workflow with settings.
 */
import { useState } from "react";

export type SettingType = "string" | "number" | "boolean" | "other";
export type Setting = { key: string; field: string; type: SettingType };
export type WorkflowSettings = { workflow: string; title: string; settings: Setting[] };
export type Value = string | number | boolean;

/** What a variant gets. `set(key, null)` clears the key (the workflow default applies again). */
export type VariantProps = {
  workflows: WorkflowSettings[];
  values: Record<string, Value>;
  set: (key: string, value: Value | null) => void;
  /** Null, or the empty-state text to show instead of the workflows. */
  empty: { kind: "off" | "scan" | "none"; text: string } | null;
  /** The `t3` CLI is missing: every control is disabled. */
  disabled: boolean;
};

export const WORKFLOWS: WorkflowSettings[] = [
  {
    workflow: "digest",
    title: "Morning digest",
    settings: [
      { key: "settings/digest/time", field: "time", type: "string" },
      { key: "settings/digest/limit", field: "limit", type: "number" },
      { key: "settings/digest/weekends", field: "weekends", type: "boolean" },
      { key: "settings/digest/extra-prompt", field: "extra-prompt", type: "string" },
    ],
  },
  {
    workflow: "review-pr",
    title: "Review a PR",
    settings: [
      { key: "settings/review-pr/rules", field: "rules", type: "other" },
      { key: "settings/review-pr/extra-prompt", field: "extra-prompt", type: "string" },
    ],
  },
];

const EMPTY = {
  off: "Turn on Workflows in T3 Settings → Labs, or add a workflow file.",
  scan: "The app cannot read the workflow files (missing scope: filesystem:read). Give the token the filesystem:read scope.",
  none: "No workflow reads settings yet.",
} as const;

export function useProtoSettings(): VariantProps {
  const params = new URLSearchParams(location.search);
  const e = params.get("wse") as keyof typeof EMPTY | null;
  const [values, setValues] = useState<Record<string, Value>>({
    "settings/digest/time": "08:30",
    "settings/digest/extra-prompt": "Also list PRs that wait on my review.",
  });
  return {
    workflows: e ? [] : WORKFLOWS,
    values,
    set: (key, value) =>
      setValues((v) => {
        const next = { ...v };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      }),
    empty: e && e in EMPTY ? { kind: e, text: EMPTY[e] } : null,
    disabled: params.get("wsc") === "off",
  };
}
