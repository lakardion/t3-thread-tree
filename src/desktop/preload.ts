import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBridge } from "../shared/desktop.ts";

contextBridge.exposeInMainWorld("desktopBridge", {
  setToken: (token) => ipcRenderer.invoke("setToken", token),
} satisfies DesktopBridge);
