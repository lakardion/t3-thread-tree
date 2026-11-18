import { contextBridge, ipcRenderer } from "electron";

import type { UpNext, UpNextBridge } from "../shared/desktop.ts";

contextBridge.exposeInMainWorld("upNextBridge", {
  upNext: () => ipcRenderer.invoke("upNext"),
  onUpNext: (cb) => {
    const listener = (_event: unknown, list: UpNext) => cb(list);
    ipcRenderer.on("upNext", listener);
    return () => void ipcRenderer.removeListener("upNext", listener);
  },
  openNext: () => ipcRenderer.send("upNextOpenNext"),
  openThread: (id) => ipcRenderer.send("upNextOpenThread", id),
  openLinear: (url) => ipcRenderer.send("upNextOpenLinear", url),
} satisfies UpNextBridge);
