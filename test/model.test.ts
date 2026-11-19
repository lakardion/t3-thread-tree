import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createModels, localModelRoutes, parseOutput, readLocalConfig, stdinFor } from "../src/server/model.ts";
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
  const models = (timeoutMs?: number) => createModels({ localConfig: () => readLocalConfig(file), timeoutMs });
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
      expect(await run()).toMatchObject({ error: "The local model gave no valid brief." });
    });
    test("bad JSON", async () => {
      handler = () => reply("not json");
      expect(await run()).toMatchObject({ error: "The local model gave no valid brief." });
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
