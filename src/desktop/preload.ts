import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("desktopBridge", {});
