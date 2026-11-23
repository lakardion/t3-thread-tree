import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";

import {
  afterCheck,
  fallbackPath,
  isNewer,
  notificationText,
  parseRelease,
  releaseNotes,
  pickPort,
  restartDelay,
  shellPath,
  shouldCheck,
  trayItems,
  updateMenuLabel,
} from "../src/desktop/runtime.ts";
import {
  askText,
  catchUpLines,
  type NeedsYouThread,
  type ThreadNotifyEvent,
  type UpdateState,
} from "../src/shared/desktop.ts";

const listen = (port: number) =>
  new Promise<Server>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
const close = (s: Server) => new Promise((resolve) => s.close(resolve));

describe("pickPort", () => {
  test("takes a free start port, skips a held one", async () => {
    const probe = await listen(0);
    const p = (probe.address() as { port: number }).port;
    await close(probe);
    expect(await pickPort(p)).toBe(p);

    const held = await listen(p);
    const next = await pickPort(p);
    expect(next).toBeGreaterThan(p);
    await close(await listen(next));
    await close(held);
  });
});

describe("shellPath", () => {
  test("picks the PATH line and ignores MANPATH", () => {
    expect(shellPath("HOME=/h\nMANPATH=/m\nPATH=/a:/b\nX=1")).toBe("/a:/b");
  });
  test("is null with no PATH line", () => {
    expect(shellPath("MANPATH=/m\nHOME=/h")).toBeNull();
  });
});

describe("fallbackPath", () => {
  test("appends the three folders", () => {
    expect(fallbackPath("/usr/bin", "/h")).toBe("/usr/bin:/opt/homebrew/bin:/h/.local/bin:/h/.bun/bin");
  });
  test("works with no PATH", () => {
    expect(fallbackPath(undefined, "/h")).toBe("/opt/homebrew/bin:/h/.local/bin:/h/.bun/bin");
  });
});

describe("restartDelay", () => {
  test("doubles from 500 ms and caps at 10 s", () => {
    expect([0, 1, 2, 3].map(restartDelay)).toEqual([500, 1000, 2000, 4000]);
    expect(restartDelay(5)).toBe(10_000);
    expect(restartDelay(50)).toBe(10_000);
  });
});

describe("trayItems", () => {
  const th = (id: string, since: string | null, status: NeedsYouThread["status"] = "needs-input"): NeedsYouThread => ({
    id,
    title: id,
    environmentId: "e",
    since,
    status,
  });
  test("oldest wait first, null last, ties keep input order", () => {
    const ids = trayItems([th("n1", null), th("b", "2026-01-02"), th("t1", "2026-01-01"), th("t2", "2026-01-01")]).map(
      (i) => i.label,
    );
    expect(ids).toEqual(["Needs input · t1", "Needs input · t2", "Needs input · b", "Needs input · n1"]);
  });
  test("a plan ready with an older since sorts before a needs input with a newer one", () => {
    const ids = trayItems([th("n", "2026-01-02"), th("p", "2026-01-01", "plan-ready"), th("g", null)]).map(
      (i) => i.label,
    );
    expect(ids).toEqual(["Plan ready · p", "Needs input · n", "Needs input · g"]);
  });
  test("label has the status and the URL encodes env and id", () => {
    expect(trayItems([{ ...th("a b", null, "plan-ready"), environmentId: "e/1" }])).toEqual([
      { label: "Plan ready · a b", url: "t3code://threads/e%2F1/a%20b" },
    ]);
  });
  test("a done Catch-up with an ask adds it to the label; any other state keeps today's label", () => {
    const label = (catchUp: NeedsYouThread["catchUp"]) => trayItems([{ ...th("a", null), catchUp }])[0].label;
    expect(label({ state: "done", ask: "Ship it?", options: ["now", "later"] })).toBe(
      "Needs input · a — Ship it? now or later?",
    );
    expect(label({ state: "done", ask: null })).toBe("Needs input · a");
    expect(label({ state: "failed" })).toBe("Needs input · a");
    expect(label({ state: "running" })).toBe("Needs input · a");
  });
  test("a run item uses its own URL and its status title", () => {
    expect(
      trayItems([
        {
          ...th("Run 1", null, "run-question"),
          environmentId: "",
          url: "http://t3/workflows?run=r1",
          catchUp: { state: "done", ask: "Approve?" },
        },
        { ...th("Run 2", null, "paused-run"), environmentId: "", url: "http://t3/workflows?run=r2" },
      ]),
    ).toEqual([
      { label: "Run question · Run 1 — Approve?", url: "http://t3/workflows?run=r1" },
      { label: "Run paused · Run 2", url: "http://t3/workflows?run=r2" },
    ]);
  });
  test("10 threads have no more item, 13 add one that shows the window", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => th(String(i), null));
    expect(trayItems(many(10))).toHaveLength(10);
    const items = trayItems(many(13));
    expect(items).toHaveLength(11);
    expect(items[10]).toEqual({ label: "+3 more… (open tree)", url: null });
  });
  test("empty list gives no items", () => {
    expect(trayItems([])).toEqual([]);
  });
});

describe("isNewer", () => {
  test("compares major, minor and patch as numbers", () => {
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.1.1")).toBe(false);
    expect(isNewer("0.9.0", "0.10.0")).toBe(false);
  });
  test("allows a leading v on either side", () => {
    expect(isNewer("v0.2.0", "0.1.0")).toBe(true);
    expect(isNewer("0.2.0", "v0.1.0")).toBe(true);
  });
  test("is false for input that is not X.Y.Z", () => {
    for (const bad of ["latest", "1.2", "1.2.3-beta.1", ""]) {
      expect(isNewer(bad, "0.1.0")).toBe(false);
      expect(isNewer("9.9.9", bad)).toBe(false);
    }
  });
});

describe("releaseNotes", () => {
  test("keeps the list items as bullets", () => {
    const body = [
      "## What's Changed",
      "* Add in-app updates by @someone in https://github.com/o/r/pull/50",
      "* Fix a row (#51)",
      "",
      "**Full Changelog**: https://github.com/o/r/compare/v0.1.3...v0.1.4",
    ].join("\r\n");
    expect(releaseNotes(body)).toBe("• Add in-app updates\n• Fix a row (#51)");
  });
});

describe("parseRelease", () => {
  const url = "https://github.com/lakardion/t3-thread-tree/releases/tag/v0.2.0";
  test("reads the version and page", () => {
    expect(parseRelease({ tag_name: "v0.2.0", html_url: url })).toEqual({
      version: "0.2.0",
      url,
      zip: null,
      notes: "",
    });
  });
  test("reads the app zip", () => {
    const zip = "https://github.com/lakardion/t3-thread-tree/releases/download/v0.2.0/app-arm64-mac.zip";
    const assets = [
      { name: "app-arm64.dmg", browser_download_url: zip.replace(".zip", ".dmg") },
      { name: "app-arm64-mac.zip", browser_download_url: zip },
    ];
    expect(parseRelease({ tag_name: "v0.2.0", html_url: url, assets })?.zip).toBe(zip);
  });
  test("rejects a bad payload", () => {
    expect(parseRelease({ html_url: url })).toBeNull();
    expect(parseRelease({ tag_name: "v0.2.0", html_url: "https://example.com/x" })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    const assets = [{ name: "a.zip", browser_download_url: "https://example.com/a.zip" }];
    expect(parseRelease({ tag_name: "v0.2.0", html_url: url, assets })).toBeNull();
  });
});

const NOW = Date.parse("2026-01-01T12:00:00Z");
const idle: UpdateState = {
  version: "0.1.5",
  checking: false,
  checkedAt: null,
  checkFailed: false,
  release: null,
  install: null,
};
const found = {
  version: "0.2.0",
  url: "https://github.com/a/b/releases/tag/v0.2.0",
  zip: "https://github.com/a/b/x.zip",
  notes: "",
};

describe("shouldCheck", () => {
  test("allows a first check", () => {
    expect(shouldCheck(idle, NOW, false)).toBe(true);
  });
  test("blocks while a check runs, also when forced", () => {
    expect(shouldCheck({ ...idle, checking: true }, NOW, true)).toBe(false);
  });
  test("blocks while an install runs, also when forced", () => {
    expect(shouldCheck({ ...idle, install: { stage: "unpacking" } }, NOW, true)).toBe(false);
  });
  test("allows a check after a failed install", () => {
    expect(shouldCheck({ ...idle, install: { stage: "failed", error: "x" } }, NOW, false)).toBe(true);
  });
  test("skips a check under 60 s old unless forced", () => {
    const state = { ...idle, checkedAt: new Date(NOW - 59_000).toISOString() };
    expect(shouldCheck(state, NOW, false)).toBe(false);
    expect(shouldCheck(state, NOW, true)).toBe(true);
    expect(shouldCheck({ ...state, checkedAt: new Date(NOW - 60_000).toISOString() }, NOW, false)).toBe(true);
  });
});

describe("afterCheck", () => {
  test("sets a newer release", () => {
    const next = afterCheck(idle, found, "0.1.5", NOW, true);
    expect(next).toMatchObject({ checking: false, checkFailed: false, checkedAt: new Date(NOW).toISOString() });
    expect(next.release).toEqual({ version: "0.2.0", canInstall: true });
  });
  test("cannot install a release with no zip, or from source", () => {
    expect(afterCheck(idle, { ...found, zip: null }, "0.1.5", NOW, true).release?.canInstall).toBe(false);
    expect(afterCheck(idle, found, "0.1.5", NOW, false).release?.canInstall).toBe(false);
  });
  test("clears the release when it is not newer", () => {
    const known = { ...idle, release: { version: "0.2.0", canInstall: true } };
    expect(afterCheck(known, found, "0.2.0", NOW, true).release).toBeNull();
  });
  test("a failed check keeps the release and the last good time", () => {
    const known = { ...idle, checking: true, checkedAt: "t", release: { version: "0.2.0", canInstall: true } };
    expect(afterCheck(known, "failed", "0.1.5", NOW, true)).toEqual({ ...known, checking: false, checkFailed: true });
  });
  test("a later good reply clears checkFailed", () => {
    expect(afterCheck({ ...idle, checkFailed: true }, found, "0.1.5", NOW, true).checkFailed).toBe(false);
  });
});

describe("updateMenuLabel", () => {
  const label = (patch: Partial<UpdateState>) => updateMenuLabel({ ...idle, ...patch });
  test("names each state", () => {
    expect(label({})).toBe("Check for Updates…");
    expect(label({ release: { version: "0.2.0", canInstall: true } })).toBe("Update available: v0.2.0…");
    expect(label({ install: { stage: "downloading", progress: null } })).toBe("Downloading Update…");
    expect(label({ install: { stage: "downloading", progress: 0.424 } })).toBe("Downloading Update… 42%");
    expect(label({ install: { stage: "unpacking" } })).toBe("Installing Update…");
    expect(label({ install: { stage: "restarting" } })).toBe("Restarting…");
    expect(label({ install: { stage: "failed", error: "x" } })).toBe("Update Failed: Open Release Page…");
  });
});

describe("askText", () => {
  test("adds the options as A or B?", () => {
    expect(askText({ state: "done", ask: "Which?", options: ["A", "B"] })).toBe("Which? A or B?");
  });
  test("is the ask with no options", () => {
    expect(askText({ state: "done", ask: "Ship it?", options: [] })).toBe("Ship it?");
    expect(askText({ state: "done", ask: "Ship it?" })).toBe("Ship it?");
  });
});

describe("catchUpLines", () => {
  test("a done call with an ask gives the ask and the did", () => {
    expect(catchUpLines({ state: "done", did: "Built.", ask: "Ship it?", options: ["now"] })).toEqual({
      ask: "Ship it? now?",
      did: "Built.",
      raw: null,
      why: null,
    });
  });
  test("a done call with no ask gives the raw question", () => {
    expect(catchUpLines({ state: "done", did: "Built.", ask: null, question: "All done." })).toEqual({
      ask: null,
      did: "Built.",
      raw: "All done.",
      why: "No clear ask",
    });
  });
  test("a failed call gives the raw question", () => {
    expect(catchUpLines({ state: "failed", question: "Retry?" })).toEqual({
      ask: null,
      did: null,
      raw: "Retry?",
      why: "Catch-up failed",
    });
  });
  test("no Catch-up, queued and running give null", () => {
    expect(catchUpLines(undefined)).toBeNull();
    expect(catchUpLines({ state: "queued" })).toBeNull();
    expect(catchUpLines({ state: "running" })).toBeNull();
  });
});

describe("notificationText", () => {
  const e = (catchUp?: ThreadNotifyEvent["catchUp"]): ThreadNotifyEvent => ({
    kind: "thread",
    threadId: "a",
    environmentId: "e",
    title: "Fix cart",
    status: "needs-input",
    catchUp,
  });
  test("a done call with an ask puts the ask and the did in the body", () => {
    expect(notificationText(e({ state: "done", did: "Built.", ask: "Ship it?", options: ["now", "later"] }))).toEqual({
      title: "Needs input · Fix cart",
      body: "Asks: Ship it? now or later?\nBuilt.",
    });
  });
  test("no clear ask or a failed call gives the raw question, then the did, then the title", () => {
    const body = (c: ThreadNotifyEvent["catchUp"]) => notificationText(e(c)).body;
    expect(body({ state: "done", did: "Built.", ask: null, question: "All done." })).toBe("All done.");
    expect(body({ state: "failed", question: "Retry?" })).toBe("Retry?");
    expect(body({ state: "done", did: "Built.", ask: null, question: null })).toBe("Built.");
    expect(body({ state: "failed", question: null })).toBe("Fix cart");
    expect(notificationText(e({ state: "failed", question: "Retry?" })).title).toBe("Needs input · Fix cart");
  });
  test("no Catch-up, or one that is not finished, gives today's text", () => {
    expect(notificationText(e())).toEqual({ title: "Needs input", body: "Fix cart" });
    expect(notificationText(e({ state: "running" }))).toEqual({ title: "Needs input", body: "Fix cart" });
  });
});
