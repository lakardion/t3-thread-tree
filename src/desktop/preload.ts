import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBridge } from "../shared/desktop.ts";

contextBridge.exposeInMainWorld("desktopBridge", {
  setNeedsYou: (threads) => ipcRenderer.send("setNeedsYou", threads),
  notify: (events) => ipcRenderer.send("notify", events),
  checkUpdates: () => ipcRenderer.send("checkUpdates"),
} satisfies DesktopBridge);
