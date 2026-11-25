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
  stop: null,
  ...c,
});

describe("pin key", () => {
  test("p pins a thread or header stop, and does nothing with no stop", () => {
    expect(pageKey(ev("p"), ctx({ stop: "thread" }))).toBe("pin");
    expect(pageKey(ev("p"), ctx({ stop: "header" }))).toBe("pin");
    expect(pageKey(ev("p"), ctx())).toBeNull();
    expect(pageKey(ev("p", { repeat: true }), ctx({ stop: "thread" }))).toBeNull();
  });
});

describe("plain keys", () => {
  test("n acts on a free page, 1 does nothing", () => {
    expect(pageKey(ev("n"), ctx())).toBe("next");
    expect(pageKey(ev("1"), ctx())).toBeNull();
  });
  test("t opens Triage", () => {
    expect(pageKey(ev("t"), ctx())).toBe("triage");
    expect(pageKey(ev("t"), ctx({ stop: "thread" }))).toBe("triage");
    expect(pageKey(ev("t", { repeat: true }), ctx())).toBeNull();
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
      expect(pageKey(ev("t"), c)).toBeNull();
    }
  });
  test("do nothing with a modifier, on repeat, or when handled", () => {
    for (const m of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(pageKey(ev("n", m), ctx())).toBeNull();
      expect(pageKey(ev("t", m), ctx())).toBeNull();
    }
    expect(pageKey(ev("n", { repeat: true }), ctx())).toBeNull();
    expect(pageKey(ev("o", { repeat: true }), ctx({ stop: "thread" }))).toBeNull();
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

describe("row keys", () => {
  test("j and k move anywhere on a free page, also on repeat", () => {
    expect(pageKey(ev("j"), ctx())).toBe("down");
    expect(pageKey(ev("k"), ctx())).toBe("up");
    expect(pageKey(ev("j", { repeat: true }), ctx({ stop: "header" }))).toBe("down");
    expect(pageKey(ev("k", { repeat: true }), ctx())).toBe("up");
  });
  test("arrows move only from a stop, also on repeat", () => {
    expect(pageKey(ev("ArrowDown"), ctx())).toBeNull();
    expect(pageKey(ev("ArrowUp"), ctx())).toBeNull();
    expect(pageKey(ev("ArrowDown"), ctx({ stop: "header" }))).toBe("down");
    expect(pageKey(ev("ArrowUp", { repeat: true }), ctx({ stop: "thread" }))).toBe("up");
  });
  test("o, l and h act on any stop", () => {
    for (const stop of ["thread", "header"] as const) {
      expect(pageKey(ev("o"), ctx({ stop }))).toBe("toggle");
      expect(pageKey(ev("l"), ctx({ stop }))).toBe("expand");
      expect(pageKey(ev("h"), ctx({ stop }))).toBe("collapse");
    }
    for (const k of ["o", "l", "h"]) expect(pageKey(ev(k), ctx())).toBeNull();
  });
  test("s acts only on a thread stop", () => {
    expect(pageKey(ev("s"), ctx({ stop: "thread" }))).toBe("send");
    expect(pageKey(ev("s"), ctx({ stop: "header" }))).toBeNull();
    expect(pageKey(ev("s"), ctx())).toBeNull();
  });
  test("do nothing in a field, with the panel or an overlay, or with a modifier", () => {
    for (const c of [
      ctx({ stop: "thread", field: true }),
      ctx({ stop: "thread", panel: true }),
      ctx({ stop: "thread", overlay: "dialog" }),
      ctx({ stop: "thread", overlay: "menu" }),
      ctx({ stop: "thread", overlay: "find" }),
    ]) {
      for (const k of ["j", "k", "ArrowDown", "ArrowUp", "o", "l", "h", "s"]) expect(pageKey(ev(k), c)).toBeNull();
    }
    for (const k of ["j", "ArrowDown", "o", "s"]) {
      for (const m of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }]) {
        expect(pageKey(ev(k, m), ctx({ stop: "thread" }))).toBeNull();
      }
    }
  });
});
