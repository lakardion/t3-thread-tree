import { describe, expect, test } from "bun:test";

import { effectivePick, foldValue, switchBody } from "../src/page/catch-up-fold.ts";
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

describe("effectivePick", () => {
  const all: Offered = [
    { id: "claude", label: "Claude Haiku" },
    { id: "codex", label: "Codex Luna" },
    { id: "apple", label: "Apple model" },
    { id: "local", label: "Local · qwen" },
  ];
  const onlyApple: Offered = [
    { id: "apple", label: "Apple model" },
    { id: "local", label: "Local · qwen" },
  ];
  test("a saved pick that is offered wins, including apple and local", () => {
    expect(effectivePick(all, "apple")).toBe("apple");
    expect(effectivePick(all, "local")).toBe("local");
  });
  test("no saved pick takes the first offered pick that is not local or apple", () => {
    expect(effectivePick(all, null)).toBe("claude");
  });
  test("a saved pick that is not offered falls back", () => {
    expect(effectivePick(all.slice(1), "claude")).toBe("codex");
  });
  test("only apple and local offered gives no pick, and the switch saves the first offered", () => {
    expect(effectivePick(onlyApple, null)).toBeUndefined();
    expect(switchBody(true, null, undefined, onlyApple)).toEqual({ catchUp: true, pick: "apple" });
  });
});
