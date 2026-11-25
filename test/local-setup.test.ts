import { expect, test } from "bun:test";

import { setupPrompt } from "../src/page/local-setup.ts";

test("the prompt names the app build, the model, the schema check and the save call", () => {
  const p = setupPrompt("http://127.0.0.1:4773");
  expect(p).toContain("brew install --cask ollama-app");
  expect(p).toContain("qwen3.5:4b-nvfp4");
  expect(p).toContain("json_schema");
  expect(p).toContain("PUT http://127.0.0.1:4773/local-model");
});
