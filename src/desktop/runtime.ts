import { createServer } from "node:net";

import type { NeedsYouThread, NotifyStatus } from "../shared/desktop.ts";

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

const TRAY_MAX = 10;

/** The menu-bar thread items, longest wait first. `url: null` means "show the window". */
export function trayItems(threads: NeedsYouThread[]): { label: string; url: string | null }[] {
  /** ISO timestamps sort the same as text. */
  const sorted = threads.toSorted((a, b) =>
    a.since === b.since ? 0 : a.since === null ? 1 : b.since === null ? -1 : a.since < b.since ? -1 : 1,
  );
  const items: { label: string; url: string | null }[] = sorted.slice(0, TRAY_MAX).map((t) => ({
    label: `${STATUS_TITLE[t.status]} · ${t.title}`,
    url: threadUrl(t.environmentId, t.id),
  }));
  if (sorted.length > TRAY_MAX) items.push({ label: `+${sorted.length - TRAY_MAX} more… (open tree)`, url: null });
  return items;
}

const parseVersion = (v: string) => {
  const parts = v.replace(/^v/, "").split(".");
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

/** The version and page of a GitHub latest-release payload, or null when it has another shape. */
export function parseRelease(raw: unknown): { version: string; url: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { tag_name, html_url } = raw as Record<string, unknown>;
  if (typeof tag_name !== "string" || typeof html_url !== "string") return null;
  if (!html_url.startsWith("https://github.com/")) return null;
  return { version: tag_name.replace(/^v/, ""), url: html_url };
}
