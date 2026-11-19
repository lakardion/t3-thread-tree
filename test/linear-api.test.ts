import { describe, expect, test } from "bun:test";

import { fetchLinear } from "../src/server/linear-api.ts";

const PROJECT = { id: "p1", name: "Checkout", url: "https://linear.app/w/project/checkout" };
const MILESTONE = { id: "m1", name: "Beta", targetDate: "2026-12-01" };

type Call = { url: string; init: RequestInit; vars: { keys?: string[]; key?: string } };

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });

const node = (identifier: string, previousIdentifiers: string[] = []) => ({
  identifier,
  previousIdentifiers,
  project: PROJECT,
  projectMilestone: MILESTONE,
});

/** A fake `fetch` that records each call and answers with `reply`. */
function fake(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const call = { url, init, vars: JSON.parse(init.body as string).variables };
    calls.push(call);
    return reply(call);
  };
  return { fetch, calls };
}

const nodesFor = (c: Call) => json({ data: { issues: { nodes: (c.vars.keys ?? []).map((k) => node(k)) } } });

describe("fetchLinear", () => {
  test("posts to Linear with the key as the Authorization header, no Bearer", async () => {
    const f = fake(nodesFor);
    await fetchLinear("lin_api_x", ["A-1"], f.fetch);
    expect(f.calls[0].url).toBe("https://api.linear.app/graphql");
    expect(f.calls[0].init.method).toBe("POST");
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe("lin_api_x");
    expect(f.calls[0].vars.keys).toEqual(["A-1"]);
  });

  test("matches a node to a key by identifier or previousIdentifiers", async () => {
    const f = fake(() => json({ data: { issues: { nodes: [node("B-2", ["OLD-2"]), node("A-1")] } } }));
    const r = await fetchLinear("k", ["A-1", "OLD-2"], f.fetch);
    expect(r).toEqual({
      status: "ok",
      data: new Map([
        ["A-1", { project: PROJECT, milestone: MILESTONE }],
        ["OLD-2", { project: PROJECT, milestone: MILESTONE }],
      ]),
    });
    expect(f.calls).toHaveLength(1);
  });

  test("a key the batch misses gets one issue call, and its answer is used", async () => {
    const f = fake((c) =>
      c.vars.key
        ? json({ data: { issue: { identifier: "Z-9", project: PROJECT, projectMilestone: null } } })
        : json({ data: { issues: { nodes: [node("A-1")] } } }),
    );
    const r = await fetchLinear("k", ["A-1", "Z-9"], f.fetch);
    expect(f.calls.map((c) => c.vars)).toEqual([{ keys: ["A-1", "Z-9"] }, { key: "Z-9" }]);
    expect(r.status === "ok" && r.data.get("Z-9")).toEqual({ project: PROJECT, milestone: null });
  });

  test("an issue call that says the entity is not found means no project", async () => {
    const f = fake((c) =>
      c.vars.key
        ? json(
            {
              errors: [
                {
                  message: "Entity not found: Issue",
                  extensions: { type: "invalid input", code: "INPUT_ERROR", statusCode: 400 },
                },
              ],
              data: null,
            },
            { status: 400 },
          )
        : json({ data: { issues: { nodes: [] } } }),
    );
    const r = await fetchLinear("k", ["GONE-1"], f.fetch);
    expect(r).toEqual({ status: "ok", data: new Map([["GONE-1", { project: null, milestone: null }]]) });
  });

  test("more than 250 keys go out in pages of 250", async () => {
    const f = fake(nodesFor);
    const keys = Array.from({ length: 251 }, (_, i) => `A-${i}`);
    const r = await fetchLinear("k", keys, f.fetch);
    expect(f.calls.map((c) => c.vars.keys?.length)).toEqual([250, 1]);
    expect(r.status === "ok" && r.data.size).toBe(251);
  });

  test("a key with a leading-zero number skips the batch and gets an issue call", async () => {
    const f = fake((c) =>
      c.vars.key
        ? json({ data: { issue: { identifier: "AB-12", project: PROJECT, projectMilestone: null } } })
        : nodesFor(c),
    );
    const r = await fetchLinear("k", ["A-1", "AB-00012"], f.fetch);
    expect(f.calls.map((c) => c.vars)).toEqual([{ keys: ["A-1"] }, { key: "AB-00012" }]);
    expect(r.status === "ok" && r.data.get("AB-00012")).toEqual({ project: PROJECT, milestone: null });
  });

  test("a batch answered with an input error sends its keys to issue calls", async () => {
    for (const code of ["INVALID_INPUT", "INPUT_ERROR"]) {
      const f = fake((c) =>
        c.vars.key
          ? json({ data: { issue: { identifier: c.vars.key, project: PROJECT, projectMilestone: MILESTONE } } })
          : json({ errors: [{ extensions: { code } }], data: null }, { status: 400 }),
      );
      const r = await fetchLinear("k", ["A-1", "B-2"], f.fetch);
      expect(f.calls.map((c) => c.vars)).toEqual([{ keys: ["A-1", "B-2"] }, { key: "A-1" }, { key: "B-2" }]);
      expect(r.status === "ok" && r.data.get("B-2")).toEqual({ project: PROJECT, milestone: MILESTONE });
    }
  });

  test("a node with null previousIdentifiers still matches by identifier", async () => {
    const f = fake(() => json({ data: { issues: { nodes: [{ ...node("A-1"), previousIdentifiers: null }] } } }));
    const r = await fetchLinear("k", ["A-1"], f.fetch);
    expect(r.status === "ok" && r.data.get("A-1")).toEqual({ project: PROJECT, milestone: MILESTONE });
  });

  test("no keys make no call", async () => {
    const f = fake(nodesFor);
    expect(await fetchLinear("k", [], f.fetch)).toEqual({ status: "ok", data: new Map() });
    expect(f.calls).toHaveLength(0);
  });

  test("HTTP 401 or AUTHENTICATION_ERROR means rejected", async () => {
    const auth = { errors: [{ extensions: { code: "AUTHENTICATION_ERROR" } }] };
    expect(await fetchLinear("k", ["A-1"], fake(() => json(auth, { status: 401 })).fetch)).toEqual({
      status: "rejected",
    });
    expect(await fetchLinear("k", ["A-1"], fake(() => json(auth)).fetch)).toEqual({ status: "rejected" });
  });

  test("rejected during an issue call also means rejected", async () => {
    const f = fake((c) =>
      c.vars.key
        ? json({ errors: [{ extensions: { code: "AUTHENTICATION_ERROR" } }] }, { status: 401 })
        : json({ data: { issues: { nodes: [] } } }),
    );
    expect(await fetchLinear("k", ["A-1"], f.fetch)).toEqual({ status: "rejected" });
  });

  test("HTTP 429 means limited, with Retry-After in ms or 60 s without it", async () => {
    const limited = { errors: [{ extensions: { code: "RATELIMITED" } }] };
    const withHeader = fake(() => json(limited, { status: 429, headers: { "Retry-After": "7" } }));
    expect(await fetchLinear("k", ["A-1"], withHeader.fetch)).toEqual({ status: "limited", ms: 7000 });
    const without = fake(() => json(limited, { status: 429 }));
    expect(await fetchLinear("k", ["A-1"], without.fetch)).toEqual({ status: "limited", ms: 60_000 });
    const bad = fake(() => json(limited, { status: 429, headers: { "Retry-After": "soon" } }));
    expect(await fetchLinear("k", ["A-1"], bad.fetch)).toEqual({ status: "limited", ms: 60_000 });
  });

  test("a 5xx, another error, a bad body or a thrown fetch means failed", async () => {
    expect(await fetchLinear("k", ["A-1"], fake(() => json({}, { status: 503 })).fetch)).toEqual({ status: "failed" });
    expect(
      await fetchLinear("k", ["A-1"], fake(() => json({ errors: [{ extensions: { code: "OTHER" } }] })).fetch),
    ).toEqual({ status: "failed" });
    expect(await fetchLinear("k", ["A-1"], fake(() => new Response("not json")).fetch)).toEqual({ status: "failed" });
    const boom = async () => {
      throw new Error("network");
    };
    expect(await fetchLinear("k", ["A-1"], boom)).toEqual({ status: "failed" });
  });
});
