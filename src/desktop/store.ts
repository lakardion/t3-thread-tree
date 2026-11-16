import { readFileSync, writeFileSync } from "node:fs";

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
