import { describe, expect, test } from "bun:test";

import { runItems } from "../src/server/runs.ts";
import { decodeItem, decodeRunSteps, decodeRunsSnapshot, type RunsSnapshot } from "../src/server/t3.ts";
import { isRun } from "../src/shared/runs.ts";

const run = (runId: string, over: Partial<RunsSnapshot["runs"][number]> = {}): RunsSnapshot["runs"][number] => ({
  runId,
  workflow: "ship",
  title: `Run ${runId}`,
  status: "waiting",
  detail: null,
  retired: false,
  resumesAt: null,
  updatedAt: "2026-11-12T10:00:00.000Z",
  parentRunId: null,
  parentStep: null,
  startedAt: "2026-11-12T08:00:00.000Z",
  ...over,
});
const ask = (
  runId: string,
  over: Partial<RunsSnapshot["questions"][number]> = {},
): RunsSnapshot["questions"][number] => ({
  runId,
  name: "approve",
  title: "Approve?",
  choices: ["Yes", "No"],
  askedAt: "2026-11-12T09:00:00.000Z",
  thread: null,
  ...over,
});

describe("runItems", () => {
  test("keeps questions and paused runs that wait for a person", () => {
    const items = runItems(
      {
        runs: [
          run("p1", { status: "paused", detail: "boom\nstack" }),
          run("p2", { status: "paused", resumesAt: "2026-11-12T12:00:00.000Z" }),
          run("r1", { status: "running" }),
          run("w1", { status: "waiting" }),
          run("s1", { status: "skipped" }),
          run("c1", { status: "completed" }),
        ],
        questions: [ask("w1")],
      },
      "http://t3",
      "env",
    );
    expect(items.map((i) => i.id)).toEqual(["q:w1:approve", "p:p1"]);
  });

  test("a question takes its workflow and run title from the run, and its Wait from askedAt", () => {
    const [q] = runItems({ runs: [run("w 1")], questions: [ask("w 1")] }, "http://t3", "env");
    expect(q).toMatchObject({
      kind: "question",
      workflow: "ship",
      runTitle: "Run w 1",
      title: "Approve?",
      line: "Approve?",
      since: "2026-11-12T09:00:00.000Z",
      href: "http://t3/workflows?run=w%201",
      name: "approve",
      choices: ["Yes", "No"],
      threadHref: null,
    });
  });

  test("a question with an unknown run falls back to the run id", () => {
    const [q] = runItems({ runs: [], questions: [ask("gone")] }, "http://t3", "env");
    expect(q).toMatchObject({ workflow: "gone", runTitle: "gone" });
  });

  test("a paused run shows the first line of its failure and the time it was updated", () => {
    const [p] = runItems(
      { runs: [run("p1", { status: "paused", detail: "boom\nstack", retired: true })], questions: [] },
      "http://t3",
      "env",
    );
    expect(p).toMatchObject({ kind: "paused", title: "Run p1", line: "boom", detail: "boom\nstack", retired: true });
    expect(p.since).toBe("2026-11-12T10:00:00.000Z");
  });

  test("a paused run with no detail uses its title as the line", () => {
    const [p] = runItems({ runs: [run("p1", { status: "paused" })], questions: [] }, "http://t3", "env");
    expect(p.line).toBe("Run p1");
  });

  test("the thread link uses this environment when the thread has none", () => {
    const items = runItems(
      {
        runs: [],
        questions: [
          ask("a", { thread: { threadId: "t/1", environmentId: null } }),
          ask("b", { thread: { threadId: "t2", environmentId: "other" } }),
        ],
      },
      "http://t3",
      "env 1",
    );
    expect(items.map((i) => i.kind === "question" && i.threadHref)).toEqual([
      "t3code://threads/env%201/t%2F1",
      "t3code://threads/other/t2",
    ]);
  });

  test("isRun tells a run item from a thread node", () => {
    const [q] = runItems({ runs: [], questions: [ask("a")] }, "http://t3", "env");
    expect(isRun(q)).toBe(true);
    expect(isRun({ id: "t", href: "x" })).toBe(false);
  });
});

describe("decodeRunsSnapshot", () => {
  test("reads the fields the app needs", () => {
    expect(
      decodeRunsSnapshot({
        workflows: [],
        runs: [
          {
            runId: "r",
            workflow: "w",
            title: "T",
            status: "paused",
            detail: "d",
            retired: true,
            resumesAt: null,
            parentRunId: "p",
            parentStep: "review",
            startedAt: "2026-11-12T08:00:00.000Z",
          },
        ],
        questions: [
          {
            runId: "r",
            name: "n",
            askedAt: "2026-11-12T09:00:00.000Z",
            request: { title: "Q", choices: ["a", 1, "b"] },
            thread: { threadId: "t", environmentId: null },
          },
        ],
      }),
    ).toEqual({
      runs: [
        {
          runId: "r",
          workflow: "w",
          title: "T",
          status: "paused",
          detail: "d",
          retired: true,
          resumesAt: null,
          updatedAt: "",
          parentRunId: "p",
          parentStep: "review",
          startedAt: "2026-11-12T08:00:00.000Z",
        },
      ],
      questions: [
        {
          runId: "r",
          name: "n",
          title: "Q",
          choices: ["a", "b"],
          askedAt: "2026-11-12T09:00:00.000Z",
          thread: { threadId: "t", environmentId: null },
        },
      ],
      workflows: [],
      revision: null,
    });
  });

  test("drops junk entries and tolerates a bad snapshot", () => {
    expect(decodeRunsSnapshot({ runs: [null, {}, { runId: 1 }], questions: [{ runId: "r" }, 5] })).toEqual({
      runs: [],
      questions: [],
      workflows: [],
      revision: null,
    });
    expect(decodeRunsSnapshot("x")).toEqual({ runs: [], questions: [], workflows: [], revision: null });
  });

  test("reads the workflow summaries and the definition revision", () => {
    const s = decodeRunsSnapshot({
      workflows: [{ name: "w", version: 2, triggers: ["every 1h", 5] }, { version: 1 }, null],
      definition: { revision: 7 },
    });
    expect(s.workflows).toEqual([{ name: "w", version: 2, triggers: ["every 1h"] }]);
    expect(s.revision).toBe(7);
  });

  test("reads the workspace root of a project", () => {
    expect(decodeItem({ kind: "project.updated", project: { id: "p", title: "P", workspaceRoot: "/w/p" } })).toEqual({
      kind: "project",
      id: "p",
      project: { title: "P", repo: null, path: "/w/p" },
    });
  });
});

describe("decodeRunSteps", () => {
  test("reads the steps in order and drops entries without a name", () => {
    expect(
      decodeRunSteps({
        run: {},
        steps: [
          { name: "plan", status: "completed", threadId: "t1" },
          { status: "running" },
          { name: "ask", status: "running" },
          5,
        ],
      }),
    ).toEqual([
      { name: "plan", status: "completed", threadId: "t1" },
      { name: "ask", status: "running", threadId: null },
    ]);
    expect(decodeRunSteps("x")).toEqual([]);
  });
});
