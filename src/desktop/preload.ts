import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBridge, UpdateState } from "../shared/desktop.ts";

contextBridge.exposeInMainWorld("desktopBridge", {
  setNeedsYou: (threads) => ipcRenderer.send("setNeedsYou", threads),
  notify: (events) => ipcRenderer.send("notify", events),
  setOpenNext: (title) => ipcRenderer.send("setOpenNext", title),
  onOpenNext: (cb) => {
    const listener = () => cb();
    ipcRenderer.on("openNext", listener);
    return () => void ipcRenderer.removeListener("openNext", listener);
  },
  updateState: () => ipcRenderer.invoke("updateState"),
  onUpdateState: (cb) => {
    const listener = (_event: unknown, state: UpdateState) => cb(state);
    ipcRenderer.on("updateState", listener);
    return () => void ipcRenderer.removeListener("updateState", listener);
  },
  checkUpdates: (force) => ipcRenderer.send("checkUpdates", force),
  installUpdate: () => ipcRenderer.send("installUpdate"),
  openRelease: () => ipcRenderer.send("openRelease"),
  setUpNext: (list) => ipcRenderer.send("setUpNext", list),
  onOpenThread: (cb) => {
    const listener = (_event: unknown, id: string) => cb(id);
    ipcRenderer.on("openThread", listener);
    return () => void ipcRenderer.removeListener("openThread", listener);
  },
} satisfies DesktopBridge);
