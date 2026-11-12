import { describe, expect, test } from "bun:test";
import { countAttention, needsYou, onlyNeedsYou } from "../src/page/attention.ts";
import type { Branch, Status, ThreadNode } from "../src/shared/tree.ts";

const thread = (id: string, status: Status, children: ThreadNode[] = []): ThreadNode => ({
  id,
  href: `/${id}`,
  title: id,
  key: null,
  status,
  phrase: status,
  since: null,
  raw: status,
  updatedAt: "2026-11-12T12:00:00.000Z",
  settled: false,
  input: false,
  snoozedUntil: null,
  stack: null,
  prs: [],
  children,
});
const branch = (id: string, threads: ThreadNode[], branches: Branch[] = []): Branch => ({
  id,
  label: id,
  branches,
  threads,
});
const ids = (ts: ThreadNode[]) => ts.map((t) => t.id);

describe("countAttention", () => {
  test("buckets the eleven statuses, nested threads included", () => {
    const tree = [
      branch("p", [
        thread("a", "needs-input"),
        thread("b", "working"),
        thread("c", "starting"),
        thread("d", "waiting"),
        thread("e", "plan-ready"),
        thread("f", "your-turn"),
        thread("g", "done"),
        thread("h", "failed"),
        thread("i", "snoozed", [thread("j", "interrupted")]),
        thread("k", "idle"),
      ]),
    ];
    expect(countAttention(tree)).toEqual({ needYou: 2, working: 3, yourTurn: 1, stopped: 2 });
  });

  test("an empty tree gives zeros", () => {
    expect(countAttention([])).toEqual({ needYou: 0, working: 0, yourTurn: 0, stopped: 0 });
  });
});

describe("needsYou", () => {
  test("true for the three statuses", () => {
    expect(needsYou("needs-input")).toBe(true);
    expect(needsYou("plan-ready")).toBe(true);
    expect(needsYou("your-turn")).toBe(true);
  });
  test("false for working and done", () => {
    expect(needsYou("working")).toBe(false);
    expect(needsYou("done")).toBe(false);
  });
});

describe("onlyNeedsYou", () => {
  test("drops a thread with no match", () => {
    const out = onlyNeedsYou([branch("p", [thread("a", "working"), thread("b", "your-turn")])]);
    expect(ids(out[0]!.threads)).toEqual(["b"]);
  });

  test("keeps a spawner when a nested thread matches, with only the matches", () => {
    const spawner = thread("s", "idle", [thread("m1", "working"), thread("m2", "your-turn")]);
    const out = onlyNeedsYou([branch("p", [spawner])]);
    expect(ids(out[0]!.threads)).toEqual(["s"]);
    expect(ids(out[0]!.threads[0]!.children)).toEqual(["m2"]);
  });

  test("keeps a matching thread and drops its children that do not match", () => {
    const out = onlyNeedsYou([branch("p", [thread("a", "needs-input", [thread("c", "working")])])]);
    expect(ids(out[0]!.threads)).toEqual(["a"]);
    expect(out[0]!.threads[0]!.children).toEqual([]);
  });

  test("drops a group with no thread left, and a project with no group left", () => {
    const tree = [
      branch("p1", [], [branch("g1", [thread("a", "working")])]),
      branch("p2", [thread("b", "done")]),
    ];
    expect(onlyNeedsYou(tree)).toEqual([]);
  });

  test("keeps the nested group and the project of a match", () => {
    const tree = [branch("p", [], [branch("g", [thread("a", "plan-ready")])])];
    const out = onlyNeedsYou(tree);
    expect(out[0]!.id).toBe("p");
    expect(out[0]!.branches[0]!.id).toBe("g");
    expect(ids(out[0]!.branches[0]!.threads)).toEqual(["a"]);
  });

  test("does not change the input", () => {
    const tree = [branch("p", [thread("s", "idle", [thread("m", "your-turn"), thread("w", "working")])])];
    const copy = structuredClone(tree);
    onlyNeedsYou(tree);
    expect(tree).toEqual(copy);
  });
});
