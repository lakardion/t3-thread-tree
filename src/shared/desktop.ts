export type NeedsYouThread = { id: string; title: string; environmentId: string; since: string | null };

export type DesktopBridge = {
  setToken(token: string): Promise<void>;
  setNeedsYou(threads: NeedsYouThread[]): void;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
