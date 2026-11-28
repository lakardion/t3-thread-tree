/** The types and key of the Start workflow feature. */

/** Payload fields that the app can fill from a start point. */
export const FIELDS = ["threadId", "pr", "stack", "threadIds", "project", "text"] as const;

export type Field = (typeof FIELDS)[number];

export type SettingType = "string" | "number" | "boolean" | "other";

/** A value that a workflow reads from the T3 store under `settings/<workflow>/`. Only the first three types are editable. */
export type Setting = { key: string; field: string; type: SettingType };

/** `fields`: the fields that the workflow file names. `settings`: its settings. Both are null when the files are not scanned. */
export type Workflow = {
  name: string;
  version: number;
  triggers: string[];
  fields: Field[] | null;
  settings: Setting[] | null;
  /** Every trigger is a webhook, so nobody starts it by hand. */
  webhookOnly: boolean;
};

/** One start key per dialog: T3 returns the same run for a repeated key. */
export const startKey = (workflow: string, context: string, openedAt: number) => `${workflow}/${context}/${openedAt}`;
