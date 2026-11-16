export type NeedsYouStatus = "needs-input" | "plan-ready";
export type NeedsYouThread = {
  id: string;
  title: string;
  environmentId: string;
  since: string | null;
  status: NeedsYouStatus;
};

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
