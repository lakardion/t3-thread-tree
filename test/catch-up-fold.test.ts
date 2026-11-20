import { describe, expect, test } from "bun:test";

import { foldValue, switchBody } from "../src/page/catch-up-fold.ts";
import type { Offered } from "../src/shared/model.ts";

const clis: Offered = [
  { id: "claude", label: "Claude Haiku" },
  { id: "local", label: "Local · qwen" },
];

describe("foldValue", () => {
  test("no offered model is No model", () => {
    expect(foldValue([], undefined, true)).toEqual({ text: "No model", tone: "warn" });
  });
  test("a switch that is off or not yet loaded is Off, even with a pick", () => {
    expect(foldValue(clis, "claude", false)).toEqual({ text: "Off", tone: "none" });
  });
  test("an on switch shows the label of the pick", () => {
    expect(foldValue(clis, "local", true)).toEqual({ text: "Local · qwen", tone: "ok" });
  });
  test("no effective pick is Off; the offered list not yet loaded is Checking", () => {
    expect(foldValue(clis, undefined, true)).toEqual({ text: "Off", tone: "none" });
    expect(foldValue(clis, "claude", undefined)).toEqual({ text: "Off", tone: "none" });
    expect(foldValue(null, undefined, undefined).text).toBe("Checking…");
  });
});

describe("switchBody", () => {
  test("a saved pick sends the switch only", () => {
    expect(switchBody(true, "claude", "claude", clis)).toEqual({ catchUp: true });
  });
  test("no saved pick also sends the effective pick, else the first offered model", () => {
    expect(switchBody(true, null, "claude", clis)).toEqual({ catchUp: true, pick: "claude" });
    expect(switchBody(true, null, undefined, [{ id: "local", label: "L" }])).toEqual({ catchUp: true, pick: "local" });
  });
  test("turning off never sends a pick", () => {
    expect(switchBody(false, null, "claude", clis)).toEqual({ catchUp: false });
  });
});
