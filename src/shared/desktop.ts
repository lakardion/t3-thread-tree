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
  updateState(): Promise<UpdateState>;
  /** Returns a function that removes this listener only. */
  onUpdateState(cb: (state: UpdateState) => void): () => void;
  /** A silent check. It skips a check made less than 60 s ago unless `force` is true. */
  checkUpdates(force: boolean): void;
  installUpdate(): void;
  openRelease(): void;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
