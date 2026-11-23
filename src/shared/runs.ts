/** A T3 workflow item that waits for the user: the shape the backend pushes and the page renders. */
type Base = {
  /** Queue id: `q:<runId>:<name>` for a question, `p:<runId>` for a paused run. */
  id: string;
  runId: string;
  workflow: string;
  runTitle: string;
  /** The question title, or the run title. */
  title: string;
  /** The Catch-up line: the question title, or the first line of the failure. */
  line: string;
  /** Start of the Wait: `askedAt` or `updatedAt`. */
  since: string;
  /** The run page in the T3 web app. */
  href: string;
};

export type RunItem =
  | (Base & { kind: "question"; name: string; choices: string[]; threadHref: string | null })
  | (Base & { kind: "paused"; detail: string | null; retired: boolean });

/** Tells a run from a thread node. */
export const isRun = (x: object): x is RunItem => "runId" in x;
