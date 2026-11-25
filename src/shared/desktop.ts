import * as v from "valibot";

import { NEEDS_YOU, NOTIFY, OPEN_NEXT } from "./status.ts";

/** The Catch-up fields that cross the bridge. Unknown keys are dropped. */
export const CatchUpLine = v.optional(
  v.object({
    state: v.picklist(["queued", "running", "done", "failed"]),
    did: v.optional(v.string()),
    ask: v.optional(v.nullable(v.string())),
    options: v.optional(v.pipe(v.array(v.string()), v.maxLength(4))),
    question: v.optional(v.nullable(v.string())),
  }),
);

export type CatchUpLineData = v.InferOutput<typeof CatchUpLine>;

/** The ask with its options as "A or B?"; `ask` alone with no options. */
export const askText = (c: NonNullable<CatchUpLineData>): string =>
  c.options?.length ? `${c.ask} ${c.options.join(" or ")}?` : (c.ask ?? "");

/**
 * What a surface shows for a Catch-up. `ask` is set for a done call with an ask. `raw` is the raw question,
 * and `why` says why it shows, for a failed call or a done call with no ask. `null` for no Catch-up or one that is not finished.
 */
export function catchUpLines(c: CatchUpLineData): {
  ask: string | null;
  did: string | null;
  raw: string | null;
  why: "No clear ask" | "Catch-up failed" | null;
} | null {
  if (c?.state === "done" && c.ask) return { ask: askText(c), did: c.did ?? null, raw: null, why: null };
  if (c?.state === "done" || c?.state === "failed")
    return {
      ask: null,
      did: c.did ?? null,
      raw: c.question ?? null,
      why: c.state === "done" ? "No clear ask" : "Catch-up failed",
    };
  return null;
}

/** The bridge payload of `setNeedsYou`. Unknown keys are dropped. */
export const NeedsYouList = v.pipe(
  v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      environmentId: v.string(),
      since: v.nullable(v.string()),
      status: v.picklist([...NEEDS_YOU, "run-question", "paused-run"]),
      /** The page to open from the menu bar, for a run. A thread opens by `environmentId` and `id`. */
      url: v.optional(v.string()),
      catchUp: CatchUpLine,
    }),
  ),
  v.maxLength(500),
);

export type NeedsYouThread = v.InferOutput<typeof NeedsYouList>[number];

/** The bridge payload of `setOpenNext`: the title of the next thread, or `null` with none. */
export const OpenNextTitle = v.nullable(v.pipe(v.string(), v.maxLength(500)));

/** The bridge payload of `setUpNext`: the Open next queue, as the Up next window shows it. Unknown keys are dropped. */
export const UpNextList = v.object({
  rows: v.pipe(
    v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        status: v.picklist([...OPEN_NEXT, "run-question", "paused-run"]),
        phrase: v.string(),
        raw: v.string(),
        since: v.nullable(v.string()),
        project: v.string(),
        key: v.nullable(v.string()),
        linearUrl: v.nullable(v.string()),
        catchUp: CatchUpLine,
      }),
    ),
    v.maxLength(500),
  ),
  targetId: v.nullable(v.string()),
});

export type UpNext = v.InferOutput<typeof UpNextList>;
export type UpNextRow = UpNext["rows"][number];

/** The bridge payload of `notify`. Unknown keys are dropped. */
export const NotifyList = v.pipe(
  v.array(
    v.variant("kind", [
      v.object({
        kind: v.literal("thread"),
        threadId: v.string(),
        environmentId: v.string(),
        title: v.string(),
        status: v.picklist(NOTIFY),
        catchUp: CatchUpLine,
      }),
      v.object({
        kind: v.literal("run"),
        id: v.string(),
        status: v.picklist(["run-question", "paused-run"]),
        title: v.string(),
        url: v.string(),
      }),
      v.object({ kind: v.literal("summary"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    ]),
  ),
  v.maxLength(10),
);

export type NotifyEvent = v.InferOutput<typeof NotifyList>[number];
export type ThreadNotifyEvent = Extract<NotifyEvent, { kind: "thread" }>;
export type RunNotifyEvent = Extract<NotifyEvent, { kind: "run" }>;
export type NotifyStatus = ThreadNotifyEvent["status"];

/** The update state the main process keeps and sends to the page. */
export type UpdateState = {
  version: string;
  checking: boolean;
  /** Last time GitHub gave a reply that parses. */
  checkedAt: string | null;
  checkFailed: boolean;
  release: { version: string; canInstall: boolean } | null;
  install:
    | { stage: "downloading"; progress: number | null }
    | { stage: "unpacking" | "restarting" }
    | { stage: "failed"; error: string }
    | null;
};

export type DesktopBridge = {
  setNeedsYou(threads: NeedsYouThread[]): void;
  notify(events: NotifyEvent[]): void;
  /** Sends the title that the menu-bar "Open next" item shows; `null` hides the item. */
  setOpenNext(title: string | null): void;
  /** Returns a function that removes this listener only. */
  onOpenNext(cb: () => void): () => void;
  updateState(): Promise<UpdateState>;
  /** Returns a function that removes this listener only. */
  onUpdateState(cb: (state: UpdateState) => void): () => void;
  /** A silent check. It skips a check made less than 60 s ago unless `force` is true. */
  checkUpdates(force: boolean): void;
  installUpdate(): void;
  openRelease(): void;
  setUpNext(list: UpNext): void;
  /** Returns a function that removes this listener only. */
  onOpenThread(cb: (id: string) => void): () => void;
};

export type UpNextBridge = {
  /** The last list main holds; the window calls it once on load. */
  upNext(): Promise<UpNext>;
  /** Returns a function that removes this listener only. */
  onUpNext(cb: (list: UpNext) => void): () => void;
  openNext(): void;
  openThread(id: string): void;
  openLinear(url: string): void;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
    upNextBridge?: UpNextBridge;
  }
}
