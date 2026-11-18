import { type ChildProcess, execFile, spawn } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { promisify } from "node:util";

import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from "electron";

import type { NeedsYouThread, NotifyEvent, UpdateState, UpNext } from "../shared/desktop.ts";
import {
  afterCheck,
  fallbackPath,
  installing,
  parseRelease,
  pickPort,
  RESET_AFTER_MS,
  restartDelay,
  shellPath,
  shouldCheck,
  STATUS_TITLE,
  threadUrl,
  trayItems,
  updateMenuLabel,
} from "./runtime.ts";
import {
  parseBounds,
  parseNeedsYou,
  parseNotify,
  parseOpenNext,
  parseSettings,
  parseUpNext,
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
/** The title of the thread "Open next" opens, or `null` with none. */
let openNext: string | null = null;
/** The Up next window. It is created on the first show and then only hidden. */
let upNextWin: BrowserWindow | undefined;
/** The last Up next list, sent to the Up next window on load and on each change. */
let upNextList: UpNext = { rows: [], targetId: null };
/** The origin of the local server, set once it is ready. */
let origin: string | undefined;
/** Kept referenced so the menu-bar icon is not garbage-collected. */
let tray: Tray | undefined;
/** What the menus and the page show about updates. */
let updateState: UpdateState = {
  version: app.getVersion(),
  checking: false,
  checkedAt: null,
  checkFailed: false,
  release: null,
  install: null,
};
/** The newer release found on GitHub. `updateState.release` holds the part the page may see. */
let release: ReturnType<typeof parseRelease> = null;

const UP_NEXT_KEY = "Alt+CommandOrControl+U";
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

/** Opens every link that leaves `base` outside the window. */
function keepLinksOutside(win: BrowserWindow, base: string) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === base || url.startsWith(`${base}/`)) return;
    event.preventDefault();
    openOutside(url);
  });
}

function openWindow(base: string) {
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
  keepLinksOutside(win, base);
  win.loadURL(base).catch((e: unknown) => log(`load failed: ${String(e)}`));
}

/** Creates the Up next window on its first show: a floating panel on all Spaces that does not take focus. */
function createUpNext(base: string) {
  const width = 360;
  const height = 360;
  const screens = screen.getAllDisplays().map((d) => d.workArea);
  const bounds = parseBounds(readJson(dataFile("up-next.json")), screens);
  if (bounds.x === undefined) {
    const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    Object.assign(bounds, { x: wa.x + wa.width - (bounds.width ?? width) - 16, y: wa.y + 16 });
  }
  const win = (upNextWin = new BrowserWindow({
    width,
    height,
    minWidth: 280,
    minHeight: 160,
    ...bounds,
    title: "Up next",
    type: "panel",
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "desktop", "up-next-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }));
  win.setAlwaysOnTop(true, "floating");
  /** Without `skipTransformProcessType`, Electron changes the process type and the Dock icon flickers. */
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.once("ready-to-show", () => win.showInactive());
  /** Close hides the window; Cmd-Q still quits. */
  win.on("close", (e) => {
    save("up-next.json", win.getNormalBounds());
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
  win.on("show", setMenus);
  win.on("hide", setMenus);
  win.on("closed", () => (upNextWin = undefined));
  keepLinksOutside(win, base);
  win.loadURL(`${base}/up-next`).catch((e: unknown) => log(`up next load failed: ${String(e)}`));
}

/** Shows or hides the Up next window. Before the server is ready, it only resets the menu check. */
function toggleUpNext() {
  if (!origin) return setMenus();
  if (!upNextWin) return createUpNext(origin);
  if (upNextWin.isVisible()) upNextWin.hide();
  else upNextWin.showInactive();
}

const upNextItem = (): MenuItemConstructorOptions => ({
  label: "Up next",
  type: "checkbox",
  checked: !!upNextWin?.isVisible(),
  accelerator: UP_NEXT_KEY,
  click: toggleUpNext,
});

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

/** Merges `patch` into the update state, then updates the menus, the page and the Dock progress bar. */
function setUpdate(patch: Partial<UpdateState>) {
  updateState = { ...updateState, ...patch };
  setMenus();
  window?.webContents.send("updateState", updateState);
  const { install } = updateState;
  window?.setProgressBar(install?.stage === "downloading" && install.progress !== null ? install.progress : -1);
}

/** Returns true when GitHub gave a reply that parses. */
async function checkUpdate() {
  setUpdate({ checking: true });
  let reply: Parameters<typeof afterCheck>[1] = "failed";
  try {
    const res = await fetch(LATEST_RELEASE, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) reply = parseRelease(await res.json()) ?? "failed";
  } catch (e) {
    log(`update check failed: ${String(e)}`);
  }
  const next = afterCheck(updateState, reply, app.getVersion(), Date.now(), app.isPackaged);
  if (reply !== "failed") release = next.release ? reply : null;
  setUpdate(next);
  return reply !== "failed";
}

/** Runs a check unless `shouldCheck` says no. */
const runCheck = (force: boolean) => (shouldCheck(updateState, Date.now(), force) ? checkUpdate() : undefined);

/** Waits for process `$1` to exit, puts bundle `$3` in place of bundle `$2` (or keeps `$2` when that fails), and opens it. */
const SWAP = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
rm -rf "$2.old" && mv "$2" "$2.old" && if mv "$3" "$2"; then rm -rf "$2.old"; else mv "$2.old" "$2"; fi
open "$2"`;

/** Downloads and unpacks the release zip, then quits so the swap script puts the new app in place and opens it. */
async function installUpdate(u: NonNullable<typeof release>, zipUrl: string) {
  /** The executable is `X.app/Contents/MacOS/X`. */
  const bundle = dirname(dirname(dirname(app.getPath("exe"))));
  if (bundle.includes("/AppTranslocation/")) throw new Error("Move the app to the Applications folder first.");
  await access(dirname(bundle), constants.W_OK);
  const dir = await mkdtemp(join(app.getPath("temp"), "t3-thread-tree-update-"));
  const res = await fetch(zipUrl, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Download failed with HTTP ${res.status}.`);
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let sentAt = 0;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        received += chunk.length;
        if (total && Date.now() - sentAt >= 250) {
          sentAt = Date.now();
          setUpdate({ install: { stage: "downloading", progress: received / total } });
        }
        yield chunk;
      }
    },
    createWriteStream(join(dir, "update.zip")),
  );
  setUpdate({ install: { stage: "unpacking" } });
  await promisify(execFile)("ditto", ["-x", "-k", join(dir, "update.zip"), dir]);
  const name = (await readdir(dir)).find((n) => n.endsWith(".app"));
  if (!name) throw new Error("The download has no app in it.");
  save("updated.json", { version: u.version, notes: u.notes, url: u.url });
  spawn("/bin/sh", ["-c", SWAP, "sh", String(process.pid), bundle, join(dir, name)], {
    detached: true,
    stdio: "ignore",
  }).unref();
  setUpdate({ install: { stage: "restarting" } });
  await sleep(400);
  app.quit();
}

/** Installs the known release in place. `fromMenu` shows a dialog when it fails. */
async function applyUpdate(fromMenu = false) {
  const u = release;
  if (!u?.zip || installing(updateState)) return;
  setUpdate({ install: { stage: "downloading", progress: null } });
  try {
    await installUpdate(u, u.zip);
  } catch (e) {
    log(`update install failed: ${String(e)}`);
    const error = e instanceof Error ? e.message : String(e);
    setUpdate({ install: { stage: "failed", error } });
    if (!fromMenu) return;
    const failed = await dialog.showMessageBox({
      type: "warning",
      message: "Cannot install the update",
      detail: error,
      buttons: ["Open Release Page", "Close"],
      defaultId: 0,
      cancelId: 1,
    });
    if (failed.response === 0) openOutside(u.url);
  }
}

/** The menu path: offers the update. A release that can install in place does so; one that cannot opens the release page. */
async function promptUpdate(u: NonNullable<typeof release>) {
  const canInstall = updateState.release?.canInstall;
  const { response } = await dialog.showMessageBox({
    message: `Version ${u.version} is available`,
    detail: `You have version ${app.getVersion()}.`,
    buttons: [canInstall ? "Update and Restart" : "Open Release Page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  if (!canInstall) return openOutside(u.url);
  await applyUpdate(true);
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
  if (!shouldCheck(updateState, Date.now(), true)) return;
  const ok = await checkUpdate();
  const u = release;
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
  const u = release;
  const label = updateMenuLabel(updateState);
  const { install } = updateState;
  if (install?.stage === "failed") return [{ label, click: () => u && openOutside(u.url) }];
  if (install) return [{ label, enabled: false }];
  if (u) return [{ label, click: () => void promptUpdate(u) }];
  return [{ label, click: () => void checkUpdateNow() }];
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
      {
        role: "window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          upNextItem(),
          { type: "separator" },
          { role: "front" },
        ],
      },
    ]),
  );
}

function setTrayMenu() {
  if (!tray) return;
  tray.setTitle(needsYou.length ? String(needsYou.length) : "", { fontType: "monospacedDigit" });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(openNext
        ? [
            { label: `Open next · ${openNext}`, click: () => window?.webContents.send("openNext") },
            { type: "separator" } as const,
          ]
        : []),
      ...trayItems(needsYou).map((i) => ({
        label: i.label,
        click: () => (i.url ? openOutside(i.url) : showWindow()),
      })),
      ...(needsYou.length ? [{ type: "separator" } as const] : []),
      { label: "Open tree", click: showWindow },
      upNextItem(),
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
    void runCheck(true);
    setInterval(() => void runCheck(true), 6 * 60 * 60 * 1000);
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
  ipcMain.on("setOpenNext", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) return;
    const title = parseOpenNext(raw);
    if (title === undefined) {
      log("bad setOpenNext payload");
      return;
    }
    openNext = title;
    setTrayMenu();
  });
  ipcMain.on("setUpNext", (event, raw: unknown) => {
    if (event.sender !== window?.webContents) return;
    const list = parseUpNext(raw);
    if (!list) {
      log("bad setUpNext payload");
      return;
    }
    upNextList = list;
    upNextWin?.webContents.send("upNext", list);
  });
  ipcMain.handle("upNext", (event) => {
    if (event.sender !== upNextWin?.webContents) throw new Error("untrusted sender");
    return upNextList;
  });
  ipcMain.on("upNextOpenNext", (event) => {
    if (event.sender === upNextWin?.webContents) window?.webContents.send("openNext");
  });
  ipcMain.on("upNextOpenThread", (event, id: unknown) => {
    if (event.sender === upNextWin?.webContents && typeof id === "string") window?.webContents.send("openThread", id);
  });
  ipcMain.on("upNextOpenLinear", (event, url: unknown) => {
    if (event.sender === upNextWin?.webContents && typeof url === "string" && url.startsWith("https://linear.app/"))
      openOutside(url);
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
  ipcMain.handle("updateState", (event) => {
    if (event.sender !== window?.webContents) throw new Error("untrusted sender");
    return updateState;
  });
  ipcMain.on("checkUpdates", (event, force: unknown) => {
    if (event.sender !== window?.webContents) return;
    if (!runCheck(force === true)) window.webContents.send("updateState", updateState);
  });
  ipcMain.on("installUpdate", (event) => {
    if (event.sender !== window?.webContents) return;
    if (updateState.release?.canInstall) void applyUpdate();
    else if (release) openOutside(release.url);
  });
  ipcMain.on("openRelease", (event) => {
    if (event.sender === window?.webContents && release) openOutside(release.url);
  });
  const [PATH, port] = await Promise.all([loginPath(), pickPort()]);
  startServer(port, PATH, 0);
  if (!(await waitReady(port))) {
    log("server not ready after 30 s");
    app.quit();
    return;
  }
  origin = `http://127.0.0.1:${port}`;
  openWindow(origin);
  if (!globalShortcut.register(UP_NEXT_KEY, toggleUpNext)) log("cannot register the Up next shortcut");
  void showUpdated();
}

/** A run from source keeps its own data and lock, so it runs beside the installed app. */
if (!app.isPackaged) app.setPath("userData", `${app.getPath("userData")} Dev`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.on("activate", showWindow);
  app.on("will-quit", () => globalShortcut.unregisterAll());
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
