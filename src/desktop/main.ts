import { type ChildProcess, execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { app, BrowserWindow, ipcMain, Menu, screen, shell } from "electron";

import type { NeedsYouThread } from "../shared/desktop.ts";
import { fallbackPath, pickPort, RESET_AFTER_MS, restartDelay, shellPath } from "./runtime.ts";
import {
  parseBounds,
  parseNeedsYou,
  parseSettings,
  parseToken,
  readJson,
  readToken,
  type Settings,
  writeJson,
  writeToken,
} from "./store.ts";

const log = (m: string) => console.log(`desktop: ${m}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let window: BrowserWindow | undefined;
let child: ChildProcess | undefined;
let quitting = false;
/** Set when main stops the server to load a new token, so the stop does not count as a crash. */
let tokenRestart = false;
let settings: Settings = parseSettings(undefined);
/** The last Needs-you list, for the menu-bar entry. */
/* oxlint-disable-next-line eslint/no-unused-vars -- read by the menu-bar entry */
let needsYou: NeedsYouThread[] = [];

const dataFile = (name: string) => join(app.getPath("userData"), name);
const save = (name: string, value: unknown) => {
  try {
    writeJson(dataFile(name), value);
  } catch (e) {
    log(`save ${name} failed: ${String(e)}`);
  }
};

const loginPath = () =>
  new Promise<string>((resolve) => {
    execFile(process.env.SHELL ?? "/bin/zsh", ["-l", "-c", "env"], { timeout: 5000 }, (err, out) => {
      resolve((!err && shellPath(out)) || fallbackPath(process.env.PATH, homedir()));
    });
  });

function startServer(port: number, PATH: string, attempt: number) {
  const started = Date.now();
  const token = readToken(dataFile("token"));
  const env = { ...process.env, PATH, PORT: String(port), ...(token && { T3_TOKEN: token }) };
  child = app.isPackaged
    ? spawn(join(process.resourcesPath, "server"), { cwd: app.getPath("userData"), env, stdio: "inherit" })
    : spawn("bun", [process.env.DESKTOP_DEMO ? "scripts/demo.ts" : "src/server.ts"], {
        cwd: app.getAppPath(),
        env,
        stdio: "inherit",
      });
  child.once("exit", (code, signal) => {
    child = undefined;
    if (quitting) return;
    if (tokenRestart || Date.now() - started >= RESET_AFTER_MS) attempt = 0;
    tokenRestart = false;
    const delay = restartDelay(attempt);
    log(`server exited (${String(signal ?? code)}), restart in ${delay} ms`);
    /** ponytail: restarts on the startup port. A port taken in the meantime keeps failing, so pick a port again if that happens. */
    setTimeout(() => {
      if (!quitting) startServer(port, PATH, attempt + 1);
    }, delay);
  });
}

async function waitReady(port: number) {
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; await sleep(100)) {
    try {
      await fetch(`http://127.0.0.1:${port}/t3/cli`);
      return true;
    } catch {}
  }
  return false;
}

const allowed = (url: string) => {
  try {
    return ["t3code:", "https:", "http:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};
const openOutside = (url: string) => {
  if (allowed(url)) shell.openExternal(url).catch((e: unknown) => log(`openExternal failed: ${String(e)}`));
};

function openWindow(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const win = (window = new BrowserWindow({
    width: 1200,
    height: 900,
    ...parseBounds(
      readJson(dataFile("window.json")),
      screen.getAllDisplays().map((d) => d.workArea),
    ),
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    webPreferences: {
      /** Bun bakes the source folder into `__dirname`, so the path starts at the app root. */
      preload: join(app.getAppPath(), "dist", "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  }));
  win.once("ready-to-show", () => win.show());
  /** Close hides the window so the tree keeps running. A fullscreen window leaves fullscreen first. */
  win.on("close", (e) => {
    save("window.json", win.getNormalBounds());
    if (quitting) return;
    e.preventDefault();
    if (win.isFullScreen()) {
      win.once("leave-full-screen", () => win.hide());
      win.setFullScreen(false);
    } else win.hide();
  });
  win.on("closed", () => (window = undefined));
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === origin || url.startsWith(`${origin}/`)) return;
    event.preventDefault();
    openOutside(url);
  });
  win.loadURL(origin).catch((e: unknown) => log(`load failed: ${String(e)}`));
}

function setMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Always on Top",
            type: "checkbox",
            checked: settings.alwaysOnTop,
            click: (item) => {
              settings = { ...settings, alwaysOnTop: item.checked };
              window?.setAlwaysOnTop(item.checked);
              save("settings.json", settings);
            },
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}

async function main() {
  settings = parseSettings(readJson(dataFile("settings.json")));
  setMenu();
  ipcMain.handle("setToken", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) throw new Error("not allowed");
    const token = parseToken(raw);
    if (!token) throw new Error("Not a valid token");
    writeToken(dataFile("token"), token);
    if (child) {
      tokenRestart = true;
      child.kill("SIGTERM");
    }
  });
  ipcMain.on("setNeedsYou", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) return;
    const list = parseNeedsYou(raw);
    if (!list) {
      log("bad setNeedsYou payload");
      return;
    }
    needsYou = list;
    app.setBadgeCount(list.length);
  });
  const [PATH, port] = await Promise.all([loginPath(), pickPort()]);
  startServer(port, PATH, 0);
  if (!(await waitReady(port))) {
    log("server not ready after 30 s");
    app.quit();
    return;
  }
  openWindow(port);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const showWindow = () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("before-quit", (event) => {
    quitting = true;
    if (!child) return;
    event.preventDefault();
    const stopping = child;
    const kill = setTimeout(() => stopping.kill("SIGKILL"), 5000);
    stopping.once("exit", () => {
      clearTimeout(kill);
      app.quit();
    });
    stopping.kill("SIGTERM");
  });
  app
    .whenReady()
    .then(main)
    .catch((e: unknown) => {
      log(`start failed: ${String(e)}`);
      app.quit();
    });
}
