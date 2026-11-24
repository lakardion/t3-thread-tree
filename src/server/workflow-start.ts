/** The pure parts of Start workflow: the field scan, the list for the page and the CLI error check. */
import { type Field, FIELDS, type Workflow } from "../shared/workflow-start.ts";

/** The fields that each file names as `<name>:`, for each workflow of the file. Keys are workflow names. */
export function scanFields(files: { source: string; workflows: string[] }[]): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  for (const f of files) {
    const fields = FIELDS.filter((name) => new RegExp(`(?<![\\w$.])${name}\\s*\\??\\s*:`).test(f.source));
    for (const w of f.workflows) out.set(w.replace(/@[^@]*$/, ""), fields);
  }
  return out;
}

/** `fields` is null for a workflow that the scan does not cover, or when there is no scan. */
export const launchList = (
  summaries: { name: string; version: number; triggers: string[] }[],
  scan: Map<string, Field[]> | null,
): Workflow[] =>
  summaries.map((w) => ({
    ...w,
    fields: scan?.get(w.name) ?? null,
    webhookOnly: w.triggers.length > 0 && w.triggers.every((t) => t.startsWith("webhook")),
  }));

/** The CLI does not know the `workflow` command. */
export const oldCli = (stderr: string) => /unknown (sub)?command\W+workflow/i.test(stderr);
