import { chmodSync, readFileSync, writeFileSync } from "node:fs";

import type { NeedsYouThread } from "../shared/desktop.ts";

export type Rect = { x: number; y: number; width: number; height: number };
export type Settings = { alwaysOnTop: boolean };

/** The parsed JSON in `file`, or `undefined` when the file is missing or bad. */
export function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

export function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

/** The trimmed token, or `null` when `raw` is not a single-line string of at most 4096 bytes. */
export function parseToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (!token || /\s/.test(token) || Buffer.byteLength(token) > 4096) return null;
  return token;
}

/** The saved token, or `undefined` when the file is missing or holds no valid token. */
export function readToken(file: string): string | undefined {
  try {
    return parseToken(readFileSync(file, "utf8")) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Writes the token with mode `0600`. The `chmod` comes first because `mode` applies only to a new file. */
export function writeToken(file: string, token: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {}
  writeFileSync(file, token, { mode: 0o600 });
}

/** A clean copy of the Needs-you list, or `null` when `raw` is not an array of at most 500 well-formed threads. */
export function parseNeedsYou(raw: unknown): NeedsYouThread[] | null {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const out: NeedsYouThread[] = [];
  for (const item of raw as unknown[]) {
    const t = item as Record<string, unknown> | null;
    if (
      typeof t !== "object" ||
      t === null ||
      typeof t.id !== "string" ||
      typeof t.title !== "string" ||
      typeof t.environmentId !== "string" ||
      !(typeof t.since === "string" || t.since === null)
    ) {
      return null;
    }
    out.push({ id: t.id, title: t.title, environmentId: t.environmentId, since: t.since });
  }
  return out;
}

export function parseSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { alwaysOnTop: typeof r.alwaysOnTop === "boolean" ? r.alwaysOnTop : false };
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Saved window bounds. The position stays only when the window touches a screen. */
export function parseBounds(raw: unknown, screens: Rect[]): Partial<Rect> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const { x, y, width, height } = r;
  if (!positive(width) || !positive(height)) return {};
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { width, height };
  }
  const visible = screens.some((s) => x < s.x + s.width && x + width > s.x && y < s.y + s.height && y + height > s.y);
  return visible ? { x, y, width, height } : { width, height };
}
