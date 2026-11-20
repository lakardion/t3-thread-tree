import type { ModelPick, Offered } from "../shared/model.ts";

/** The value and tone of the Catch-up fold: no model, else nothing while the switch is off, else the label of the effective pick, else Off. */
export function foldValue(
  clis: Offered | null,
  pick: ModelPick | undefined,
  on: boolean | undefined,
): { text: string; tone: "ok" | "warn" | "none" } {
  if (!clis) return { text: "Checking…", tone: "none" };
  if (clis.length === 0) return { text: "No model", tone: "warn" };
  if (on !== true) return { text: "", tone: "none" };
  const label = clis.find((c) => c.id === pick)?.label;
  return label ? { text: label, tone: "ok" } : { text: "Off", tone: "none" };
}

/** The saved pick when offered, else the first offered pick that is not `local` or `apple`. */
export function effectivePick(clis: Offered | null, saved: ModelPick | null | undefined): ModelPick | undefined {
  return clis?.find((c) => c.id === saved)?.id ?? clis?.find((c) => c.id !== "local" && c.id !== "apple")?.id;
}

/** The `PUT /model-pick` body for the switch. With no saved pick, turning on also saves the effective pick, else the first offered model. */
export function switchBody(
  on: boolean,
  saved: ModelPick | null | undefined,
  pick: ModelPick | undefined,
  clis: Offered,
): { catchUp: boolean; pick?: ModelPick } {
  const first = pick ?? clis[0]?.id;
  return on && saved === null && first ? { catchUp: on, pick: first } : { catchUp: on };
}
