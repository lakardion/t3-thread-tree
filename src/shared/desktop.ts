export type DesktopBridge = { setToken(token: string): Promise<void> };

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
