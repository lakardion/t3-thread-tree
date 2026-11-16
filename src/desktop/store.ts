import { chmodSync, readFileSync, writeFileSync } from "node:fs";

import * as v from "valibot";

const Size = v.object({
  width: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  height: v.pipe(v.number(), v.finite(), v.gtValue(0)),
});
const Place = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) });

export type Rect = v.InferOutput<typeof Size> & v.InferOutput<typeof Place>;

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
