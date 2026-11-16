import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBridge } from "../shared/desktop.ts";

contextBridge.exposeInMainWorld("desktopBridge", {
  setToken: (token) => ipcRenderer.invoke("setToken", token),
  setNeedsYou: (threads) => ipcRenderer.send("setNeedsYou", threads),
} satisfies DesktopBridge);
