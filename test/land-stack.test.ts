import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { scanFields, scanSettings } from "../src/server/workflow-start.ts";
import { gateOf, layersOf, nextLayer, titleOf, type View } from "../workflows/lib/land-stack.ts";

const pull = (number: number, state: string, merged_at: string | null = null) => ({ number, state, merged_at });

describe("layersOf", () => {
  const json = [
    { number: 9, pull_requests: [pull(1, "closed", "t"), pull(2, "closed"), pull(3, "open"), pull(4, "open")] },
    { number: 8, pull_requests: [pull(7, "open")] },
  ];

  test("maps the states and cuts the layers above the top", () => {
    expect(layersOf(json, 3)).toEqual({
      stack: 9,
      layers: [
        { number: 1, state: "merged" },
        { number: 2, state: "closed" },
        { number: 3, state: "open" },
      ],
    });
  });

  test("is null when no stack holds the top", () => {
    expect(layersOf(json, 5)).toBeNull();
    expect(layersOf({}, 1)).toBeNull();
  });
});

describe("nextLayer", () => {
  const layers = (...states: ("open" | "closed" | "merged")[]) => states.map((state, i) => ({ number: i + 1, state }));

  test("skips merged layers", () => {
    expect(nextLayer(layers("merged", "open", "open"), [1, 2, 3])).toEqual({ kind: "land", n: 2 });
  });

  test("skips layers below the first start layer", () => {
    expect(nextLayer(layers("open", "open", "open"), [2, 3])).toEqual({ kind: "land", n: 2 });
  });

  test("does not land layers below a first start layer that left the stack", () => {
    expect(nextLayer(layers("open", "open", "open"), [2, 3, 9])).toEqual({ kind: "land", n: 2 });
    expect(nextLayer(layers("open", "open"), [9])).toEqual({ kind: "done" });
  });

  test("lands a layer inserted between start layers", () => {
    expect(nextLayer(layers("merged", "open", "open"), [1, 3])).toEqual({ kind: "land", n: 2 });
  });

  test("returns closed for a closed layer", () => {
    expect(nextLayer(layers("closed", "open"), [1, 2])).toEqual({ kind: "closed", n: 1 });
  });

  test("is done when every layer is merged", () => {
    expect(nextLayer(layers("merged", "merged"), [1, 2])).toEqual({ kind: "done" });
  });
});

describe("gateOf", () => {
  const view = (over: Partial<View> = {}): View => ({
    state: "OPEN",
    isDraft: false,
    reviewDecision: null,
    mergeStateStatus: "CLEAN",
    mergeable: "MERGEABLE",
    headRefOid: "a",
    headRefName: "head",
    baseRefName: "base",
    ...over,
  });

  test("applies the rules in order", () => {
    expect(gateOf(view({ state: "MERGED", isDraft: true }), false)).toBe("merged");
    expect(gateOf(view({ state: "CLOSED" }), false)).toBe("closed");
    expect(gateOf(view({ isDraft: true, mergeable: "CONFLICTING" }), false)).toBe("draft");
    expect(gateOf(view({ reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING" }), false)).toBe("changes");
    expect(gateOf(view({ mergeable: "CONFLICTING", mergeStateStatus: "BEHIND" }), false)).toBe("conflict");
    expect(gateOf(view({ mergeStateStatus: "DIRTY" }), false)).toBe("conflict");
    expect(gateOf(view({ mergeStateStatus: "BEHIND" }), false)).toBe("behind");
  });

  test("treats clean, unstable and blocked as ready", () => {
    for (const mergeStateStatus of ["CLEAN", "UNSTABLE", "BLOCKED"]) {
      expect(gateOf(view({ mergeStateStatus }), false)).toBe("ready");
    }
  });

  test("skips the review rules when told to", () => {
    expect(gateOf(view({ isDraft: true, reviewDecision: "CHANGES_REQUESTED" }), true)).toBe("ready");
  });
});

describe("titleOf", () => {
  test("adds the progress for a layer of the start list", () => {
    expect(titleOf("a/b", [1, 2, 3], 2)).toBe("Land a/b #1→#3 (2/3)");
  });

  test("leaves it out for a layer inserted later", () => {
    expect(titleOf("a/b", [1, 3], 2)).toBe("Land a/b #1→#3");
  });
});

describe("workflow file", () => {
  const source = readFileSync(new URL("../workflows/land-stack.ts", import.meta.url), "utf8");
  const files = [{ source, workflows: ["land-stack"] }];

  test("the start dialog fills the stack and the project only", () => {
    expect(scanFields(files).get("land-stack")).toEqual(["stack", "project"]);
  });

  test("Settings shows the extra prompt", () => {
    expect(scanSettings(files).get("land-stack")).toEqual([
      { key: "settings/land-stack/extra-prompt", field: "extra-prompt", type: "string" },
    ]);
  });
});
