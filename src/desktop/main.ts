import { type ChildProcess, execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { app, BrowserWindow, shell } from "electron";

import { fallbackPath, pickPort, RESET_AFTER_MS, restartDelay, shellPath } from "./runtime.ts";

const log = (m: string) => console.log(`desktop: ${m}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let window: BrowserWindow | undefined;
let child: ChildProcess | undefined;
let quitting = false;

const loginPath = () =>
  new Promise<string>((resolve) => {
    execFile(process.env.SHELL ?? "/bin/zsh", ["-l", "-c", "env"], { timeout: 5000 }, (err, out) => {
      resolve((!err && shellPath(out)) || fallbackPath(process.env.PATH, homedir()));
    });
  });

function startServer(port: number, PATH: string, attempt: number) {
  const started = Date.now();
  const env = { ...process.env, PATH, PORT: String(port) };
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
    if (Date.now() - started >= RESET_AFTER_MS) attempt = 0;
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
  window = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.once("ready-to-show", () => window?.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url === origin || url.startsWith(`${origin}/`)) return;
    event.preventDefault();
    openOutside(url);
  });
  window.loadURL(origin).catch((e: unknown) => log(`load failed: ${String(e)}`));
}

async function main() {
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
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on("window-all-closed", () => app.quit());
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
