import { chmodSync, readFileSync, writeFileSync } from "node:fs";

import * as v from "valibot";

import type { NeedsYouThread, NotifyEvent } from "../shared/desktop.ts";

const Size = v.object({
  width: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  height: v.pipe(v.number(), v.finite(), v.gtValue(0)),
});
const Place = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) });

export type Rect = v.InferOutput<typeof Size> & v.InferOutput<typeof Place>;
export type Settings = { muted: boolean };

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

/** A clean copy of the notification events, or `null` when `raw` is not an array of at most 10 well-formed events. */
export function parseNotify(raw: unknown): NotifyEvent[] | null {
  if (!Array.isArray(raw) || raw.length > 10) return null;
  const out: NotifyEvent[] = [];
  for (const item of raw as unknown[]) {
    const e = item as Record<string, unknown> | null;
    if (typeof e !== "object" || e === null) return null;
    if (e.kind === "summary" && typeof e.count === "number" && Number.isInteger(e.count) && e.count > 0) {
      out.push({ kind: "summary", count: e.count });
    } else if (
      e.kind === "thread" &&
      typeof e.threadId === "string" &&
      typeof e.environmentId === "string" &&
      typeof e.title === "string" &&
      (e.status === "needs-input" || e.status === "plan-ready" || e.status === "failed")
    ) {
      out.push({
        kind: "thread",
        threadId: e.threadId,
        environmentId: e.environmentId,
        title: e.title,
        status: e.status,
      });
    } else return null;
  }
  return out;
}

export function parseSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    muted: typeof r.muted === "boolean" ? r.muted : false,
  };
}

/** Saved window bounds. The position stays only when the window touches a screen. */
export function parseBounds(raw: unknown, screens: Rect[]): Partial<Rect> {
  const size = v.safeParse(Size, raw);
  if (!size.success) return {};
  const { width, height } = size.output;
  const place = v.safeParse(Place, raw);
  if (!place.success) return { width, height };
  const { x, y } = place.output;
  const visible = screens.some((s) => x < s.x + s.width && x + width > s.x && y < s.y + s.height && y + height > s.y);
  return visible ? { x, y, width, height } : { width, height };
}
