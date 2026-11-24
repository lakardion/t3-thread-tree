import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import {
  cliPath,
  type CliRun,
  projectChoices,
  sendArgs,
  sendService,
  startArgs,
  workflowStartArgs,
} from "../src/server/send.ts";

describe("argv", () => {
  test("send and start shapes", () => {
    expect(sendArgs("t3", "th:1")).toEqual(["t3", "thread", "send", "--json", "th:1", "-"]);
    expect(startArgs("t3", "p1", "SHOP-1 Fix")).toEqual([
      "t3",
      "thread",
      "start",
      "--json",
      "--title=SHOP-1 Fix",
      "p1",
      "-",
    ]);
  });

  test("workflow start shape: input and key are single items", () => {
    expect(workflowStartArgs("t3", "review", { text: "-x" }, "review/none/1")).toEqual([
      "t3",
      "workflow",
      "start",
      "--json",
      '--input={"text":"-x"}',
      "--key=review/none/1",
      "review",
    ]);
  });

  test("a title that starts with a dash stays one --title item", () => {
    expect(startArgs("t3", "p1", "--x y")).toContain("--title=--x y");
  });
});

describe("cliPath", () => {
  test("T3_BIN wins, else the default", () => {
    expect(cliPath({ T3_BIN: " /opt/t3 " })).toBe("/opt/t3");
    expect(cliPath({})).toBe(`${homedir()}/.t3/bin/t3`);
  });
});

describe("sendService", () => {
  type Result = Awaited<ReturnType<CliRun>>;
  const ok = (stdout: string): Result => ({ code: 0, stdout, stderr: "", timedOut: false });

  function setup(result: Result | Error = ok('{"delivery":"queued"}'), available = true) {
    const calls: { argv: string[]; stdin: string }[] = [];
    const svc = sendService({
      cli: Promise.resolve({ available, path: "/bin/t3" }),
      hasThread: (id) => id === "T",
      hasProject: (id) => id === "P",
      run: async (argv, stdin) => {
        calls.push({ argv, stdin });
        if (result instanceof Error) throw result;
        return result;
      },
    });
    const call = async (route: "/t3/send" | "/t3/start" | "/t3/workflows/start", body: unknown) => {
      const res = await svc.routes[route].POST(
        new Request(`http://x${route}`, {
          method: "POST",
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
      );
      return { status: res.status, json: (await res.json()) as Record<string, unknown> };
    };
    return { calls, call, svc };
  }

  const SEND = { threadId: "T", message: "hi" };
  const START = { projectId: "P", title: " SHOP-1 ", message: "go" };

  test("GET /t3/cli", async () => {
    const res = await setup(undefined, false).svc.routes["/t3/cli"].GET();
    expect(await res.json()).toEqual({ available: false, path: "/bin/t3" });
  });

  test("the message reaches stdin and never argv; the title is trimmed", async () => {
    const s = setup(ok('{"threadId":"new"}'));
    expect(await s.call("/t3/start", START)).toEqual({ status: 200, json: { threadId: "new" } });
    expect(s.calls[0].stdin).toBe("go");
    expect(s.calls[0].argv).toContain("--title=SHOP-1");
    expect(s.calls[0].argv.join(" ")).not.toContain("go");
    const t = setup();
    expect(await t.call("/t3/send", SEND)).toMatchObject({ status: 200, json: { delivery: "queued" } });
    expect(t.calls[0].stdin).toBe("hi");
  });

  test("unknown ids give 404 and do not run the CLI", async () => {
    const s = setup();
    expect(await s.call("/t3/send", { ...SEND, threadId: "X" })).toMatchObject({
      status: 404,
      json: { error: "Unknown thread" },
    });
    expect(await s.call("/t3/start", { ...START, projectId: "X" })).toMatchObject({
      status: 404,
      json: { error: "Unknown project" },
    });
    expect(s.calls).toHaveLength(0);
  });

  test("a gone thread gives 404 and does not run the CLI", async () => {
    const s = setup();
    expect(await s.call("/t3/send", { ...SEND, threadId: "GONE" })).toMatchObject({
      status: 404,
      json: { error: "Unknown thread" },
    });
    expect(s.calls).toHaveLength(0);
  });

  test("bad bodies give 400", async () => {
    const s = setup();
    expect((await s.call("/t3/send", "{")).status).toBe(400);
    expect(await s.call("/t3/send", { threadId: "T" })).toMatchObject({
      status: 400,
      json: { error: "Missing message" },
    });
    expect(await s.call("/t3/send", { threadId: "T", message: 1 })).toMatchObject({ status: 400 });
    expect(await s.call("/t3/send", { ...SEND, message: "  " })).toMatchObject({
      status: 400,
      json: { error: "Empty message" },
    });
    expect(await s.call("/t3/start", { ...START, title: " " })).toMatchObject({
      status: 400,
      json: { error: "Empty title" },
    });
    expect(await s.call("/t3/start", { projectId: "P", message: "m" })).toMatchObject({
      status: 400,
      json: { error: "Missing title" },
    });
    expect(s.calls).toHaveLength(0);
  });

  test("an unavailable CLI gives 503 without a run", async () => {
    const s = setup(undefined, false);
    expect(await s.call("/t3/send", SEND)).toMatchObject({
      status: 503,
      json: { error: "No t3 CLI at /bin/t3. Set T3_BIN in .env." },
    });
    expect(s.calls).toHaveLength(0);
  });

  test("spawn ENOENT gives 503", async () => {
    const s = setup(Object.assign(new Error("x"), { code: "ENOENT" }));
    expect((await s.call("/t3/send", SEND)).status).toBe(503);
  });

  test("spawn EACCES gives 503", async () => {
    const s = setup(Object.assign(new Error("x"), { code: "EACCES" }));
    expect((await s.call("/t3/send", SEND)).status).toBe(503);
  });

  test("a signal kill gives 502 with a null exit code", async () => {
    const s = setup({ code: null, stdout: "", stderr: "", timedOut: false });
    expect(await s.call("/t3/send", SEND)).toMatchObject({
      status: 502,
      json: { error: "t3 was killed by a signal", exitCode: null },
    });
  });

  test("non-zero exit gives 502 with the last stderr line and the tail", async () => {
    const s = setup({ code: 1, stdout: "", stderr: "first\nlast line\n\n", timedOut: false });
    expect(await s.call("/t3/send", SEND)).toEqual({
      status: 502,
      json: { error: "last line", exitCode: 1, stderrTail: "first\nlast line\n\n" },
    });
  });

  test("exit 127 and empty stderr give 502", async () => {
    const s = setup({ code: 127, stdout: "", stderr: "", timedOut: false });
    expect(await s.call("/t3/send", SEND)).toMatchObject({
      status: 502,
      json: { error: "t3 exited with code 127", exitCode: 127 },
    });
  });

  test("timeout gives 502 with a null exit code", async () => {
    const s = setup({ code: null, stdout: "", stderr: "", timedOut: true });
    expect(await s.call("/t3/send", SEND)).toMatchObject({ status: 502, json: { error: "timed out", exitCode: null } });
  });

  test("bad stdout gives 502", async () => {
    expect(await setup(ok("nope")).call("/t3/send", SEND)).toMatchObject({ status: 502, json: { exitCode: null } });
    expect((await setup(ok('{"delivery":"later"}')).call("/t3/send", SEND)).status).toBe(502);
    expect((await setup(ok("{}")).call("/t3/start", START)).status).toBe(502);
  });

  test("the stderr tail keeps the last 2048 characters", async () => {
    const s = setup({ code: 1, stdout: "", stderr: `a${"b".repeat(3000)}`, timedOut: false });
    const { json } = await s.call("/t3/send", SEND);
    expect((json.stderrTail as string).length).toBe(2048);
    expect(json.stderrTail as string).not.toContain("a");
  });

  describe("workflow start", () => {
    const WF = { workflow: "review", input: { text: "go" }, key: "review/none/1" };

    test("runs the CLI with no stdin and answers the run id", async () => {
      const s = setup(ok('{"run":{"runId":"wr_1"}}'));
      expect(await s.call("/t3/workflows/start", WF)).toEqual({ status: 200, json: { runId: "wr_1" } });
      expect(s.calls).toEqual([
        { argv: workflowStartArgs("/bin/t3", "review", { text: "go" }, "review/none/1"), stdin: "" },
      ]);
    });

    test("a payload error gives 502 with the last stderr line", async () => {
      const s = setup({ code: 1, stdout: "", stderr: "x\nThe payload does not fit\n", timedOut: false });
      expect(await s.call("/t3/workflows/start", WF)).toMatchObject({
        status: 502,
        json: { error: "The payload does not fit", exitCode: 1 },
      });
    });

    test("an old CLI gives the update text", async () => {
      const s = setup({ code: 1, stdout: "", stderr: 'Unknown command "workflow"\n', timedOut: false });
      expect(await s.call("/t3/workflows/start", WF)).toMatchObject({
        status: 502,
        json: { error: "Update T3 Code to use workflows" },
      });
    });

    test("bad bodies give 400 and do not run the CLI", async () => {
      const s = setup();
      expect((await s.call("/t3/workflows/start", "{")).status).toBe(400);
      expect((await s.call("/t3/workflows/start", { ...WF, workflow: " " })).status).toBe(400);
      expect((await s.call("/t3/workflows/start", { ...WF, workflow: "--help" })).status).toBe(400);
      expect((await s.call("/t3/workflows/start", { ...WF, input: "x" })).status).toBe(400);
      expect((await s.call("/t3/workflows/start", { ...WF, input: [] })).status).toBe(400);
      expect((await s.call("/t3/workflows/start", { ...WF, key: "" })).status).toBe(400);
      expect(s.calls).toHaveLength(0);
    });

    test("an unavailable CLI gives 503, and output with no run id gives 502", async () => {
      expect((await setup(undefined, false).call("/t3/workflows/start", WF)).status).toBe(503);
      expect((await setup(ok("{}")).call("/t3/workflows/start", WF)).status).toBe(502);
    });
  });
});

describe("projects", () => {
  test("GET /t3/projects serves projectList", async () => {
    const list = [{ id: "P", label: "app" }];
    const svc = sendService({
      cli: Promise.resolve({ available: true, path: "/bin/t3" }),
      hasThread: () => false,
      hasProject: () => false,
      projectList: () => list,
    });
    expect(await svc.routes["/t3/projects"].GET().json()).toEqual(list);
  });

  test("projectChoices sorts by label and puts the root project first", () => {
    const projects = new Map([
      ["b", { title: "beta" }],
      ["z", { title: "zeta", path: "/repo" }],
      ["a", { title: "alpha" }],
    ]);
    expect(projectChoices(projects, "/repo").map((p) => p.id)).toEqual(["z", "a", "b"]);
  });
});
