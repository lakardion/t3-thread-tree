import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mapThreadRoutes, readMapThreads } from "../src/server/map-threads.ts";

describe("map threads file", () => {
  const dir = mkdtempSync(join(tmpdir(), "map-threads-"));
  const file = join(dir, "map-threads");
  let saves = 0;
  const post = mapThreadRoutes(file, () => saves++)["/map-threads"].POST;
  const send = (body: string, type = "application/json") =>
    post(new Request("http://x/map-threads", { method: "POST", body, headers: { "content-type": type } }));

  beforeEach(() => {
    rmSync(file, { force: true });
    saves = 0;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("a missing or invalid file reads empty", () => {
    expect(readMapThreads(file).size).toBe(0);
    writeFileSync(file, '{"a":1}');
    expect(readMapThreads(file).size).toBe(0);
  });
  test("a body that is not JSON gets 415", async () => {
    expect((await send("{}", "text/plain")).status).toBe(415);
    expect(saves).toBe(0);
  });
  test("an invalid body gets 400", async () => {
    expect((await send(JSON.stringify({ id: "a" }))).status).toBe(400);
    expect((await send("not json")).status).toBe(400);
    expect(saves).toBe(0);
  });
  test("mark adds the id and unmark removes it", async () => {
    expect(await (await send(JSON.stringify({ id: "a", marked: true }))).json()).toEqual(["a"]);
    await send(JSON.stringify({ id: "b", marked: true }));
    expect([...readMapThreads(file)]).toEqual(["a", "b"]);
    expect(await (await send(JSON.stringify({ id: "a", marked: false }))).json()).toEqual(["b"]);
    expect([...readMapThreads(file)]).toEqual(["b"]);
    expect(saves).toBe(3);
  });
});
