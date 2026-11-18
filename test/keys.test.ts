import { describe, expect, test } from "bun:test";

import { pageKey, type KeyContext, type KeyEvent } from "../src/page/keys.ts";

const ev = (key: string, mods: Partial<KeyEvent> = {}): KeyEvent => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  defaultPrevented: false,
  ...mods,
});
const ctx = (c: Partial<KeyContext> = {}): KeyContext => ({
  mac: true,
  field: false,
  panel: false,
  overlay: null,
  ...c,
});

describe("plain keys", () => {
  test("n and 1 to 3 act on a free page", () => {
    expect(pageKey(ev("n"), ctx())).toBe("next");
    expect(pageKey(ev("1"), ctx())).toBe(0);
    expect(pageKey(ev("2"), ctx())).toBe(1);
    expect(pageKey(ev("3"), ctx())).toBe(2);
  });
  test("4 and other keys do nothing", () => {
    expect(pageKey(ev("4"), ctx())).toBeNull();
    expect(pageKey(ev("/"), ctx())).toBeNull();
  });
  test("do nothing in a field, with the panel open, or with an overlay", () => {
    for (const c of [
      ctx({ field: true }),
      ctx({ panel: true }),
      ctx({ overlay: "dialog" }),
      ctx({ overlay: "menu" }),
      ctx({ overlay: "find" }),
    ]) {
      expect(pageKey(ev("n"), c)).toBeNull();
      expect(pageKey(ev("1"), c)).toBeNull();
    }
  });
  test("do nothing with a modifier, on repeat, or when handled", () => {
    for (const m of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(pageKey(ev("n", m), ctx())).toBeNull();
    }
    expect(pageKey(ev("n", { repeat: true }), ctx())).toBeNull();
    expect(pageKey(ev("n", { defaultPrevented: true }), ctx())).toBeNull();
  });
});

describe("Find key", () => {
  test("Cmd+K on mac and Ctrl+K elsewhere open Find", () => {
    expect(pageKey(ev("k", { metaKey: true }), ctx())).toBe("find");
    expect(pageKey(ev("K", { metaKey: true }), ctx())).toBe("find");
    expect(pageKey(ev("k", { ctrlKey: true }), ctx({ mac: false }))).toBe("find");
  });
  test("works in a field, with the panel open, and with Find open", () => {
    expect(pageKey(ev("k", { metaKey: true }), ctx({ field: true }))).toBe("find");
    expect(pageKey(ev("k", { metaKey: true }), ctx({ panel: true }))).toBe("find");
    expect(pageKey(ev("k", { metaKey: true }), ctx({ field: true, overlay: "find" }))).toBe("find");
  });
  test("does nothing in another dialog or a menu", () => {
    expect(pageKey(ev("k", { metaKey: true }), ctx({ overlay: "dialog" }))).toBeNull();
    expect(pageKey(ev("k", { metaKey: true }), ctx({ overlay: "menu" }))).toBeNull();
  });
  test("ignores the other platform key and extra modifiers", () => {
    expect(pageKey(ev("k", { ctrlKey: true }), ctx())).toBeNull();
    expect(pageKey(ev("k", { metaKey: true }), ctx({ mac: false }))).toBeNull();
    expect(pageKey(ev("k", { metaKey: true, shiftKey: true }), ctx())).toBeNull();
  });
});
