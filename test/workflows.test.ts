import { describe, expect, test } from "bun:test";

import { workflowRoutes } from "../src/server/workflows.ts";

function setup(call: (tag: string, payload: unknown) => Promise<unknown> = async () => {}) {
  const calls: [string, unknown][] = [];
  const routes = workflowRoutes({ call: (tag, payload) => (calls.push([tag, payload]), call(tag, payload)) });
  const post =
    (route: keyof typeof routes) =>
    (body: unknown, type: string | null = "application/json") =>
      routes[route].POST(
        new Request(`http://x${route}`, {
          method: "POST",
          headers: type ? { "content-type": type } : {},
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );
  return {
    calls,
    answer: post("/t3/workflows/answer"),
    resume: post("/t3/workflows/resume"),
    cancel: post("/t3/workflows/cancel"),
  };
}

describe("workflow routes", () => {
  test("415 without a JSON content type", async () => {
    const s = setup();
    for (const r of [s.answer, s.resume, s.cancel]) expect((await r({ runId: "r" }, "text/plain")).status).toBe(415);
    expect(s.calls).toEqual([]);
  });

  test("400 on a bad body", async () => {
    const s = setup();
    expect((await s.answer("nope")).status).toBe(400);
    expect((await s.answer({ runId: "r", name: "n" })).status).toBe(400);
    expect((await s.answer({ runId: "r", name: "n", choice: "" })).status).toBe(400);
    expect((await s.resume({})).status).toBe(400);
    expect((await s.cancel({ runId: 1 })).status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  test("answer sends the choice, and the reason only when it is not blank", async () => {
    const s = setup();
    expect((await s.answer({ runId: "r", name: "n", choice: "Yes", reason: "  because " })).status).toBe(204);
    expect((await s.answer({ runId: "r", name: "n", choice: "Yes", reason: "   " })).status).toBe(204);
    expect((await s.answer({ runId: "r", name: "n", choice: "No" })).status).toBe(204);
    expect(s.calls).toEqual([
      ["workflows.answer", { runId: "r", name: "n", choice: "Yes", reason: "because" }],
      ["workflows.answer", { runId: "r", name: "n", choice: "Yes" }],
      ["workflows.answer", { runId: "r", name: "n", choice: "No" }],
    ]);
  });

  test("resume and cancel send the run id", async () => {
    const s = setup();
    expect((await s.resume({ runId: "r" })).status).toBe(204);
    expect((await s.cancel({ runId: "r", reason: "ignored" })).status).toBe(204);
    expect(s.calls).toEqual([
      ["workflows.resume", { runId: "r" }],
      ["workflows.cancel", { runId: "r" }],
    ]);
  });

  test("502 with the failure text", async () => {
    const s = setup(() => Promise.reject(new Error("Run is gone")));
    const r = await s.resume({ runId: "r" });
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: string }).error).toBe("Run is gone");
  });

  test("502 names the fix for a missing scope", async () => {
    const s = setup(() =>
      Promise.reject(new Error("The authenticated token is missing required scope: orchestration:operate")),
    );
    const r = await s.answer({ runId: "r", name: "n", choice: "Yes" });
    expect(((await r.json()) as { error: string }).error).toContain("cannot answer");
  });

  test("a cancel that times out answers 202, other calls answer 502", async () => {
    const s = setup(() => Promise.reject(new Error("timed out")));
    expect((await s.cancel({ runId: "r" })).status).toBe(202);
    expect((await s.resume({ runId: "r" })).status).toBe(502);
  });
});
