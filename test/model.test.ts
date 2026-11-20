import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCHEMA } from "../src/server/catch-up.ts";
import {
  appleSchema,
  createModels,
  localModelRoutes,
  parseOutput,
  pickRoutes,
  readLocalConfig,
  readPickFile,
  stdinFor,
} from "../src/server/model.ts";
import { writeToken } from "../src/server/token.ts";

describe("stdinFor", () => {
  test("claude gets the input only", () => {
    expect(stdinFor("claude", "G", "in")).toBe("in");
  });
  test("codex gets the guide, an Input heading and the input", () => {
    expect(stdinFor("codex", "G", "in")).toBe("G\n\n## Input\n\nin");
  });
});

describe("parseOutput", () => {
  const ok = { actions: [] };
  test("claude: reads structured_output from the result line, after a tag line", () => {
    const out = `[claude-code:tag] {"x":1}\n${JSON.stringify({ type: "result", is_error: false, structured_output: ok })}\n`;
    expect(parseOutput("claude", out)).toEqual({ answer: ok });
  });
  test("claude: is_error gives the result text", () => {
    const out = JSON.stringify({ type: "result", is_error: true, result: "There's an issue with the selected model" });
    expect(parseOutput("claude", out)).toEqual({ error: "There's an issue with the selected model" });
  });
  test("codex: parses the last agent_message", () => {
    const out = [
      { type: "thread.started" },
      { type: "item.completed", item: { type: "agent_message", text: "{}" } },
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(ok) } },
      { type: "turn.completed" },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n");
    expect(parseOutput("codex", out)).toEqual({ answer: ok });
  });
  test("codex: turn.failed gives its message", () => {
    const out = [
      { type: "error", message: "e" },
      { type: "turn.failed", error: { message: "model not supported" } },
    ]
      .map((l) => JSON.stringify(l))
      .join("\n");
    expect(parseOutput("codex", out)).toEqual({ error: "model not supported" });
  });
  test("codex: bad JSON is a parse error", () => {
    const out = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{nope" } });
    expect(parseOutput("codex", out)).toMatchObject({ error: expect.stringContaining("Cannot parse the answer") });
  });
  test("no answer at all gives null", () => {
    expect(parseOutput("claude", "")).toBeNull();
    expect(parseOutput("codex", "")).toBeNull();
  });
});

describe("pick file", () => {
  const dir = mkdtempSync(join(tmpdir(), "model-pick-"));
  const file = join(dir, "model-pick");
  const save = (c: object) => writeToken(file, JSON.stringify(c));
  let saves = 0;
  const defaultOff = new Set(["local", "apple"]);
  const routes = pickRoutes(file, () => saves++)["/model-pick"];
  const put = (body: string, type = "application/json") =>
    routes.PUT(new Request("http://x/model-pick", { method: "PUT", body, headers: { "content-type": type } }));

  beforeEach(() => {
    rmSync(file, { force: true });
    saves = 0;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("no file or an invalid file gives no pick and the switch off", () => {
    expect(readPickFile(file)).toEqual({ pick: null, catchUp: false });
    save({ pick: "gpt" });
    expect(readPickFile(file)).toEqual({ pick: null, catchUp: false });
  });
  test("the switch defaults to on for claude and codex, off for local and apple", () => {
    for (const pick of ["claude", "codex", "local", "apple"] as const) {
      save({ pick });
      expect(readPickFile(file)).toEqual({ pick, catchUp: !defaultOff.has(pick) });
    }
  });
  test("a stored switch wins for every pick", () => {
    for (const pick of ["claude", "codex", "local", "apple"] as const) {
      save({ pick, catchUp: defaultOff.has(pick) });
      expect(readPickFile(file).catchUp).toBe(defaultOff.has(pick));
      save({ pick, catchUp: !defaultOff.has(pick) });
      expect(readPickFile(file).catchUp).toBe(!defaultOff.has(pick));
    }
  });
  test("PUT merges into the stored fields, saves and answers like GET", async () => {
    save({ pick: "local", catchUp: true });
    const res = await put(JSON.stringify({ pick: "claude" }));
    expect(await res.json()).toEqual({ pick: "claude", catchUp: true });
    expect(JSON.parse(await Bun.file(file).text())).toEqual({ pick: "claude", catchUp: true });
    expect(await (await put(JSON.stringify({ catchUp: false }))).json()).toEqual({ pick: "claude", catchUp: false });
    expect(await routes.GET().json()).toEqual({ pick: "claude", catchUp: false });
    expect(saves).toBe(2);
  });
  test("PUT of local or apple with no stored switch resolves to off", async () => {
    expect(await (await put(JSON.stringify({ pick: "local" }))).json()).toEqual({ pick: "local", catchUp: false });
    rmSync(file, { force: true });
    expect(await (await put(JSON.stringify({ pick: "apple" }))).json()).toEqual({ pick: "apple", catchUp: false });
  });
  test("400 on a bad body, 415 on a non-JSON body", async () => {
    expect((await put(JSON.stringify({ pick: "gpt" }))).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
    expect((await put("x", "text/plain")).status).toBe(415);
    expect(saves).toBe(0);
  });
});

describe("Local model", () => {
  type Handler = (req: Request) => Response | Promise<Response>;
  let handler: Handler = () => new Response("", { status: 500 });
  let lastBody: unknown;
  const fake = Bun.serve({
    port: 0,
    async fetch(req) {
      if (req.method === "POST") lastBody = await req.clone().json();
      return handler(req);
    },
  });
  const baseUrl = `http://localhost:${fake.port}/v1`;
  const dir = mkdtempSync(join(tmpdir(), "local-model-"));
  const file = join(dir, "local-model");
  const config = { baseUrl, model: "m1" };
  const save = (c: object) => writeToken(file, JSON.stringify(c));
  const job = { guide: "G", input: "in", schema: { type: "object" } };
  const models = (timeoutMs?: number) =>
    createModels({ localConfig: () => readLocalConfig(file), appleHelper: null, timeoutMs });
  const reply = (content: string, finish_reason = "stop") =>
    Response.json({ choices: [{ message: { content }, finish_reason }] });
  const put = (body: string, type = "application/json") =>
    localModelRoutes(file)["/local-model"].PUT(
      new Request("http://x/local-model", { method: "PUT", body, headers: { "content-type": type } }),
    );

  beforeEach(() => rmSync(file, { force: true }));
  afterAll(() => {
    void fake.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  describe("GET /local-model", () => {
    const get = async () => (await localModelRoutes(file)["/local-model"].GET()).json();
    test("unset without a file", async () => {
      expect(await get()).toEqual({ config: null, state: "unset" });
    });
    test("ok when the runtime lists the model", async () => {
      save(config);
      handler = () => Response.json({ data: [{ id: "m1" }] });
      expect(await get()).toEqual({ config, state: "ok" });
    });
    test("missing when the runtime does not list the model", async () => {
      save(config);
      handler = () => Response.json({ data: [{ id: "other" }] });
      expect((await get()).state).toBe("missing");
    });
    test("down when nothing listens", async () => {
      const dead = Bun.serve({ port: 0, fetch: () => new Response("") });
      const port = dead.port;
      await dead.stop(true);
      save({ baseUrl: `http://localhost:${port}/v1`, model: "m1" });
      expect((await get()).state).toBe("down");
    });
  });

  describe("PUT /local-model", () => {
    test("saves a trimmed config and returns its state", async () => {
      handler = () => Response.json({ data: [{ id: "m1" }] });
      const res = await put(JSON.stringify({ baseUrl: `${baseUrl}/`, model: " m1 " }));
      expect(await res.json()).toEqual({ config, state: "ok" });
      expect(readLocalConfig(file)).toEqual(config);
    });
    test("400 on a bad body", async () => {
      expect((await put(JSON.stringify({ baseUrl: "ftp://x", model: "m1" }))).status).toBe(400);
      expect((await put(JSON.stringify({ baseUrl, model: "a\nb" }))).status).toBe(400);
      expect((await put("not json")).status).toBe(400);
      expect(readLocalConfig(file)).toBeNull();
    });
    test("415 on a non-JSON body", async () => {
      expect((await put("x", "text/plain")).status).toBe(415);
    });
  });

  describe("offered", () => {
    test("no local pick without a config", async () => {
      expect((await models().offered()).some((o) => o.id === "local")).toBe(false);
    });
    test("local is last with a config, and the file is read on each call", async () => {
      const m = models();
      save(config);
      expect((await m.offered()).at(-1)).toEqual({ id: "local", label: "Local · m1" });
      save({ ...config, model: "m2" });
      expect((await m.offered()).at(-1)?.label).toBe("Local · m2");
    });
  });

  describe("run local", () => {
    beforeEach(() => save(config));
    const run = (m = models()) => m.run("local", job).done;

    test("sends the exact request and parses the answer", async () => {
      handler = () => reply('{"actions":[]}');
      expect(await run()).toEqual({ answer: { actions: [] } });
      expect(lastBody).toEqual({
        model: "m1",
        messages: [
          { role: "system", content: "G" },
          { role: "user", content: "in" },
        ],
        response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: job.schema } },
        reasoning_effort: "none",
        keep_alive: "30m",
        max_tokens: 2000,
      });
    });
    test("no config gives the not set up error", async () => {
      rmSync(file);
      expect(await run()).toMatchObject({ error: "The Local model is not set up." });
    });
    test("down", async () => {
      const dead = Bun.serve({ port: 0, fetch: () => new Response("") });
      const url = `http://localhost:${dead.port}/v1`;
      await dead.stop(true);
      save({ baseUrl: url, model: "m1" });
      expect(await run()).toMatchObject({ error: `Local model not reachable at ${url}.` });
    });
    test("404 gives model missing", async () => {
      handler = () => new Response('{"error":"model \\"m1\\" not found"}', { status: 404 });
      expect(await run()).toMatchObject({
        error: "Model m1 is not in the runtime.",
        detail: expect.stringContaining("not found"),
      });
    });
    test("501 gives the schema error", async () => {
      handler = () => new Response("", { status: 501 });
      expect(await run()).toMatchObject({
        error: "The runtime cannot enforce the schema. Install the Ollama app build.",
      });
    });
    test("another failure status", async () => {
      handler = () => new Response("boom", { status: 500 });
      expect(await run()).toEqual({ error: "The local runtime answered HTTP 500.", detail: "boom" });
    });
    test("a cut answer", async () => {
      handler = () => reply('{"actions":[', "length");
      expect(await run()).toMatchObject({ error: "The local model gave no valid answer." });
    });
    test("bad JSON", async () => {
      handler = () => reply("not json");
      expect(await run()).toMatchObject({ error: "The local model gave no valid answer." });
    });
    test("timeout", async () => {
      handler = async () => (await Bun.sleep(500), reply("{}"));
      expect(await run(models(50))).toMatchObject({ error: "timed out" });
    });
    test("cancel gives null", async () => {
      handler = async () => (await Bun.sleep(500), reply("{}"));
      const r = models().run("local", job);
      await Bun.sleep(20);
      r.cancel();
      expect(await r.done).toBeNull();
    });
  });
});

describe("appleSchema", () => {
  test("turns the Catch-up schema into the helper schema", () => {
    expect(appleSchema(SCHEMA)).toEqual({
      type: "object",
      title: "Answer",
      "x-order": ["did", "ask", "options", "doneLike"],
      additionalProperties: false,
      required: ["did", "options", "doneLike"],
      properties: {
        did: { type: "string" },
        ask: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        doneLike: { type: "boolean" },
      },
    });
  });
  test("does not change its input", () => {
    const before = JSON.stringify(SCHEMA);
    appleSchema(SCHEMA);
    expect(JSON.stringify(SCHEMA)).toBe(before);
  });
  test("a nested object takes its key as title", () => {
    const out = appleSchema({
      type: "object",
      properties: { a: { type: "object", properties: { b: { type: "string" } } } },
    }) as { properties: { a: { title: string; "x-order": string[] } } };
    expect(out.properties.a.title).toBe("a");
    expect(out.properties.a["x-order"]).toEqual(["b"]);
  });
});

describe("Apple model", () => {
  const dir = mkdtempSync(join(tmpdir(), "apple-model-"));
  const helper = join(dir, "apple-model");
  const stdinFile = join(dir, "stdin");
  const fake = (body: string) => {
    writeFileSync(helper, `#!/bin/sh\n${body}\n`);
    chmodSync(helper, 0o755);
  };
  const check = (json: string, code = 0) => `[ "$1" = check ] && { echo '${json}'; exit ${code}; }`;
  const runs = (json: string, code = 0, pre = `cat > ${stdinFile}`) =>
    `${pre}\n[ "$1" = run ] && { echo '${json}'; exit ${code}; }`;
  const models = (appleHelper: string | null = helper, timeoutMs?: number) =>
    createModels({ localConfig: () => ({ baseUrl: "http://x/v1", model: "m1" }), appleHelper, timeoutMs });
  const ids = async (m = models()) => (await m.offered()).map((o) => o.id);
  const job = { guide: "G", input: "in", schema: SCHEMA };
  const run = (m = models()) => m.run("apple", job).done;

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  describe("offered", () => {
    test("available gives apple after the CLIs and before local", async () => {
      fake(check('{"available":true,"contextSize":4096}'));
      const all = await models().offered();
      const i = all.findIndex((o) => o.id === "apple");
      expect(all[i]).toEqual({ id: "apple", label: "Apple model" });
      expect(all.slice(0, i).every((o) => o.id === "claude" || o.id === "codex")).toBe(true);
      expect(all.slice(i + 1).map((o) => o.id)).toEqual(["local"]);
    });
    test.each(["deviceNotEligible", "appleIntelligenceNotEnabled", "modelNotReady", "other"])(
      "%s hides apple",
      async (reason) => {
        fake(check(`{"available":false,"reason":"${reason}"}`));
        expect(await ids()).not.toContain("apple");
      },
    );
    test("a non-zero exit hides apple", async () => {
      fake(check('{"available":true}', 2));
      expect(await ids()).not.toContain("apple");
    });
    test("bad output hides apple", async () => {
      fake(check("nope"));
      expect(await ids()).not.toContain("apple");
    });
    test("a missing file hides apple", async () => {
      expect(await ids(models(join(dir, "gone")))).not.toContain("apple");
    });
    test("a null helper hides apple", async () => {
      expect(await ids(models(null))).not.toContain("apple");
    });
    test("the check runs on each call", async () => {
      const m = models();
      fake(check('{"available":false,"reason":"modelNotReady"}'));
      expect(await ids(m)).not.toContain("apple");
      fake(check('{"available":true}'));
      expect(await ids(m)).toContain("apple");
    });
  });

  describe("run", () => {
    test("sends the guide, input and transformed schema on stdin", async () => {
      fake(runs('{"answer":{"did":"d","ask":"a","options":[],"doneLike":false}}'));
      await run();
      expect(JSON.parse(await Bun.file(stdinFile).text())).toEqual({
        guide: "G",
        input: "in",
        schema: appleSchema(SCHEMA),
      });
    });
    test("an answer without ask gets ask null, and a given ask stays", async () => {
      fake(runs('{"answer":{"did":"d","options":[],"doneLike":false}}'));
      expect(await run()).toEqual({ answer: { did: "d", options: [], doneLike: false, ask: null } });
      fake(runs('{"answer":{"did":"d","ask":"a","options":[],"doneLike":false}}'));
      expect(await run()).toMatchObject({ answer: { ask: "a" } });
    });
    test("a non-object answer is kept", async () => {
      fake(runs('{"answer":5}'));
      expect(await run()).toEqual({ answer: 5 });
    });
    test("unparseable stdout on exit 0 gives no valid answer", async () => {
      fake(runs("nope"));
      expect(await run()).toMatchObject({ error: "The Apple model gave no valid answer." });
    });
    test.each([
      [
        '{"error":"overflow","tokens":12345,"limit":3496}',
        "The thread is too long for the Apple model: 12,345 of 3,496 tokens.",
      ],
      ['{"error":"overflow"}', "The Apple model helper exited with code 1."],
      ['{"error":"contextWindow"}', "The thread did not fit in the Apple model's window."],
      ['{"error":"unavailable","reason":"deviceNotEligible"}', "This Mac cannot run the Apple model."],
      [
        '{"error":"unavailable","reason":"appleIntelligenceNotEnabled"}',
        "Turn on Apple Intelligence in System Settings to use the Apple model.",
      ],
      ['{"error":"unavailable","reason":"modelNotReady"}', "The Apple model is not ready yet. Try again later."],
      ['{"error":"unavailable","reason":"assetsUnavailable"}', "The Apple model is not ready yet. Try again later."],
      ['{"error":"unavailable","reason":"zzz"}', "The Apple model helper exited with code 1."],
      ['{"error":"refusal"}', "The Apple model refused the input."],
      ['{"error":"guardrail"}', "The Apple model refused the input."],
      ['{"error":"decoding"}', "The Apple model gave no valid answer."],
      ['{"error":"busy"}', "The Apple model is busy. Try again."],
      ['{"error":"locale"}', "The Apple model does not support this language."],
      ['{"error":"zzz"}', "The Apple model helper exited with code 1."],
      ['{"error":"constructor"}', "The Apple model helper exited with code 1."],
    ])("exit 1 with %s", async (json, text) => {
      fake(runs(json, 1));
      expect(await run()).toMatchObject({ error: text });
    });
    test("exit 1 with no parseable object gives the other-exit text", async () => {
      fake(runs("nope", 1));
      expect(await run()).toMatchObject({ error: "The Apple model helper exited with code 1." });
    });
    test("a crash gives the exit code and the stderr tail", async () => {
      fake(runs("", 2, "cat > /dev/null; echo boom >&2"));
      expect(await run()).toMatchObject({ error: "The Apple model helper exited with code 2.", detail: "boom\n" });
    });
    test("a missing helper gives the spawn error", async () => {
      expect(await run(models(join(dir, "gone")))).toMatchObject({ error: "Cannot start the Apple model helper." });
      expect(await run(models(null))).toMatchObject({ error: "Cannot start the Apple model helper." });
    });
    test("timeout", async () => {
      fake("exec sleep 5");
      expect(await run(models(helper, 50))).toMatchObject({ error: "timed out" });
    });
    test("cancel gives null", async () => {
      fake("exec sleep 5");
      const r = models().run("apple", job);
      await Bun.sleep(50);
      r.cancel();
      expect(await r.done).toBeNull();
    });
  });
});
