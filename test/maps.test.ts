import { describe, expect, test } from "bun:test";

import { mapKey, mapName, mapsOf } from "../src/server/maps.ts";

const HOME = "/home/u";
const WS = "/work/app";
const key = (text: string) => mapKey(text, WS, HOME);

describe("mapKey", () => {
  test("the four skill-call forms", () => {
    const k = "/home/u/repos/wiki/a/map";
    expect(key("/wayfinder ~/repos/wiki/a/map/map.md go")).toBe(k);
    expect(key("$wayfinder ~/repos/wiki/a/map/map.md go")).toBe(k);
    expect(key("/wayfinder-implement ~/repos/wiki/a/map/map.md")).toBe(k);
    expect(key("Invoke the wayfinder skill with arguments: ~/repos/wiki/a/map/map.md")).toBe(k);
    expect(key("Invoke the wayfinder-implement skill with arguments:\n~/repos/wiki/a/map/map.md x")).toBe(k);
    expect(
      key(
        "<command-message>wayfinder</command-message>\n<command-name>/wayfinder</command-name>\n<command-args>~/repos/wiki/a/map/map.md</command-args>",
      ),
    ).toBe(k);
  });

  test("the token can come after a newline", () => {
    expect(key("/wayfinder\n~/repos/wiki/a/map/map.md")).toBe("/home/u/repos/wiki/a/map");
  });

  test("URLs lose query and fragment", () => {
    expect(key("/wayfinder https://github.com/o/r/issues/33?x=1#c")).toBe("https://github.com/o/r/issues/33");
    expect(key("/wayfinder http://linear.app/ws/issue/E-1/s")).toBe("http://linear.app/ws/issue/E-1/s");
  });

  test("path rules", () => {
    expect(key("/wayfinder /abs/x/../y/map.md")).toBe("/abs/y");
    expect(key("/wayfinder .wayfinder/map.md")).toBe("/work/app/.wayfinder");
    expect(key("/wayfinder ./.wayfinder/map.md")).toBe("/work/app/.wayfinder");
    expect(key("/wayfinder t3-thread-tree/issues/m/map.md")).toBe("/home/u/repos/wiki/t3-thread-tree/issues/m");
    expect(mapKey("/wayfinder .wayfinder/map.md", undefined, HOME)).toBeNull();
  });

  test("no key", () => {
    expect(key("/wayfinder continue with the next ticket")).toBeNull();
    expect(key("/wayfinder ENG-5432")).toBeNull();
    expect(key("/wayfinder")).toBeNull();
    expect(key("<command-name>/wayfinder</command-name><command-args></command-args>")).toBeNull();
    expect(key("please /wayfinder ~/a/map.md")).toBeNull();
    expect(key("/other ~/a/map.md")).toBeNull();
  });
});

describe("mapName", () => {
  test("title without the word Wayfinder", () => {
    expect(mapName("/a/b", "Wayfinder: Search revamp", ["/a/b"])).toBe("Search revamp");
    expect(mapName("/a/b", "Search revamp - WAYFINDER", ["/a/b"])).toBe("Search revamp");
    expect(mapName("/a/workflow-runs-tree", "Wayfinder", ["/a/workflow-runs-tree"])).toBe("Workflow runs tree");
  });

  test("folder name without a title", () => {
    expect(mapName("/a/workflow-runs-tree", null, ["/a/workflow-runs-tree"])).toBe("Workflow runs tree");
  });

  test("same folder name adds the parent folder", () => {
    const keys = ["/w/TIB-3860/wayfinder", "/w/MOR-1/wayfinder"];
    expect(mapName(keys[0], null, keys)).toBe("TIB-3860/wayfinder");
  });

  test("URL key uses its last path part", () => {
    expect(mapName("https://github.com/o/r/issues/33", null, [])).toBe("#33");
  });
});

/** Threads as `id: [spawner, key, createdAt]`. */
function maps(table: Record<string, [string | null, string | null, number]>, visible: string[]) {
  return mapsOf({
    ids: visible,
    spawnerOf: (id) => table[id]?.[0],
    keyOf: (id) => table[id]?.[1] ?? null,
    createdKey: (id) => String(table[id]?.[2] ?? 0).padStart(4, "0"),
  });
}

describe("mapsOf", () => {
  test("map thread is the spawner of the topmost keyed threads; members by own key or keyed ancestor", () => {
    const m = maps(
      {
        chart: [null, null, 1],
        t1: ["chart", "K", 2],
        t2: ["chart", "K", 3],
        sub: ["t1", null, 4],
        loose: ["chart", null, 5],
      },
      ["chart", "t1", "t2", "sub", "loose"],
    );
    expect(m.threadOf.get("K")).toBe("chart");
    expect(m.mapOf("t1")).toBe("K");
    expect(m.mapOf("sub")).toBe("K");
    expect(m.mapOf("loose")).toBeNull();
    expect(m.mapOf("chart")).toBeNull();
    expect(m.anchors.get("chart")).toEqual(["K"]);
  });

  test("two spawners: the spawner of the earliest keyed thread wins", () => {
    const m = maps({ a: [null, null, 1], b: [null, null, 2], x: ["b", "K", 3], y: ["a", "K", 4] }, [
      "a",
      "b",
      "x",
      "y",
    ]);
    expect(m.threadOf.get("K")).toBe("b");
  });

  test("hand-started keyed thread joins; no spawner anywhere means no map thread", () => {
    const m = maps({ c: [null, null, 1], x: ["c", "K", 2], h: [null, "K", 3], o: [null, "L", 4] }, [
      "c",
      "x",
      "h",
      "o",
    ]);
    expect(m.threadOf.get("K")).toBe("c");
    expect(m.mapOf("h")).toBe("K");
    expect(m.threadOf.has("L")).toBe(false);
  });

  test("a keyed ancestor with the same key is not topmost", () => {
    const m = maps({ c: [null, null, 1], x: ["c", "K", 2], y: ["x", "K", 3] }, ["c", "x", "y"]);
    expect(m.threadOf.get("K")).toBe("c");
    expect(m.anchors.get("x")).toBeUndefined();
  });

  test("one thread can anchor several maps", () => {
    const m = maps({ c: [null, null, 1], x: ["c", "K", 2], y: ["c", "L", 3] }, ["c", "x", "y"]);
    expect(m.anchors.get("c")).toEqual(["K", "L"]);
  });

  test("sub-map: its map thread is a member of the parent", () => {
    const m = maps({ c: [null, null, 1], t: ["c", "P", 2], s: ["t", "S", 3], u: ["t", "P", 4] }, ["c", "t", "s", "u"]);
    expect(m.threadOf.get("S")).toBe("t");
    expect(m.mapOf("t")).toBe("P");
    expect(m.mapOf("s")).toBe("S");
  });

  test("a hidden keyed ancestor still gives its key; chain loops end", () => {
    const m = maps({ c: [null, null, 1], d: ["c", "K", 2], s: ["d", null, 3] }, ["s"]);
    expect(m.mapOf("s")).toBe("K");
    expect(() => maps({ a: ["b", null, 1], b: ["a", null, 2] }, ["a"])).not.toThrow();
  });
});
