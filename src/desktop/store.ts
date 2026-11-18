import { readFileSync, writeFileSync } from "node:fs";

import * as v from "valibot";

import {
  NeedsYouList,
  type NeedsYouThread,
  NotifyList,
  type NotifyEvent,
  OpenNextTitle,
  type UpNext,
  UpNextList,
} from "../shared/desktop.ts";

const Size = v.object({
  width: v.pipe(v.number(), v.finite(), v.gtValue(0)),
  height: v.pipe(v.number(), v.finite(), v.gtValue(0)),
});
const Place = v.object({ x: v.pipe(v.number(), v.finite()), y: v.pipe(v.number(), v.finite()) });

/** Each field falls back to its default when it is missing or has the wrong type. */
const SettingsSchema = v.fallback(v.object({ muted: v.fallback(v.boolean(), false) }), { muted: false });

export type Rect = v.InferOutput<typeof Size> & v.InferOutput<typeof Place>;
export type Settings = v.InferOutput<typeof SettingsSchema>;

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

/** A clean copy of the Needs-you list, or `null` when `raw` is not an array of at most 500 well-formed threads. */
export function parseNeedsYou(raw: unknown): NeedsYouThread[] | null {
  const result = v.safeParse(NeedsYouList, raw);
  return result.success ? result.output : null;
}

/** A clean copy of the notification events, or `null` when `raw` is not an array of at most 10 well-formed events. */
export function parseNotify(raw: unknown): NotifyEvent[] | null {
  const result = v.safeParse(NotifyList, raw);
  return result.success ? result.output : null;
}

/** The "Open next" title: a string, `null` for none, or `undefined` when `raw` is bad. */
export function parseOpenNext(raw: unknown): string | null | undefined {
  const result = v.safeParse(OpenNextTitle, raw);
  return result.success ? result.output : undefined;
}

/** A clean copy of the Up next list, or `null` when `raw` is not at most 500 well-formed rows and a target id or `null`. */
export function parseUpNext(raw: unknown): UpNext | null {
  const result = v.safeParse(UpNextList, raw);
  return result.success ? result.output : null;
}

const UpdatedSchema = v.object({ version: v.string(), notes: v.string(), url: v.string() });
export type Updated = v.InferOutput<typeof UpdatedSchema>;

/** The saved note on the update the app installed, or `null` when it is missing or bad. */
export function parseUpdated(raw: unknown): Updated | null {
  const result = v.safeParse(UpdatedSchema, raw);
  return result.success ? result.output : null;
}

export function parseSettings(raw: unknown): Settings {
  return v.parse(SettingsSchema, raw);
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
