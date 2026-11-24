/** The types and key of the Start workflow feature. */

/** Payload fields that the app can fill from a start point. */
export const FIELDS = ["threadId", "pr", "stack", "threadIds", "project", "text"] as const;

export type Field = (typeof FIELDS)[number];

/** `fields`: the fields that the workflow file names. Null when the files are not scanned. */
export type Workflow = {
  name: string;
  version: number;
  triggers: string[];
  fields: Field[] | null;
  /** Every trigger is a webhook, so nobody starts it by hand. */
  webhookOnly: boolean;
};

/** One start key per dialog: T3 returns the same run for a repeated key. */
export const startKey = (workflow: string, context: string, openedAt: number) => `${workflow}/${context}/${openedAt}`;
