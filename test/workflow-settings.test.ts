import { describe, expect, test } from "bun:test";

import { changes, label } from "../src/page/workflow-settings.tsx";
import type { Setting } from "../src/shared/workflow-start.ts";

const settings: Setting[] = [
  { key: "settings/w/time", field: "time", type: "string" },
  { key: "settings/w/limit", field: "limit", type: "number" },
  { key: "settings/w/on", field: "on", type: "boolean" },
  { key: "settings/w/shape", field: "shape", type: "other" },
];

describe("changes", () => {
  test("an empty field deletes a stored key and skips a missing one", () => {
    const values = { "settings/w/time": "9am" };
    expect(changes(settings, { "settings/w/time": "", "settings/w/limit": "" }, values)).toEqual([
      { key: "settings/w/time", value: null },
    ]);
  });

  test("an unchanged field is skipped", () => {
    const values = { "settings/w/time": "9am", "settings/w/limit": 3, "settings/w/on": true };
    expect(
      changes(settings, { "settings/w/time": "9am", "settings/w/limit": "3", "settings/w/on": true }, values),
    ).toEqual([]);
  });

  test("a changed field is set, a number as a number", () => {
    expect(changes(settings, { "settings/w/limit": "4", "settings/w/on": false }, { "settings/w/limit": 3 })).toEqual([
      { key: "settings/w/limit", value: 4 },
      { key: "settings/w/on", value: false },
    ]);
  });

  test("a read-only key is never written", () => {
    expect(changes(settings, { "settings/w/shape": "x" }, {})).toEqual([]);
  });
});

test("label is the field in sentence case", () => {
  expect(label("extra-prompt")).toBe("Extra prompt");
  expect(label("time")).toBe("Time");
});
