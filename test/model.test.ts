import { describe, expect, test } from "bun:test";

import { parseOutput, stdinFor } from "../src/server/model.ts";

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
