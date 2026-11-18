import { describe, expect, test } from "bun:test";

import { settleRoutes } from "../src/server/settle.ts";

function setup(dispatch: (c: Record<string, unknown>) => Promise<void> = async () => {}) {
  const calls: Record<string, unknown>[] = [];
  const post = settleRoutes({
    dispatch: (c) => (calls.push(c), dispatch(c)),
    hasThread: (id) => id === "T",
  })["/t3/settle"].POST;
  const req = (body: unknown, type: string | null = "application/json") =>
    post(
      new Request("http://x/t3/settle", {
        method: "POST",
        headers: type ? { "content-type": type } : {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { calls, req };
}

describe("settle route", () => {
  test("415 without a JSON content type", async () => {
    const { req, calls } = setup();
    expect((await req({ threadId: "T", settled: true }, "text/plain")).status).toBe(415);
    expect(calls).toEqual([]);
  });

  test("400 on a bad body", async () => {
    const { req } = setup();
    expect((await req("nope")).status).toBe(400);
    expect((await req({ threadId: "T" })).status).toBe(400);
    expect((await req({ threadId: 1, settled: true })).status).toBe(400);
  });

  test("404 on an unknown thread", async () => {
    expect((await setup().req({ threadId: "X", settled: true })).status).toBe(404);
  });

  test("settle and unsettle send the right commands", async () => {
    const { req, calls } = setup();
    expect((await req({ threadId: "T", settled: true })).status).toBe(204);
    expect((await req({ threadId: "T", settled: false })).status).toBe(204);
    expect(calls).toEqual([
      { type: "thread.settle", threadId: "T" },
      { type: "thread.unsettle", threadId: "T", reason: "user" },
    ]);
  });

  test("a dispatch failure maps to 502 with its message", async () => {
    const { req } = setup(() => Promise.reject(new Error("timed out")));
    const r = await req({ threadId: "T", settled: true });
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe("timed out");
  });

  test("a scope failure maps to the token hint", async () => {
    const { req } = setup(() => Promise.reject(new Error("Missing scope orchestration:operate")));
    const r = await req({ threadId: "T", settled: true });
    expect((await r.json()).error).toContain("Issue a new token");
  });
});
