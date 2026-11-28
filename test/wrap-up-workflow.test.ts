import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { entryFile } from "../scripts/install-workflows.ts";
import { resolveEntries, scanFields, scanSettings } from "../src/server/workflow-start.ts";
import {
  type Facts,
  keepReason,
  otherThreadIds,
  planWrapUp,
  question,
  recheck,
  summary,
} from "../workflows/lib/wrap-up.ts";

const OID = "a".repeat(40);

const facts = (over: Partial<Facts> = {}): Facts => ({
  id: "t1",
  title: "Thread one",
  projectId: "p1",
  worktreePath: "/wt/one",
  branch: "feat",
  idle: true,
  gitDir: "/repo/.git",
  head: "refs/heads/feat",
  dirty: false,
  busy: null,
  tip: OID,
  merge: { state: "MERGED", headRefOid: OID },
  ignored: [],
  error: null,
  ...over,
});

describe("recheck", () => {
  const removal = { branch: "feat", headRefOid: OID };
  const now = { idle: true, head: "refs/heads/feat", dirty: false, tip: OID };

  test("gives null when nothing changed", () => {
    expect(recheck(now, removal)).toBeNull();
  });

  test.each([
    [{ idle: false }, "still running"],
    [{ head: "refs/heads/other" }, "HEAD is not on feat"],
    [{ head: null }, "HEAD is not on feat"],
    [{ dirty: true }, "uncommitted changes"],
    [{ tip: "b".repeat(40) }, "branch moved"],
  ])("gives the reason for a late change %#", (change, reason) => {
    expect(recheck({ ...now, ...change }, removal)).toBe(reason);
  });
});

describe("keepReason", () => {
  test("passes a merged, clean thread", () => {
    expect(keepReason(facts())).toBeNull();
  });

  test.each([
    [{ error: "gh failed: boom" }, "gh failed: boom"],
    [{ worktreePath: null }, "main checkout"],
    [{ idle: false }, "still running"],
    [{ head: null }, "HEAD is not on feat"],
    [{ head: "refs/heads/other" }, "HEAD is not on feat"],
    [{ busy: "rebase-merge" }, "rebase-merge in progress"],
    [{ dirty: true }, "uncommitted changes"],
    [{ merge: null }, "no PR"],
    [{ merge: { state: "CLOSED", headRefOid: OID } }, "PR is closed"],
    [{ merge: { state: "OPEN", headRefOid: OID } }, "PR is open"],
    [{ tip: "b".repeat(40) }, "branch has commits after the merged PR head"],
  ])("keeps a thread %#", (change, reason) => {
    expect(keepReason(facts(change))).toBe(reason);
  });
});

describe("planWrapUp", () => {
  test("removes one worktree for two passing threads on it", () => {
    const plan = planWrapUp([facts(), facts({ id: "t2", title: "Two" })], [], []);
    expect(plan.kept).toEqual([]);
    expect(plan.removals).toHaveLength(1);
    expect(plan.removals[0].threadIds).toEqual(["t1", "t2"]);
  });

  test("keeps both threads of a shared worktree when one fails", () => {
    const plan = planWrapUp([facts(), facts({ id: "t2", title: "Two", dirty: true })], [], []);
    expect(plan.removals).toEqual([]);
    expect(plan.kept.map((k) => k.reason)).toEqual([
      "shares the worktree with a thread that keeps it",
      "uncommitted changes",
    ]);
  });

  test("keeps a worktree that another thread uses or that it cannot check", () => {
    const a = facts({ worktreePath: "/wt/a" });
    const b = facts({ id: "t2", title: "Two", worktreePath: "/wt/b" });
    const plan = planWrapUp([a, b], ["/wt/a"], ["/wt/b"]);
    expect(plan.removals).toEqual([]);
    expect(plan.kept.map((k) => k.reason)).toEqual([
      "another thread uses this worktree",
      "cannot tell if another thread uses this worktree",
    ]);
  });

  test("keeps a thread with no worktree for its own reason", () => {
    const plan = planWrapUp([facts({ worktreePath: null, branch: null })], [], []);
    expect(plan.kept).toEqual([{ id: "t1", title: "Thread one", reason: "main checkout" }]);
  });
});

describe("otherThreadIds", () => {
  const list = [
    { threadId: "a", title: "A", settled: false },
    { threadId: "b", title: "B", settled: true },
    { threadId: "c", title: "C", settled: null },
    { threadId: "d", title: "D" },
  ];

  test("gives the unsettled threads that are not in the payload", () => {
    expect(otherThreadIds(list, ["c"])).toEqual(["a", "d"]);
  });

  test("gives null for a result that is not a list", () => {
    expect(otherThreadIds({ error: "x" }, [])).toBeNull();
    expect(otherThreadIds(null, [])).toBeNull();
  });
});

describe("question", () => {
  test("counts the checked threads in N and the removals in the title", () => {
    const plan = planWrapUp([facts(), facts({ id: "t2", title: "Two", worktreePath: "/wt/two", merge: null })], [], []);
    const q = question(plan, 2);
    expect(q.title).toBe("Wrap up 2 threads? 1 worktree and branch goes.");
    expect(q.data.keep).toEqual([{ thread: "Two", reason: "no PR" }]);
  });

  test("uses plural forms and a no-removal title", () => {
    const two = planWrapUp([facts(), facts({ id: "t2", worktreePath: "/wt/two" })], [], []);
    expect(question(two, 2).title).toBe("Wrap up 2 threads? 2 worktrees and branches go.");
    expect(question(planWrapUp([facts({ merge: null })], [], []), 1).title).toBe(
      "Wrap up 1 thread? No worktree or branch goes.",
    );
  });

  test("lists ignored files, capped at 20", () => {
    const ignored = Array.from({ length: 25 }, (_, i) => `f${i}`);
    const q = question(planWrapUp([facts({ ignored })], [], []), 1);
    const shown = q.data.remove[0].ignoredFiles;
    expect(shown).toHaveLength(21);
    expect(shown[20]).toBe("and 5 more");
  });
});

describe("summary", () => {
  test("lists kept threads and late re-check results", () => {
    const plan = planWrapUp(
      [
        facts(),
        facts({ id: "t2", title: "Two", worktreePath: "/wt/two", branch: "b2", head: "refs/heads/b2", dirty: true }),
        facts({ id: "t3", title: "Three", worktreePath: "/wt/three", branch: "b3", head: "refs/heads/b3" }),
      ],
      [],
      [],
    );
    const text = summary(plan, {
      remove: ["removed", "kept: HEAD is not on b3"],
      branch: ["deleted", null],
      settled: ["t1", "t2", "t3"],
      failed: [],
    });
    expect(text).toContain("**Worktrees removed:** `/wt/one`");
    expect(text).toContain("**Branches deleted:** `feat`");
    expect(text).toContain("**Threads settled:** 3");
    expect(text).toContain("- Two: uncommitted changes");
    expect(text).toContain("Worktree `/wt/three` kept: HEAD is not on b3");
  });
});

describe("workflow source scan", () => {
  const source = readFileSync(new URL("../workflows/wrap-up.ts", import.meta.url), "utf8");
  const files = resolveEntries([{ source: entryFile("wrap-up.ts"), workflows: ["wrap-up@1"] }], () => source);

  test("names only threadIds as a field", () => {
    expect(scanFields(files).get("wrap-up")).toEqual(["threadIds"]);
  });

  test("names the extra-prompt setting", () => {
    expect(scanSettings(files).get("wrap-up")).toEqual([
      { key: "settings/wrap-up/extra-prompt", field: "extra-prompt", type: "string" },
    ]);
  });
});
