import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import * as v from "valibot";

import type { Conn } from "../shared/tree.ts";

const Token = v.pipe(v.string(), v.trim(), v.regex(/^\S+$/), v.maxBytes(4096));

/** The trimmed token, or `null` when `raw` is not a single-line string of at most 4096 bytes. */
export function parseToken(raw: unknown): string | null {
  const result = v.safeParse(Token, raw);
  return result.success ? result.output : null;
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
  mkdirSync(dirname(file), { recursive: true });
  try {
    chmodSync(file, 0o600);
  } catch {}
  writeFileSync(file, token, { mode: 0o600 });
}

/** The reply to a token save, from the first reconnect outcome. The token is saved in every case. */
export function tokenResponse(c: Conn | "timeout"): Response {
  if (c === "up") return new Response(null, { status: 204 });
  if (c === "unauthorized") return new Response("Saved, but T3 rejected the token.", { status: 401 });
  if (c === "down")
    return new Response("Saved, but T3 is not running. The app connects when T3 starts.", { status: 503 });
  return new Response("Saved, but T3 did not answer. The app keeps trying.", { status: 504 });
}
