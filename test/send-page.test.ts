import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";

import { isBusy, postSend } from "../src/page/send.ts";
import type { Status } from "../src/shared/tree.ts";

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
});
