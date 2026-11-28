import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { needsScan, openLineage } from "../src/server/lineage.ts";

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

describe("firstMessage", () => {
  const dir = mkdtempSync(join(tmpdir(), "lineage-"));
  const path = join(dir, "statev2.sqlite");
  const db = new Database(path);
  db.run(`CREATE TABLE orchestration_v2_projection_messages (
    message_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, streaming INTEGER NOT NULL,
    created_at TEXT NOT NULL, payload_json TEXT NOT NULL)`);
  db.run(
    "CREATE TABLE orchestration_v2_projection_turn_items (thread_id TEXT, type TEXT, status TEXT, payload_json TEXT)",
  );
  const add = (message: string, thread: string, role: string, at: string, text: string) =>
    db.run("INSERT INTO orchestration_v2_projection_messages VALUES (?, ?, ?, 0, ?, ?)", [
      message,
      thread,
      role,
      at,
      JSON.stringify({ text }),
    ]);
  add("mcp:a", "mcp:a", "user", "2026-01-02", "launched");
  add("m0", "thread:mcp:b:1", "assistant", "2026-01-01", "assistant first");
  add("m2", "thread:mcp:b:1", "user", "2026-01-03", "second");
  add("m1", "thread:mcp:b:1", "user", "2026-01-02", "first");
  db.run(`CREATE TABLE orchestration_v2_projection_threads (
    thread_id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  db.run("INSERT INTO orchestration_v2_projection_threads VALUES ('old', 'Old root', 'p1', '2026-01-01')");
  db.close();
  const lineage = openLineage(path);

  test("row reads a thread table row by id, or null", () => {
    expect(lineage.row("old")).toEqual({ title: "Old root", projectId: "p1", createdAt: "2026-01-01" });
    expect(lineage.row("none")).toBeNull();
  });

  test("an mcp id is a primary-key lookup", () => {
    expect(lineage.firstMessage("mcp:a")).toBe("launched");
    expect(lineage.firstMessage("mcp:none")).toBeNull();
  });

  test("other ids give the oldest user message", () => {
    expect(lineage.firstMessage("thread:mcp:b:1")).toBe("first");
    expect(lineage.firstMessage("nope")).toBeNull();
  });
});
