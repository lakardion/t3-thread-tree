import * as v from "valibot";

/** The bridge payload of `setNeedsYou`. Unknown keys are dropped. */
export const NeedsYouList = v.pipe(
  v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      environmentId: v.string(),
      since: v.nullable(v.string()),
      status: v.picklist(["needs-input", "plan-ready"]),
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
        status: v.picklist(["needs-input", "plan-ready", "your-turn"]),
        phrase: v.string(),
        raw: v.string(),
        since: v.nullable(v.string()),
        project: v.string(),
        key: v.nullable(v.string()),
        linearUrl: v.nullable(v.string()),
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
        status: v.picklist(["needs-input", "plan-ready", "failed"]),
      }),
      v.object({ kind: v.literal("summary"), count: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    ]),
  ),
  v.maxLength(10),
);

export type NotifyEvent = v.InferOutput<typeof NotifyList>[number];
export type NotifyStatus = Extract<NotifyEvent, { kind: "thread" }>["status"];

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
