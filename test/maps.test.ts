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

type Row = [spawner: string | null, key: string | null, created: number, step?: boolean];

/** Threads as `id: [spawner, key, createdAt, isStep]`. Ids missing from the table are unknown. */
function maps(table: Record<string, Row>, ids: string[], extra: { stacks?: string[][]; issueKeys?: string[] } = {}) {
  return mapsOf({
    ids,
    spawnerOf: (id) => table[id]?.[0],
    known: (id) => id in table,
    isStep: (id) => !!table[id]?.[3],
    keyOf: (id) => table[id]?.[1] ?? null,
    createdKey: (id) => String(table[id]?.[2] ?? 0).padStart(4, "0"),
    stacks: extra.stacks,
    issueKeyOf: (id) => !!extra.issueKeys?.includes(id),
  });
}

describe("mapsOf", () => {
  test("a map thread that is the root", () => {
    const m = maps({ root: [null, null, 1], t1: ["root", "K", 2], t2: ["root", "K", 3], s: ["t1", null, 4] }, [
      "root",
      "t1",
      "t2",
      "s",
    ]);
    expect(m.threadOf("root", "K")).toBe("root");
    expect(m.anchors.get("root")).toEqual(["K"]);
    expect(m.mapOf("t1")).toBe("K");
    expect(m.mapOf("s")).toBe("K");
    expect(m.mapOf("root")).toBeNull();
  });

  test("a program root with several maps", () => {
    const m = maps({ root: [null, null, 1], a: ["root", "K", 2], b: ["root", "L", 3] }, ["root", "a", "b"]);
    expect(m.anchors.get("root")).toEqual(["K", "L"]);
  });

  test("a sub-map in a ticket thread", () => {
    const m = maps({ root: [null, null, 1], t: ["root", "P", 2], s: ["t", "S", 3] }, ["root", "t", "s"]);
    expect(m.threadOf("root", "S")).toBe("t");
    expect(m.mapOf("t")).toBe("P");
    expect(m.groups.get("root")).toEqual(["t", "s"]);
  });

  test("a relay chain with the root many hops above the charting thread", () => {
    const m = maps(
      {
        root: [null, null, 1],
        r1: ["root", null, 2],
        r2: ["r1", null, 3],
        chart: ["r2", null, 4],
        t1: ["chart", "K", 5],
        t2: ["chart", "K", 6],
      },
      ["root", "r1", "r2", "chart", "t1", "t2"],
    );
    expect(m.threadOf("root", "K")).toBe("chart");
    expect(m.rootOf("t1")).toBe("root");
    expect(m.groups.get("root")).toEqual(["r1", "r2", "chart", "t1", "t2"]);
  });

  test("a keyed root has no map thread", () => {
    const m = maps({ root: [null, "K", 1], a: ["root", null, 2] }, ["root", "a"]);
    expect(m.threadOf("root", "K")).toBeUndefined();
    expect(m.mapOf("a")).toBe("K");
  });

  test("a keyed hand-started thread is its own root; one key in two groups has a map thread each", () => {
    const m = maps(
      {
        c1: [null, null, 1],
        x: ["c1", "K", 2],
        h: [null, "K", 3],
        c2: [null, null, 4],
        y: ["c2", "K", 5],
      },
      ["c1", "x", "h", "c2", "y"],
    );
    expect(m.rootOf("h")).toBe("h");
    expect(m.groups.get("c1")).toEqual(["x"]);
    expect(m.threadOf("c1", "K")).toBe("c1");
    expect(m.threadOf("c2", "K")).toBe("c2");
  });

  test("an unknown spawner ends the chain", () => {
    const m = maps({ a: ["b", null, 3], b: ["x", null, 2], k: ["x", "K", 4] }, ["a", "b", "k"]);
    expect(m.rootOf("a")).toBe("b");
    expect(m.threadOf("k", "K")).toBeUndefined();
    expect(m.groups.has("k")).toBe(false);
  });

  test("a step thread is never a member or a root; its child is its own root", () => {
    const m = maps({ root: [null, null, 1], st: ["root", null, 2, true], c: ["st", null, 3] }, ["root", "st", "c"]);
    expect(m.rootOf("st")).toBeNull();
    expect(m.mapOf("st")).toBeNull();
    expect(m.rootOf("c")).toBe("c");
    expect([...m.groups.values()].flat()).toEqual([]);
  });

  test("stack mates join the group of the lowest member", () => {
    const m = maps(
      {
        a: [null, null, 1],
        m1: ["a", null, 2],
        lone: [null, null, 3],
        b: [null, null, 4],
        m2: ["b", null, 5],
        issue: [null, null, 6],
        child: [null, null, 7],
        kid: ["child", null, 8],
        spawned: ["a", null, 9],
      },
      ["a", "m1", "lone", "b", "m2", "issue", "child", "kid", "spawned"],
      { stacks: [["m1", "lone", "m2", "issue", "child", "spawned"]], issueKeys: ["issue"] },
    );
    expect(m.mates.get("lone")).toBe("a");
    expect(m.mates.has("m2")).toBe(false);
    expect(m.mates.has("issue")).toBe(false);
    expect(m.mates.has("child")).toBe(false);
    expect(m.mates.has("spawned")).toBe(false);
  });

  test("a group shows only while a member is in ids", () => {
    const table: Record<string, Row> = { root: [null, "K", 1], a: ["root", null, 2], b: ["root", null, 3] };
    expect(maps(table, ["root"]).groups.has("root")).toBe(false);
    expect(maps(table, ["root", "b"]).groups.get("root")).toEqual(["b"]);
    const plain: Record<string, Row> = { root: [null, null, 1], a: ["root", "K", 2] };
    expect(maps(plain, ["root"]).groups.has("root")).toBe(false);
  });

  test("the lone mate goes to the group of the lowest member", () => {
    const m = maps(
      { a: [null, null, 1], m1: ["a", null, 2], lone: [null, null, 3], b: [null, null, 4], m2: ["b", null, 5] },
      ["a", "m1", "lone", "b", "m2"],
      { stacks: [["m2", "lone", "m1"]] },
    );
    expect(m.mates.get("lone")).toBe("b");
  });

  test("a spawner-less thread that spawned a candidate is no mate", () => {
    const m = maps(
      { a: [null, null, 1], m1: ["a", null, 2], p: [null, null, 3], q: ["p", null, 4] },
      ["a", "m1", "p", "q"],
      { stacks: [["m1", "p"]] },
    );
    expect(m.groups.get("p")).toEqual(["q"]);
    expect(m.mates.has("p")).toBe(false);
  });

  test("a hidden keyed ancestor still gives its key; chain loops end", () => {
    const m = maps({ c: [null, null, 1], d: ["c", "K", 2], s: ["d", null, 3] }, ["s"]);
    expect(m.mapOf("s")).toBe("K");
    expect(() => maps({ a: ["b", null, 1], b: ["a", null, 2] }, ["a"])).not.toThrow();
  });
});
