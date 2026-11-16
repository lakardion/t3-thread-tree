import { describe, expect, test } from "bun:test";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseToken, readToken, writeToken } from "../src/server/token.ts";

describe("parseToken", () => {
  test("is null for a non-string", () => {
    expect(parseToken(1)).toBeNull();
    expect(parseToken(undefined)).toBeNull();
  });
  test("is null for empty or blank", () => {
    expect(parseToken("")).toBeNull();
    expect(parseToken("  \n")).toBeNull();
  });
  test("is null for inner whitespace", () => {
    expect(parseToken("a b")).toBeNull();
  });
  test("is null over 4096 bytes", () => {
    expect(parseToken("a".repeat(4097))).toBeNull();
    expect(parseToken("a".repeat(4096))).toBe("a".repeat(4096));
  });
  test("trims the ends", () => {
    expect(parseToken("abc\n")).toBe("abc");
  });
});

describe("readToken and writeToken", () => {
  const dir = mkdtempSync(join(tmpdir(), "desktop-token-"));
  test("round trips with mode 0600", () => {
    const file = join(dir, "token");
    writeToken(file, "abc");
    expect(readToken(file)).toBe("abc");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  test("tightens an old 0644 file", () => {
    const file = join(dir, "old");
    writeFileSync(file, "x", { mode: 0o644 });
    writeToken(file, "abc");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  test("creates a missing folder", () => {
    const file = join(dir, "new", "token");
    writeToken(file, "abc");
    expect(readToken(file)).toBe("abc");
  });
  test("is undefined for a missing file", () => {
    expect(readToken(join(dir, "missing"))).toBeUndefined();
  });
});
