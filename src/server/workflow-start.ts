/** The pure parts of Start workflow: the field scan, the list for the page and the CLI error check. */
import { type Field, FIELDS, type Setting, type SettingType, type Workflow } from "../shared/workflow-start.ts";

/** The fields that each file names as `<name>:`, for each workflow of the file. Keys are workflow names. */
export function scanFields(files: { source: string; workflows: string[] }[]): Map<string, Field[]> {
  const out = new Map<string, Field[]>();
  for (const f of files) {
    const fields = FIELDS.filter((name) => new RegExp(`(?<![\\w$.])${name}\\s*\\??\\s*:`).test(f.source));
    for (const w of f.workflows) out.set(w.replace(/@[^@]*$/, ""), fields);
  }
  return out;
}

const ENTRY = /store\.entry\(\s*(?:"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\$]*)`)\s*,\s*Schema\.(\w+)/g;

/**
 * The settings of each workflow: `store.entry("settings/<workflow>/<field>", Schema.<Type>)` with a literal key, in a
 * file of that workflow. Any type but String, Number and Boolean is `other`. Keys are workflow names.
 */
export function scanSettings(files: { source: string; workflows: string[] }[]): Map<string, Setting[]> {
  const out = new Map<string, Setting[]>();
  for (const f of files) {
    const entries = [...f.source.matchAll(ENTRY)].map((m) => ({
      key: m[1] ?? m[2] ?? m[3],
      type: m[4].toLowerCase(),
    }));
    for (const w of f.workflows) {
      const name = w.replace(/@[^@]*$/, "");
      const prefix = `settings/${name}/`;
      const found = new Map<string, Setting>();
      for (const e of entries) {
        if (!e.key.startsWith(prefix) || e.key.length === prefix.length) continue;
        const type: SettingType = e.type === "string" || e.type === "number" || e.type === "boolean" ? e.type : "other";
        if (!found.has(e.key)) found.set(e.key, { key: e.key, field: e.key.slice(prefix.length), type });
      }
      out.set(name, [...found.values()]);
    }
  }
  return out;
}

/** The type of a scanned key, or null when the key is not in the scan. */
export const settingType = (scan: Map<string, Setting[]> | null, key: string): SettingType | null => {
  for (const list of scan?.values() ?? []) for (const s of list) if (s.key === key) return s.type;
  return null;
};

/** `fields` and `settings` are null for a workflow that the scan does not cover, or when there is no scan. */
export const launchList = (
  summaries: { name: string; version: number; triggers: string[] }[],
  scan: Map<string, Field[]> | null,
  settingScan: Map<string, Setting[]> | null = null,
): Workflow[] =>
  summaries.map((w) => ({
    ...w,
    fields: scan?.get(w.name) ?? null,
    settings: settingScan?.get(w.name) ?? null,
    webhookOnly: w.triggers.length > 0 && w.triggers.every((t) => t.startsWith("webhook")),
  }));

/** The CLI does not know the `workflow` command. */
export const oldCli = (stderr: string) => /unknown (sub)?command\W+workflow/i.test(stderr);
