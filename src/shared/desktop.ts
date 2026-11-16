import * as v from "valibot";

/** The bridge payload of `setNeedsYou`. Unknown keys are dropped. */
export const NeedsYouList = v.pipe(
  v.array(v.object({ id: v.string(), title: v.string(), environmentId: v.string(), since: v.nullable(v.string()) })),
  v.maxLength(500),
);

export type NeedsYouThread = v.InferOutput<typeof NeedsYouList>[number];

export type NotifyStatus = "needs-input" | "plan-ready" | "failed";
export type NotifyEvent =
  | { kind: "thread"; threadId: string; environmentId: string; title: string; status: NotifyStatus }
  | { kind: "summary"; count: number };

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
