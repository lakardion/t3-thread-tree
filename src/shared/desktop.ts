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

export type DesktopBridge = {
  setToken(token: string): Promise<void>;
  setNeedsYou(threads: NeedsYouThread[]): void;
  notify(events: NotifyEvent[]): void;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
