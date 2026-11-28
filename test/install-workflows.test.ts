import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { entryFile, installWorkflows } from "../scripts/install-workflows.ts";

function setup(files: string[] = ["land.ts"]) {
  const root = mkdtempSync(join(tmpdir(), "install-workflows-"));
  const repo = join(root, "repo");
  const dir = join(root, "t3");
  mkdirSync(join(repo, "workflows"), { recursive: true });
  for (const f of files) writeFileSync(join(repo, "workflows", f), "export default 1;\n");
  writeFileSync(join(repo, "workflows", "README.md"), "");
  return { repo, dir };
}

describe("installWorkflows", () => {
  test("links the repo folder and writes one entry per workflow", () => {
    const { repo, dir } = setup(["land.ts", "review.mts"]);
    installWorkflows(repo, dir);
    expect(readlinkSync(join(dir, "t3-thread-tree"))).toBe(join(repo, "workflows"));
    expect(readFileSync(join(dir, "land.ts"), "utf8")).toBe(entryFile("land.ts"));
    expect(readFileSync(join(dir, "review.mts"), "utf8")).toBe(entryFile("review.mts"));
    expect(existsSync(join(dir, "README.md"))).toBe(false);
  });

  test("a second run changes nothing", () => {
    const { repo, dir } = setup();
    installWorkflows(repo, dir);
    expect(installWorkflows(repo, dir)).toEqual(["up to date: land.ts"]);
  });

  test("keeps a user file with the same name", () => {
    const { repo, dir } = setup();
    mkdirSync(dir);
    writeFileSync(join(dir, "land.ts"), "mine");
    expect(installWorkflows(repo, dir)).toContain("kept your file: land.ts");
    expect(readFileSync(join(dir, "land.ts"), "utf8")).toBe("mine");
  });

  test("writes no entry when another file imports the workflow", () => {
    const { repo, dir } = setup();
    mkdirSync(dir);
    writeFileSync(join(dir, "land-wiki.ts"), 'import l from "./t3-thread-tree/land.ts";');
    expect(installWorkflows(repo, dir)).toContain("kept land-wiki.ts, it imports land.ts");
    expect(existsSync(join(dir, "land.ts"))).toBe(false);
  });

  test("removes stale entries and stale links into the repo", () => {
    const { repo, dir } = setup();
    mkdirSync(dir);
    writeFileSync(join(dir, "gone.ts"), entryFile("gone.ts"));
    symlinkSync(join(repo, "workflows", "old.ts"), join(dir, "old.ts"));
    symlinkSync("/elsewhere/x.ts", join(dir, "x.ts"));
    installWorkflows(repo, dir);
    expect(existsSync(join(dir, "gone.ts"))).toBe(false);
    expect(existsSync(join(dir, "old.ts"))).toBe(false);
    expect(readlinkSync(join(dir, "x.ts"))).toBe("/elsewhere/x.ts");
  });

  test("moves the folder link to this checkout", () => {
    const { repo, dir } = setup();
    mkdirSync(dir);
    symlinkSync("/old/checkout/workflows", join(dir, "t3-thread-tree"));
    installWorkflows(repo, dir);
    expect(readlinkSync(join(dir, "t3-thread-tree"))).toBe(join(repo, "workflows"));
  });

  test("refuses a real folder in place of the link", () => {
    const { repo, dir } = setup();
    mkdirSync(join(dir, "t3-thread-tree"), { recursive: true });
    expect(() => installWorkflows(repo, dir)).toThrow("not a symlink");
  });

  test("refuses a workflows path that is a file", () => {
    const { repo, dir } = setup();
    writeFileSync(dir, "");
    expect(() => installWorkflows(repo, dir)).toThrow("not a folder");
  });
});
