import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import * as v from "valibot";

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
