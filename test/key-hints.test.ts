import { describe, expect, test } from "bun:test";

import { HOLD_MS, holdRule } from "../src/page/key-hints.ts";

const ev = (key: string, mods: Partial<Record<"repeat" | "metaKey" | "ctrlKey" | "shiftKey", boolean>> = {}) => ({
  key,
  repeat: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods,
});

/** A rule with a fake clock: `fire()` runs the pending timer. */
function setup() {
  const calls: boolean[] = [];
  let fn: (() => void) | undefined;
  let waits = 0;
  const rule = holdRule(
    (on) => calls.push(on),
    (f, ms) => {
      expect(ms).toBe(HOLD_MS);
      fn = f;
      waits++;
      return waits;
    },
    () => {
      fn = undefined;
    },
  );
  return { rule, calls, fire: () => fn?.(), waits: () => waits };
}

describe("hold rule", () => {
  test("a tap shows nothing", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.rule.up(ev("Alt"));
    s.fire();
    expect(s.calls).toEqual([]);
  });
  test("a hold shows, and release hides", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.fire();
    expect(s.calls).toEqual([true]);
    s.rule.up(ev("Alt"));
    expect(s.calls).toEqual([true, false]);
  });
  test("another key before the hold cancels it", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.rule.down(ev("a"));
    s.fire();
    expect(s.calls).toEqual([]);
  });
  test("another key after the hold hides", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.fire();
    s.rule.down(ev("a"));
    expect(s.calls).toEqual([true, false]);
  });
  test("Alt with Cmd, Ctrl or Shift starts no hold", () => {
    for (const m of ["metaKey", "ctrlKey", "shiftKey"] as const) {
      const s = setup();
      s.rule.down(ev("Alt", { [m]: true }));
      s.fire();
      expect(s.waits()).toBe(0);
      expect(s.calls).toEqual([]);
    }
  });
  test("a repeated Alt keydown neither restarts the hold nor hides", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.rule.down(ev("Alt", { repeat: true }));
    expect(s.waits()).toBe(1);
    s.fire();
    s.rule.down(ev("Alt", { repeat: true }));
    expect(s.calls).toEqual([true]);
  });
  test("hide() cancels a pending hold and hides shown hints", () => {
    const s = setup();
    s.rule.down(ev("Alt"));
    s.rule.hide();
    s.fire();
    expect(s.calls).toEqual([]);
    s.rule.down(ev("Alt"));
    s.fire();
    s.rule.hide();
    expect(s.calls).toEqual([true, false]);
  });
});
