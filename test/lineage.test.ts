import { expect, test } from "bun:test";

import { needsScan } from "../src/server/lineage.ts";

const t = (id: string, settled = false, gone = false) => ({ id, settledAt: settled ? "2026-01-01" : null, gone });
const of = (m: Record<string, string>) => (id: string) => m[id];

test("needsScan: only for threads the requested view walks", () => {
  const threads = [t("a"), t("b", true), t("c", true), t("d", false, true)];
  expect(needsScan(new Set(), threads, of({}), true)).toBe(false);
  expect(needsScan(new Set(["c"]), threads, of({}), true)).toBe(true);
  expect(needsScan(new Set(["c"]), threads, of({}), false)).toBe(false);
  expect(needsScan(new Set(["a"]), threads, of({}), false)).toBe(true);
  expect(needsScan(new Set(["d"]), threads, of({}), false)).toBe(false);
  /** A settled spawner on the chain of an active thread. */
  expect(needsScan(new Set(["c"]), threads, of({ a: "b", b: "c" }), false)).toBe(true);
  expect(needsScan(new Set(["c"]), threads, of({ a: "b", b: "a" }), false)).toBe(false);
});
