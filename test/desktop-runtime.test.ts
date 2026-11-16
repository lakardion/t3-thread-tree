import { describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:net";

import { fallbackPath, pickPort, restartDelay, shellPath } from "../src/desktop/runtime.ts";

const listen = (port: number) =>
  new Promise<Server>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
const close = (s: Server) => new Promise((resolve) => s.close(resolve));

describe("pickPort", () => {
  test("takes a free start port, skips a held one", async () => {
    const probe = await listen(0);
    const p = (probe.address() as { port: number }).port;
    await close(probe);
    expect(await pickPort(p)).toBe(p);

    const held = await listen(p);
    const next = await pickPort(p);
    expect(next).toBeGreaterThan(p);
    await close(await listen(next));
    await close(held);
  });
});

describe("shellPath", () => {
  test("picks the PATH line and ignores MANPATH", () => {
    expect(shellPath("HOME=/h\nMANPATH=/m\nPATH=/a:/b\nX=1")).toBe("/a:/b");
  });
  test("is null with no PATH line", () => {
    expect(shellPath("MANPATH=/m\nHOME=/h")).toBeNull();
  });
});

describe("fallbackPath", () => {
  test("appends the three folders", () => {
    expect(fallbackPath("/usr/bin", "/h")).toBe("/usr/bin:/opt/homebrew/bin:/h/.local/bin:/h/.bun/bin");
  });
  test("works with no PATH", () => {
    expect(fallbackPath(undefined, "/h")).toBe("/opt/homebrew/bin:/h/.local/bin:/h/.bun/bin");
  });
});

describe("restartDelay", () => {
  test("doubles from 500 ms and caps at 10 s", () => {
    expect([0, 1, 2, 3].map(restartDelay)).toEqual([500, 1000, 2000, 4000]);
    expect(restartDelay(5)).toBe(10_000);
    expect(restartDelay(50)).toBe(10_000);
  });
});
