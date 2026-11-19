import { createServer } from "node:net";

import * as v from "valibot";

import {
  catchUpLines,
  type NeedsYouThread,
  type NotifyStatus,
  type ThreadNotifyEvent,
  type UpdateState,
} from "../shared/desktop.ts";
import { bySince } from "../shared/tree.ts";

/** The first port from `start` up that a server can listen on at 127.0.0.1. */
export async function pickPort(start = 4773): Promise<number> {
  for (let port = start; ; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
}

/** The value of the `PATH=` line in `env` output. */
export function shellPath(envOutput: string): string | null {
  const line = envOutput.split("\n").find((l) => l.startsWith("PATH="));
  return line ? line.slice(5) : null;
}

export function fallbackPath(path: string | undefined, home: string): string {
  return [path, "/opt/homebrew/bin", `${home}/.local/bin`, `${home}/.bun/bin`].filter(Boolean).join(":");
}

export const restartDelay = (attempt: number) => Math.min(500 * 2 ** attempt, 10_000);

/** A child that ran this long resets the restart attempt count. */
export const RESET_AFTER_MS = 60_000;

export const STATUS_TITLE: Record<NotifyStatus, string> = {
  "needs-input": "Needs input",
  "plan-ready": "Plan ready",
  failed: "Failed",
};

export const threadUrl = (environmentId: string, id: string) =>
  `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(id)}`;

/** The title and body of a thread notification. Plain text: Electron gives no bold. */
export function notificationText(e: ThreadNotifyEvent): { title: string; body: string } {
  const lines = catchUpLines(e.catchUp);
  if (!lines) return { title: STATUS_TITLE[e.status], body: e.title };
  const body = lines.ask
    ? [`Asks: ${lines.ask}`, lines.did].filter(Boolean).join("\n")
    : (lines.raw ?? lines.did ?? e.title);
  return { title: `${STATUS_TITLE[e.status]} · ${e.title}`, body };
}

const TRAY_MAX = 10;

/** The menu-bar thread items, longest wait first. `url: null` means "show the window". */
export function trayItems(threads: NeedsYouThread[]): { label: string; url: string | null }[] {
  const sorted = threads.toSorted((a, b) => bySince(a.since, b.since));
  const items: { label: string; url: string | null }[] = sorted.slice(0, TRAY_MAX).map((t) => {
    const ask = catchUpLines(t.catchUp)?.ask;
    return {
      label: `${STATUS_TITLE[t.status]} · ${t.title}${ask ? ` — ${ask}` : ""}`,
      url: threadUrl(t.environmentId, t.id),
    };
  });
  if (sorted.length > TRAY_MAX) items.push({ label: `+${sorted.length - TRAY_MAX} more… (open tree)`, url: null });
  return items;
}

const parseVersion = (version: string) => {
  const parts = version.replace(/^v/, "").split(".");
  return parts.length === 3 && parts.every((p) => /^\d+$/.test(p)) ? parts.map(Number) : null;
};

/** True when `latest` is a higher `X.Y.Z` version than `current`. A leading `v` is allowed. Anything else is false. */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  const i = a.findIndex((n, k) => n !== b[k]);
  return i !== -1 && a[i] > b[i];
}

const GitHubUrl = v.pipe(v.string(), v.startsWith("https://github.com/"));
const Release = v.object({
  tag_name: v.string(),
  html_url: GitHubUrl,
  assets: v.optional(v.array(v.object({ name: v.string(), browser_download_url: GitHubUrl }))),
  body: v.optional(v.nullable(v.string())),
});

/**
 * The version, page, app zip and notes of a GitHub latest-release payload, or null when it has another shape.
 * `zip` is null when the release has no `.zip` asset.
 */
export function parseRelease(raw: unknown): { version: string; url: string; zip: string | null; notes: string } | null {
  const r = v.safeParse(Release, raw);
  if (!r.success) return null;
  const zip = r.output.assets?.find((a) => a.name.endsWith(".zip"))?.browser_download_url ?? null;
  return {
    version: r.output.tag_name.replace(/^v/, ""),
    url: r.output.html_url,
    zip,
    notes: releaseNotes(r.output.body ?? ""),
  };
}

/** The list items of GitHub's generated release notes as plain-text bullets, without the "by @user in <PR url>" tail. */
export function releaseNotes(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((l) => /^\s*[*-] /.test(l))
    .map((l) => `• ${l.replace(/^\s*[*-] /, "").replace(/ by @\S+ in https:\/\/\S+$/, "")}`)
    .join("\n");
}

type Release = NonNullable<ReturnType<typeof parseRelease>>;

const CHECK_GAP_MS = 60_000;

export const installing = (state: UpdateState) => state.install !== null && state.install.stage !== "failed";

/** False while a check or an install runs, and, unless `force`, within 60 s of the last good reply. */
export function shouldCheck(state: UpdateState, now: number, force: boolean): boolean {
  if (state.checking || installing(state)) return false;
  return force || state.checkedAt === null || now - Date.parse(state.checkedAt) >= CHECK_GAP_MS;
}

/**
 * The state after a check. `reply` is the parsed release, or "failed" for a fetch error, a bad status or
 * a reply that does not parse. A failed check keeps the known release.
 */
export function afterCheck(
  state: UpdateState,
  reply: Release | "failed",
  currentVersion: string,
  now: number,
  canInstall: boolean,
): UpdateState {
  if (reply === "failed") return { ...state, checking: false, checkFailed: true };
  const newer = isNewer(reply.version, currentVersion);
  return {
    ...state,
    checking: false,
    checkFailed: false,
    checkedAt: new Date(now).toISOString(),
    release: newer ? { version: reply.version, canInstall: canInstall && reply.zip !== null } : null,
  };
}

/** The text of the update item in the app menu and the menu-bar menu. */
export function updateMenuLabel(state: UpdateState): string {
  const { install, release } = state;
  if (install?.stage === "downloading")
    return install.progress === null
      ? "Downloading Update…"
      : `Downloading Update… ${Math.round(install.progress * 100)}%`;
  if (install?.stage === "unpacking") return "Installing Update…";
  if (install?.stage === "restarting") return "Restarting…";
  if (install?.stage === "failed") return "Update Failed: Open Release Page…";
  return release ? `Update available: v${release.version}…` : "Check for Updates…";
}
