import { describe, expect, test } from "bun:test";

import { findRoutes } from "../src/server/find.ts";
import { find, hits } from "../src/shared/find.ts";
import type { Branch, ThreadNode } from "../src/shared/tree.ts";

const thread = (
  id: string,
  o: { title?: string; key?: string; branch?: string; prs?: number[]; settled?: boolean } = {},
  children: ThreadNode[] = [],
): ThreadNode =>
  ({
    id,
    title: o.title ?? id,
    key: o.key ?? null,
    settled: o.settled ?? false,
    prs: (o.prs ?? []).map((n) => ({ n })),
    detail: { branch: o.branch ?? null },
    children,
  }) as unknown as ThreadNode;
const branch = (id: string, threads: ThreadNode[] = [], branches: Branch[] = []): Branch => ({
  id,
  label: id,
  branches,
  threads,
});
const ids = (list: { t: ThreadNode }[]) => list.map((h) => h.t.id);

const list = hits([
  branch(
    "alpha",
    [],
    [branch("g", [thread("a", { title: "Fix login", key: "TIB-1", branch: "fix/auth", prs: [123] })])],
  ),
  branch("beta", [
    thread("b", { title: "Prelogin cleanup", key: "TIB-22" }, [thread("c", { title: "Child task" })]),
    thread("d", { title: "Login page", key: "MOR-5", prs: [456, 7] }),
  ]),
]);

describe("hits", () => {
  test("lists threads in tree order with project and parent", () => {
    expect(ids(list)).toEqual(["a", "b", "c", "d"]);
    expect(list.map((h) => h.project)).toEqual(["alpha", "beta", "beta", "beta"]);
    expect(list.map((h) => h.parent)).toEqual([null, null, "Prelogin cleanup", null]);
  });
});

describe("find fields", () => {
  test.each([
    ["fix login", ["a"]],
    ["tib-22", ["b"]],
    ["beta", ["b", "c", "d"]],
    ["fix/auth", ["a"]],
    ["#123", ["a"]],
    ["123", ["a"]],
    ["456", ["d"]],
  ])("%s", (q, want) => expect(ids(find(list, q)).toSorted()).toEqual(want));
  test("is case-insensitive", () => expect(ids(find(list, "FIX LOGIN"))).toEqual(["a"]));
  test("12 matches PR 123", () => expect(ids(find(list, "12"))).toEqual(["a"]));
  test("needs every word", () => {
    expect(ids(find(list, "login mor"))).toEqual(["d"]);
    expect(find(list, "login nothing")).toEqual([]);
  });
  test("an empty or blank query matches nothing", () => {
    expect(find(list, "")).toEqual([]);
    expect(find(list, "  ")).toEqual([]);
  });
});

describe("find order", () => {
  test("a title-word start ranks before a match inside a word", () => {
    expect(ids(find(list, "login"))).toEqual(["a", "d", "b"]);
  });
  test("an issue key match ranks before a match in another field", () => {
    const l = hits([branch("p", [thread("x", { title: "tib work" }), thread("y", { title: "other", key: "TIB-9" })])]);
    expect(ids(find(l, "tib"))).toEqual(["x", "y"]);
    const k = hits([
      branch("p", [thread("x", { title: "a-tib", branch: "tib" }), thread("y", { title: "xtib", key: "TIB-9" })]),
    ]);
    expect(ids(find(k, "tib"))).toEqual(["x", "y"]);
  });
  test("ties keep tree order", () => {
    const l = hits([branch("p", [thread("x", { title: "Same" }), thread("y", { title: "Same" })])]);
    expect(ids(find(l, "same"))).toEqual(["x", "y"]);
  });
});

describe("GET /find", () => {
  const tree = [
    branch("p", [
      thread("live", { title: "Fix live" }),
      thread("old", { title: "Fix old", settled: true }, [thread("kid", { title: "Fix kid", settled: true })]),
    ]),
  ];
  const { GET } = findRoutes(() => tree)["/find"];
  const get = async (url: string) => (await GET(new Request(`http://x${url}`)).json()) as { t: ThreadNode }[];
  test("returns the settled matches without children", async () => {
    const out = await get("/find?q=fix");
    expect(ids(out)).toEqual(["old", "kid"]);
    expect(out[0].t.children).toEqual([]);
  });
  test("applies the match", async () => expect(ids(await get("/find?q=kid"))).toEqual(["kid"]));
  test("gives an empty list for a blank or missing q", async () => {
    expect(await get("/find?q=%20")).toEqual([]);
    expect(await get("/find")).toEqual([]);
  });
});
