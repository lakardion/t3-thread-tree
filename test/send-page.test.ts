import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";

import { isBusy, markKey, postSend, postStart, startDefaults } from "../src/page/send.ts";
import type { BriefAction } from "../src/shared/brief.ts";
import type { Branch, Status, ThreadNode } from "../src/shared/tree.ts";

const step = (threadIds: string[]): BriefAction => ({
  kind: "fix",
  title: "Fix it",
  reason: "r",
  threadIds,
  prompt: null,
});

describe("markKey", () => {
  test("equal steps match, other threads differ", () => {
    expect(markKey(step(["a"]))).toBe(markKey(step(["a"])));
    expect(markKey(step(["a"]))).not.toBe(markKey(step(["a", "b"])));
  });
});

test("isBusy is true for working, starting, waiting only", () => {
  const all: Status[] = [
    "needs-input",
    "working",
    "starting",
    "waiting",
    "plan-ready",
    "your-turn",
    "done",
    "failed",
    "interrupted",
    "snoozed",
    "idle",
  ];
  expect(all.filter(isBusy)).toEqual(["working", "starting", "waiting"]);
});

describe("postSend", () => {
  const spy = spyOn(globalThis, "fetch");
  afterEach(() => spy.mockReset());
  afterAll(() => spy.mockRestore());

  test("200 is ok", async () => {
    spy.mockResolvedValue(new Response("{}"));
    expect(await postSend("t", "m")).toEqual({ ok: true });
  });

  test("502 body is the error", async () => {
    const err = { error: "boom", exitCode: 1, stderrTail: "x" };
    spy.mockResolvedValue(new Response(JSON.stringify(err), { status: 502 }));
    expect(await postSend("t", "m")).toEqual({ ok: false, err });
  });

  test("a non-JSON error body reports the status", async () => {
    spy.mockResolvedValue(new Response("oops", { status: 500 }));
    expect(await postSend("t", "m")).toEqual({ ok: false, err: { error: "HTTP 500", exitCode: null, stderrTail: "" } });
  });

  test("a rejected fetch is a generic error", async () => {
    spy.mockRejectedValue(new Error("down"));
    const r = await postSend("t", "m");
    expect(r).toEqual({ ok: false, err: { error: "The server did not answer.", exitCode: null, stderrTail: "" } });
  });

  test("posts the project, title and message", async () => {
    spy.mockResolvedValue(new Response("{}"));
    expect(await postStart("p", "t", "m")).toEqual({ ok: true });
    expect(spy.mock.calls[0][0]).toBe("/t3/start");
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ projectId: "p", title: "t", message: "m" });
  });

  test("502 body is the error", async () => {
    const err = { error: "boom", exitCode: 1, stderrTail: "x" };
    spy.mockResolvedValue(new Response(JSON.stringify(err), { status: 502 }));
    expect(await postStart("p", "t", "m")).toEqual({ ok: false, err });
  });
});

describe("startDefaults", () => {
  const thread = (id: string, key: string | null) => ({ id, key, children: [] }) as unknown as ThreadNode;
  const project = (id: string, threads: ThreadNode[]) =>
    ({ id: `p:${id}`, label: id, branches: [], threads }) as Branch;
  const projects = [project("one", [thread("a", null)]), project("two", [thread("b", "KEY-1")])];
  const live = new Map(projects.flatMap((p) => p.threads).map((t) => [t.id, t]));

  test("project of the first live thread, title with its key", () => {
    expect(startDefaults(step(["gone", "b"]), live, projects).projectId).toBe("two");
    expect(startDefaults(step(["b"]), live, projects)).toEqual({ projectId: "two", title: "KEY-1 Fix it" });
  });

  test("no live thread falls back to the first project", () => {
    expect(startDefaults(step(["gone"]), live, projects)).toEqual({ projectId: "one", title: "Fix it" });
  });

  test("no projects gives an empty id", () => {
    expect(startDefaults(step(["a"]), live, []).projectId).toBe("");
  });

  test("a keyless first thread gives the bare title", () => {
    expect(startDefaults(step(["a"]), live, projects).title).toBe("Fix it");
  });
});
