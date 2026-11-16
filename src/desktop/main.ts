import { type ChildProcess, execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from "electron";

import type { NeedsYouThread, NotifyEvent } from "../shared/desktop.ts";
import {
  fallbackPath,
  isNewer,
  parseRelease,
  pickPort,
  RESET_AFTER_MS,
  restartDelay,
  shellPath,
  STATUS_TITLE,
  threadUrl,
  trayItems,
} from "./runtime.ts";
import {
  parseBounds,
  parseNeedsYou,
  parseNotify,
  parseSettings,
  parseUpdated,
  readJson,
  type Settings,
  writeJson,
} from "./store.ts";

const log = (m: string) => console.log(`desktop: ${m}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let window: BrowserWindow | undefined;
let child: ChildProcess | undefined;
let quitting = false;
let settings: Settings = parseSettings(undefined);
/** The last Needs-you list, for the menu-bar entry. */
let needsYou: NeedsYouThread[] = [];
/** Kept referenced so the menu-bar icon is not garbage-collected. */
let tray: Tray | undefined;
/** The newer release found on GitHub, for the "Update available" menu item. */
let update: ReturnType<typeof parseRelease> = null;
/** True while the update downloads, so the menus show it and offer no second download. */
let downloading = false;

const LATEST_RELEASE = "https://api.github.com/repos/lakardion/t3-thread-tree/releases/latest";

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
  const env = { ...process.env, PATH, PORT: String(port), T3_TOKEN_FILE: dataFile("token") };
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

const showWindow = () => {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

/**
 * The shown notifications by thread id, "" for the summary. The reference keeps the click handler alive.
 * ponytail: never pruned; holds at most one entry per thread that notified.
 */
const shown = new Map<string, Notification>();

function showNotification(e: NotifyEvent) {
  let key: string;
  let n: Notification;
  if (e.kind === "thread") {
    key = e.threadId;
    n = new Notification({ title: STATUS_TITLE[e.status], body: e.title, silent: false });
    n.on("click", () => openOutside(threadUrl(e.environmentId, e.threadId)));
  } else {
    key = "";
    n = new Notification({ title: `${e.count} threads need you`, silent: false });
    n.on("click", showWindow);
  }
  shown.get(key)?.close();
  shown.set(key, n);
  n.show();
}

function openWindow(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const win = (window = new BrowserWindow({
    width: 1200,
    height: 900,
    ...parseBounds(
      readJson(dataFile("window.json")),
      screen.getAllDisplays().map((d) => d.workArea),
    ),
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

const toggles = (): MenuItemConstructorOptions[] => [
  {
    label: "Mute Notifications",
    type: "checkbox",
    checked: settings.muted,
    click: (item) => {
      settings = { ...settings, muted: item.checked };
      save("settings.json", settings);
      setMenus();
    },
  },
];

/** Returns true when GitHub answered. */
async function checkUpdate() {
  try {
    const res = await fetch(LATEST_RELEASE, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const release = parseRelease(await res.json());
    if (release && isNewer(release.version, app.getVersion())) {
      update = release;
      setMenus();
    }
    return true;
  } catch (e) {
    log(`update check failed: ${String(e)}`);
    return false;
  }
}

/** Waits for process `$1` to exit, puts bundle `$3` in place of bundle `$2` (or keeps `$2` when that fails), and opens it. */
const SWAP = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
rm -rf "$2.old" && mv "$2" "$2.old" && if mv "$3" "$2"; then rm -rf "$2.old"; else mv "$2.old" "$2"; fi
open "$2"`;

/** Downloads and unpacks the release zip, then quits so the swap script puts the new app in place and opens it. */
async function installUpdate(u: NonNullable<typeof update>, zipUrl: string) {
  /** The executable is `X.app/Contents/MacOS/X`. */
  const bundle = dirname(dirname(dirname(app.getPath("exe"))));
  if (bundle.includes("/AppTranslocation/")) throw new Error("Move the app to the Applications folder first.");
  await access(dirname(bundle), constants.W_OK);
  const dir = await mkdtemp(join(app.getPath("temp"), "t3-thread-tree-update-"));
  const res = await fetch(zipUrl, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}.`);
  /** ponytail: holds the whole zip in memory; stream it to disk if releases get much larger. */
  await writeFile(join(dir, "update.zip"), Buffer.from(await res.arrayBuffer()));
  await promisify(execFile)("ditto", ["-x", "-k", join(dir, "update.zip"), dir]);
  const name = (await readdir(dir)).find((n) => n.endsWith(".app"));
  if (!name) throw new Error("The download has no app in it.");
  save("updated.json", { version: u.version, notes: u.notes, url: u.url });
  spawn("/bin/sh", ["-c", SWAP, "sh", String(process.pid), bundle, join(dir, name)], {
    detached: true,
    stdio: "ignore",
  }).unref();
  app.quit();
}

/** Offers the update. A release with an app zip installs in place; one without opens the release page. */
async function promptUpdate(u: NonNullable<typeof update>) {
  /** A run from source must not replace the Electron binary it runs on. */
  const zip = app.isPackaged ? u.zip : null;
  const { response } = await dialog.showMessageBox({
    message: `Version ${u.version} is available`,
    detail: `You have version ${app.getVersion()}.`,
    buttons: [zip ? "Update and Restart" : "Open Release Page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  if (!zip) return openOutside(u.url);
  downloading = true;
  setMenus();
  try {
    await installUpdate(u, zip);
  } catch (e) {
    log(`update install failed: ${String(e)}`);
    downloading = false;
    setMenus();
    const failed = await dialog.showMessageBox({
      type: "warning",
      message: "Cannot install the update",
      detail: e instanceof Error ? e.message : String(e),
      buttons: ["Open Release Page", "Close"],
      defaultId: 0,
      cancelId: 1,
    });
    if (failed.response === 0) openOutside(u.url);
  }
}

/** After an update, shows once what the new version changed. */
async function showUpdated() {
  const file = dataFile("updated.json");
  const updated = parseUpdated(readJson(file));
  if (!updated) return;
  await rm(file, { force: true });
  if (updated.version !== app.getVersion()) return;
  const { response } = await dialog.showMessageBox({
    message: `Updated to version ${updated.version}`,
    detail: updated.notes || undefined,
    buttons: ["OK", "Open Release Page"],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) openOutside(updated.url);
}

/** The "Check for Updates…" click: checks now and shows the result in a dialog. */
async function checkUpdateNow() {
  if (downloading) return;
  const ok = await checkUpdate();
  const u = update;
  if (u) {
    await promptUpdate(u);
  } else if (ok) {
    await dialog.showMessageBox({
      message: "You are up to date",
      detail: `Version ${app.getVersion()} is the latest.`,
    });
  } else {
    await dialog.showMessageBox({
      type: "warning",
      message: "Cannot check for updates",
      detail: "GitHub did not answer. Try again later.",
    });
  }
}

const updateItems = (): MenuItemConstructorOptions[] => {
  const u = update;
  if (downloading) return [{ label: "Downloading Update…", enabled: false }];
  if (u) return [{ label: `Update available: v${u.version}…`, click: () => void promptUpdate(u) }];
  return [{ label: "Check for Updates…", click: () => void checkUpdateNow() }];
};

function setMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          ...toggles(),
          ...updateItems(),
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

function setTrayMenu() {
  if (!tray) return;
  tray.setTitle(needsYou.length ? String(needsYou.length) : "", { fontType: "monospacedDigit" });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...trayItems(needsYou).map((i) => ({
        label: i.label,
        click: () => (i.url ? openOutside(i.url) : showWindow()),
      })),
      ...(needsYou.length ? [{ type: "separator" } as const] : []),
      { label: "Open tree", click: showWindow },
      { type: "separator" },
      ...toggles(),
      ...updateItems(),
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ]),
  );
}

function setMenus() {
  setMenu();
  setTrayMenu();
}

async function main() {
  settings = parseSettings(readJson(dataFile("settings.json")));
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), "assets", "trayTemplate.png")));
  tray.setToolTip(app.name);
  setMenus();
  if (app.isPackaged) {
    void checkUpdate();
    setInterval(() => void checkUpdate(), 6 * 60 * 60 * 1000);
  }
  ipcMain.on("setNeedsYou", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) return;
    const list = parseNeedsYou(raw);
    if (!list) {
      log("bad setNeedsYou payload");
      return;
    }
    needsYou = list;
    app.setBadgeCount(list.length);
    setTrayMenu();
  });
  ipcMain.on("notify", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) return;
    const events = parseNotify(raw);
    if (!events) {
      log("bad notify payload");
      return;
    }
    if (settings.muted) return;
    events.forEach(showNotification);
  });
  ipcMain.on("checkUpdates", (event) => {
    if (event.sender === window?.webContents) void checkUpdateNow();
  });
  const [PATH, port] = await Promise.all([loginPath(), pickPort()]);
  startServer(port, PATH, 0);
  if (!(await waitReady(port))) {
    log("server not ready after 30 s");
    app.quit();
    return;
  }
  openWindow(port);
  void showUpdated();
}

/** A run from source keeps its own data and lock, so it runs beside the installed app. */
if (!app.isPackaged) app.setPath("userData", `${app.getPath("userData")} Dev`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
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
