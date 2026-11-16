import { readFileSync, writeFileSync } from "node:fs";

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
