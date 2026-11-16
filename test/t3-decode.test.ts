import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import { decodeItem, decodeThread, type StreamEvent, type Thread } from "../src/server/t3.ts";

/** The decode of a thread that has only an id. */
const bare: Thread = {
  id: "a",
  projectId: "",
  title: "",
  status: "idle",
  parentThreadId: null,
  sideChat: false,
  pending: null,
  guestMessages: null,
  activityRunStatus: null,
  blockedOnThreadWait: false,
  hasPlan: false,
  interactionMode: null,
  latestRunCompletedAt: null,
  lastVisitedAt: null,
  activityRunStartedAt: null,
  latestRunStartedAt: null,
  settledAt: null,
  snoozedUntil: null,
  updatedAt: "",
  gone: false,
  prs: [],
  lastError: null,
  lastErrorClass: null,
  lastErrorCode: null,
  limitResetAt: null,
  autoResume: false,
  stopRequested: false,
  model: null,
  branch: null,
  worktreePath: null,
  forkedFromThreadId: null,
  delegatedFromTitle: null,
  linkLabel: null,
  createdBy: null,
  creationSource: null,
  createdAt: null,
  goal: null,
  tags: [],
  pinned: false,
};

const full = {
  id: "a",
  projectId: "p1",
  title: "SHOP-1 Fix",
  status: "running",
  lineage: { parentThreadId: "root", sideChat: true, rootThreadId: "root" },
  pendingRuntimeRequest: { kind: "approval", createdAt: "2026-11-12T08:00:00.000Z", blocking: true },
  pendingGuestMessageCount: 2,
  activityRunStatus: "active",
  blockedOnThreadWait: true,
  hasActionableProposedPlan: true,
  interactionMode: "plan",
  latestRunCompletedAt: "t1",
  lastVisitedAt: "t2",
  activityRunStartedAt: "t3",
  latestRunStartedAt: "t4",
  settledAt: "t5",
  snoozedUntil: "t6",
  updatedAt: "t7",
  archivedAt: null,
  deletedAt: null,
  pullRequests: [
    {
      number: 7,
      url: "https://github.com/o/r/pull/7",
      source: "linked",
      stack: { base: "main" },
      snapshot: {
        state: "merged",
        isDraft: true,
        checksState: "passing",
        reviewDecision: "approved",
        mergeability: "clean",
        title: "Fix",
        additions: 10,
        deletions: 2,
        changedFiles: 3,
      },
    },
  ],
  lastError: "boom",
  lastErrorClass: "limit",
  lastErrorCode: "429",
  limitRecovery: { resetAt: "t8", autoResume: true },
  latestRunStopRequested: true,
  modelSelection: { model: "opus" },
  branch: "feat/x",
  worktreePath: `${homedir()}/w/x`,
  forkedFrom: { threadId: "f" },
  delegatedFrom: { title: "Parent" },
  linkOrigin: { label: "Linear" },
  createdBy: "user",
  creationSource: "cli",
  createdAt: "t9",
  goal: { objective: "ship", status: "active", extra: 1 },
  tags: ["x", 3, "y"],
  pinnedAt: "t10",
  unknownField: { deep: true },
};

describe("decodeThread", () => {
  test("decodes every field of a full payload", () => {
    expect(decodeThread(full)).toEqual({
      id: "a",
      projectId: "p1",
      title: "SHOP-1 Fix",
      status: "running",
      parentThreadId: "root",
      sideChat: true,
      pending: { kind: "approval", createdAt: "2026-11-12T08:00:00.000Z", blocking: true },
      guestMessages: 2,
      activityRunStatus: "active",
      blockedOnThreadWait: true,
      hasPlan: true,
      interactionMode: "plan",
      latestRunCompletedAt: "t1",
      lastVisitedAt: "t2",
      activityRunStartedAt: "t3",
      latestRunStartedAt: "t4",
      settledAt: "t5",
      snoozedUntil: "t6",
      updatedAt: "t7",
      gone: false,
      prs: [
        {
          n: 7,
          url: "https://github.com/o/r/pull/7",
          source: "linked",
          state: "merged",
          draft: true,
          checks: "passing",
          review: "approved",
          mergeability: "clean",
          stackBase: "main",
          title: "Fix",
          additions: 10,
          deletions: 2,
          changedFiles: 3,
        },
      ],
      lastError: "boom",
      lastErrorClass: "limit",
      lastErrorCode: "429",
      limitResetAt: "t8",
      autoResume: true,
      stopRequested: true,
      model: "opus",
      branch: "feat/x",
      worktreePath: "~/w/x",
      forkedFromThreadId: "f",
      delegatedFromTitle: "Parent",
      linkLabel: "Linear",
      createdBy: "user",
      creationSource: "cli",
      createdAt: "t9",
      goal: { objective: "ship", status: "active" },
      tags: ["x", "y"],
      pinned: true,
    });
  });

  test("missing fields fall back to defaults", () => {
    expect(decodeThread({ id: "a" })).toEqual(bare);
  });

  test("wrong-typed fields fall back to defaults", () => {
    const wrong = Object.fromEntries(
      Object.keys(full)
        .filter((k) => k !== "id" && k !== "archivedAt" && k !== "deletedAt" && k !== "pendingRuntimeRequest")
        .map((k) => [k, typeof full[k as keyof typeof full] === "number" ? "x" : 5]),
    );
    expect(decodeThread({ id: "a", ...wrong })).toEqual(bare);
  });

  test("nested wrong types fall back per field", () => {
    const t = decodeThread({
      id: "a",
      lineage: { parentThreadId: 1, sideChat: "yes" },
      pendingRuntimeRequest: { kind: 1, createdAt: null, blocking: "no" },
      limitRecovery: { resetAt: 1, autoResume: 1 },
      goal: { objective: "ship" },
      tags: "x",
      pinnedAt: 1,
      archivedAt: null,
      deletedAt: "",
    });
    expect(t).toEqual({ ...bare, pending: { kind: null, createdAt: null, blocking: null } });
  });

  test("a truthy non-object pending request decodes to empty fields", () => {
    expect(decodeThread({ id: "a", pendingRuntimeRequest: "x" })!.pending).toEqual({
      kind: null,
      createdAt: null,
      blocking: null,
    });
    expect(decodeThread({ id: "a", pendingRuntimeRequest: 0 })!.pending).toBeNull();
  });

  test("limitResetAt prefers usageLimitResetAt", () => {
    expect(decodeThread({ id: "a", usageLimitResetAt: "u", limitRecovery: { resetAt: "r" } })!.limitResetAt).toBe("u");
    expect(decodeThread({ id: "a", usageLimitResetAt: 1, limitRecovery: { resetAt: "r" } })!.limitResetAt).toBe("r");
  });

  test("any truthy archivedAt or deletedAt marks it gone", () => {
    expect(decodeThread({ id: "a", archivedAt: "t" })!.gone).toBe(true);
    expect(decodeThread({ id: "a", deletedAt: 1 })!.gone).toBe(true);
    expect(decodeThread({ id: "a", archivedAt: 0, deletedAt: "" })!.gone).toBe(false);
  });

  test("an empty string pinnedAt still pins", () => {
    expect(decodeThread({ id: "a", pinnedAt: "" })!.pinned).toBe(true);
  });

  test("pull requests without a number are dropped; missing snapshot counts as open", () => {
    const t = decodeThread({
      id: "a",
      pullRequests: [null, "x", { url: "u" }, { number: "1" }, { number: 0 }, { number: 2, snapshot: 5, stack: "s" }],
    });
    const empty = {
      url: "",
      source: "",
      state: "open",
      draft: null,
      checks: null,
      review: null,
      mergeability: null,
      stackBase: null,
      title: null,
      additions: null,
      deletions: null,
      changedFiles: null,
    };
    expect(t!.prs).toEqual([
      { n: 0, ...empty },
      { n: 2, ...empty },
    ]);
  });

  test("returns null without a usable id", () => {
    for (const raw of [null, undefined, 1, "a", [], {}, { id: "" }, { id: 1 }]) expect(decodeThread(raw)).toBeNull();
  });

  test("worktreePath is shortened only at a path boundary", () => {
    expect(decodeThread({ id: "a", worktreePath: homedir() })!.worktreePath).toBe("~");
    expect(decodeThread({ id: "a", worktreePath: `${homedir()}x` })!.worktreePath).toBe(`${homedir()}x`);
  });
});

describe("decodeItem", () => {
  test("snapshot drops bad threads and projects", () => {
    expect(
      decodeItem({
        kind: "snapshot",
        snapshot: {
          threads: [{ id: "a" }, { id: "" }, null, 3],
          projects: [
            { id: "p1", title: "frontend", repositoryIdentity: { owner: "acme", name: "fe" } },
            { id: "p2", title: 5, repositoryIdentity: { owner: "acme" } },
            { id: "p3", repositoryIdentity: "x" },
            { title: "no id" },
            null,
          ],
        },
      }),
    ).toEqual({
      kind: "snapshot",
      fresh: false,
      threads: [bare],
      projects: [
        ["p1", { title: "frontend", repo: "acme/fe" }],
        ["p2", { title: "p2", repo: null }],
        ["p3", { title: "p3", repo: null }],
      ],
    });
  });

  test("snapshot with missing or wrong-typed lists is empty", () => {
    const empty: StreamEvent = { kind: "snapshot", fresh: false, threads: [], projects: [] };
    expect(decodeItem({ kind: "snapshot" })).toEqual(empty);
    expect(decodeItem({ kind: "snapshot", snapshot: { threads: "x", projects: {} } })).toEqual(empty);
  });

  test("thread.updated maps to thread or removal", () => {
    expect(decodeItem({ kind: "thread.updated", thread: { id: "a" } })).toEqual({ kind: "thread", thread: bare });
    expect(decodeItem({ kind: "thread.updated", location: "archive", thread: { id: "a" } })).toEqual({
      kind: "thread.removed",
      id: "a",
    });
    expect(decodeItem({ kind: "thread.updated", thread: { id: 1 } })).toBeNull();
  });

  test("removals and project updates need an id", () => {
    expect(decodeItem({ kind: "thread.removed", threadId: "a" })).toEqual({ kind: "thread.removed", id: "a" });
    expect(decodeItem({ kind: "thread.removed", threadId: "" })).toBeNull();
    expect(decodeItem({ kind: "project.removed", projectId: "p" })).toEqual({ kind: "project.removed", id: "p" });
    expect(decodeItem({ kind: "project.removed" })).toBeNull();
    expect(decodeItem({ kind: "project.updated", project: { id: "p", title: "T" } })).toEqual({
      kind: "project",
      id: "p",
      project: { title: "T", repo: null },
    });
    expect(decodeItem({ kind: "project.updated", project: "p" })).toBeNull();
  });

  test("unknown kinds and non-objects are null", () => {
    for (const raw of [null, 1, "snapshot", [], {}, { kind: "other" }]) expect(decodeItem(raw)).toBeNull();
  });
});
