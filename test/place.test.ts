import { describe, expect, test } from "bun:test";

import { defaultRules, place, type BuildInput } from "../src/server/build-tree.ts";
import { decodeThread } from "../src/server/t3.ts";
import { RULES, type RuleId } from "../src/shared/rules.ts";
import { NO_KEY, type Group, type LinearIssue, type ThreadNode } from "../src/shared/tree.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
let clock = 0;

/** A raw shell thread, as `orchestration.subscribeShell` sends it. */
function shell(id: string, title: string, over: Record<string, unknown> = {}) {
  clock += 1;
  return {
    id,
    projectId: "p1",
    title,
    providerInstanceId: "claudeAgent",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: id },
    forkedFrom: null,
    activeProviderThreadId: null,
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 1,
    visibleItemCount: 1,
    createdAt: new Date(Date.parse("2026-11-12T08:00:00.000Z") + clock * 1000).toISOString(),
    updatedAt: `2026-11-12T09:${String(clock).padStart(2, "0")}:00.000Z`,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    ...over,
  };
}

const pr = (number: number, source: string, state = "open", stack: object | null = null) => ({
  host: "github.com",
  repository: "org/repo",
  number,
  url: `https://github.com/org/repo/pull/${number}`,
  source,
  linkedAt: "2026-11-12T08:00:00.000Z",
  snapshot: {
    state,
    title: "x",
    headBranch: "h",
    baseBranch: "b",
    isDraft: false,
    updatedAt: null,
    syncedAt: "2026-11-12T08:00:00.000Z",
  },
  stack,
});

const SETTLED = { settledAt: "2026-11-12T09:00:00.000Z", settledOverride: "settled" };

function inputOf(raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}): BuildInput {
  return {
    threads: raws.map((r) => decodeThread(r)!),
    projects: new Map([
      ["p1", { title: "frontend", repo: "acme/frontend" }],
      ["p2", { title: "backend", repo: null }],
    ]),
    spawnerOf: (id) => spawners[id],
    environmentId: "env-1",
    settled: false,
    nest: true,
    now: NOW,
    ...over,
  };
}

const ON = defaultRules(true);
const OFF = defaultRules(false);
const keys = (m: Record<string, string>) => ({ mapKeyOf: (id: string) => m[id] ?? null });
const projectOf = (raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) =>
  place(inputOf(raws, spawners, over), ON, "project");
const answers: Record<string, LinearIssue> = {
  "WEB-1": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
  "WEB-2": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
  "WEB-3": { project: { id: "x", name: "Proj x", url: "u" }, milestone: null },
};
const linearOf = (raws: object[], spawners: Record<string, string> = {}, over: Partial<BuildInput> = {}) =>
  place(inputOf(raws, spawners, { linearOf: (k) => answers[k], ...over }), ON, "linear");

const labels = (b: Group[]) => b.map((x) => x.label);
const titles = (ts: ThreadNode[]) => ts.map((t) => t.title);
const child = (b: Group[], ...path: string[]): Group =>
  path.reduce<Group>((cur, l) => cur.groups.find((x) => x.label === l)!, { groups: b } as Group);
const kinds = (b: Group[]): Record<string, string | undefined> =>
  Object.fromEntries(b.flatMap((g) => [[g.id, g.kind], ...Object.entries(kinds(g.groups))]));

/** One running run `r1`; its step thread needs `workflowRun.runId` "r1". */
const runsOf = (title: string) => ({
  runs: [
    {
      runId: "r1",
      workflow: "ship",
      title,
      status: "running",
      detail: null,
      retired: false,
      resumesAt: null,
      updatedAt: "2026-11-12T11:00:00.000Z",
      parentRunId: null,
      parentStep: null,
      startedAt: "2026-11-12T08:30:00.000Z",
    },
  ],
  questions: [],
});

/** WEB-1 holds #10, WEB-2 #11, WEB-3 #12; each thread lists the stack. */
const stacked = () => [
  shell("s3", "WEB-3 top", { pullRequests: [pr(12, "created"), pr(10, "stack"), pr(11, "stack")] }),
  shell("s1", "WEB-1 base", {
    pullRequests: [pr(10, "created", "open", { base: "main" }), pr(11, "stack"), pr(12, "stack")],
  }),
  shell("s2", "WEB-2 middle", { pullRequests: [pr(11, "created"), pr(10, "stack"), pr(12, "stack")] }),
];

describe("defaultRules", () => {
  test("follows the RULES order; nest only when asked", () => {
    expect(OFF).toEqual(RULES.filter((r) => r.on).map((r) => r.id));
    expect(OFF).toEqual(["map", "review", "stack", "key"]);
    expect(ON).toEqual(["map", "review", "stack", "key", "nest"]);
  });
});

describe("Map group rule", () => {
  test("a member goes under its head, not in a key group; a map thread is not a spawner", () => {
    const raws = [shell("chart", "Wayfinder"), shell("t1", "WEB-1 a"), shell("other", "other")];
    const tree = projectOf(raws, { t1: "chart", other: "chart" }, keys({ t1: "/m/x" }));
    expect(labels(tree[0].groups)).toEqual([NO_KEY]);
    const [head, other] = tree[0].groups[0].threads;
    expect(titles(head.children)).toEqual(["WEB-1 a"]);
    expect(other.title).toBe("other");
  });

  test("Linear layout: a member stays under its head and gets its T3 project", () => {
    const raws = [shell("chart", "Wayfinder"), shell("t1", "WEB-1 a", { projectId: "p2" })];
    const tree = linearOf(raws, { t1: "chart" }, keys({ t1: "/m/x" }));
    expect(tree.map((g) => g.id)).toEqual(["lf:loose"]);
    const [head] = tree[0].threads;
    expect(head.children.map((c) => [c.title, c.t3Project])).toEqual([["WEB-1 a", { id: "p2", label: "backend" }]]);
  });

  test("a sub-map header gets no launchedBy", () => {
    const raws = [
      shell("chart", "Wayfinder"),
      shell("t", "ticket", SETTLED),
      shell("u", "other ticket"),
      shell("s", "sub ticket"),
    ];
    const tree = projectOf(
      raws,
      { t: "chart", u: "chart", s: "t" },
      { ...keys({ t: "/m/p", u: "/m/p", s: "/m/s" }), settled: false },
    );
    const [head] = tree[0].groups[0].threads;
    const sub = head.children.find((c) => c.map?.header)!;
    expect(sub.detail.launchedBy).toBeNull();
    expect(sub.children[0].detail.launchedBy).toMatchObject({ title: "ticket" });
  });
});

describe("Reviews rule", () => {
  test("a review goes into Reviews, in a subgroup by key; a review run too", () => {
    const raws = [
      shell("r", "Review #1 WEB-1"),
      shell("st", "step", { workflowRun: { runId: "r1", workflow: "ship", step: "go" } }),
    ];
    const over = { runs: runsOf("Review #9 WEB-4"), origin: "http://t3" };
    const p = projectOf(raws, {}, over);
    expect(labels(p[0].groups)).toEqual(["Reviews"]);
    expect(child(p, "frontend", "Reviews").groups.map((g) => [g.label, g.threads.length])).toEqual([
      ["WEB-1", 1],
      ["WEB-4", 1],
    ]);
    const l = linearOf(raws, {}, over);
    expect(l.map((g) => g.id)).toEqual(["lf:reviews"]);
    expect(l[0].groups.map((g) => g.label)).toEqual(["WEB-1", "WEB-4"]);
  });
});

describe("PR stack rule", () => {
  const withMates = () => [
    ...stacked(),
    shell("loose", "loose thread", { pullRequests: [pr(12, "stack"), pr(10, "stack")] }),
  ];

  test("project: keyless mates share the stack group with a rail; a keyed mate keeps its key group", () => {
    const tree = projectOf(withMates());
    const g = child(tree, "frontend", "PR stack #10");
    expect(g.kind).toBe("stack");
    expect(g.stack).toEqual({ id: "s10", total: 3, base: "main" });
    expect(titles(g.threads)).toEqual(["loose thread"]);
    expect(titles(child(tree, "frontend", "WEB-1").threads)).toEqual(["WEB-1 base"]);
  });

  test("Linear: the lowest keyed thread places the whole stack", () => {
    const tree = linearOf(withMates());
    expect(tree.map((g) => g.id)).toEqual(["lp:x"]);
    const groups = tree[0].groups[0].groups;
    expect(groups.map((g) => g.label)).toEqual(["WEB-1", "WEB-2", "WEB-3", "PR stack #10"]);
  });

  test("Linear: a stack with no key is loose and does not nest under its spawner", () => {
    const raws = [
      shell("lead", "lead"),
      shell("a", "a", { pullRequests: [pr(20, "created"), pr(21, "stack")] }),
      shell("b", "b", { pullRequests: [pr(21, "created"), pr(20, "stack")] }),
    ];
    const tree = linearOf(raws, { a: "lead", b: "lead" });
    expect(tree.map((g) => g.id)).toEqual(["lf:loose"]);
    expect(titles(tree[0].groups[0].threads)).toEqual(["a", "b"]);
    expect(titles(tree[0].threads)).toEqual(["lead"]);
    expect(tree[0].threads[0].children).toEqual([]);
  });
});

describe("Issue key rule", () => {
  test("project: a key group; Linear: a milestone, or No project without Linear data", () => {
    const raws = [shell("a", "WEB-1 a"), shell("b", "WEB-9 b")];
    expect(labels(projectOf(raws)[0].groups)).toEqual(["WEB-1", "WEB-9"]);
    const tree = linearOf(raws);
    expect(tree.map((g) => g.id)).toEqual(["lp:x", "lf:none"]);
    expect(tree[0].groups[0].threads.map((t) => t.title)).toEqual(["WEB-1 a"]);
  });
});

describe("Launch nesting rule", () => {
  const raws = [shell("lead", "lead"), shell("kid", "kid")];

  test("off by default: a launched thread is loose and names its spawner", () => {
    const tree = place(inputOf(raws, { kid: "lead" }), OFF, "project");
    expect(titles(tree[0].groups[0].threads)).toEqual(["lead", "kid"]);
    expect(tree[0].groups[0].threads[1].detail.launchedBy).toMatchObject({ title: "lead" });
  });

  test("on: the child nests, with no launchedBy", () => {
    const tree = place(inputOf(raws, { kid: "lead" }), ON, "project");
    const [lead] = tree[0].groups[0].threads;
    expect(titles(lead.children)).toEqual(["kid"]);
    expect(lead.children[0].detail.launchedBy).toBeNull();
  });

  test("a run is never nested", () => {
    const all = [
      shell("lead", "lead"),
      shell("st", "step", { workflowRun: { runId: "r1", workflow: "ship", step: "go" } }),
    ];
    const tree = projectOf(all, { st: "lead" }, { runs: runsOf("Nightly") });
    const threads = tree[0].groups[0].threads;
    expect(threads.map((t) => t.id).toSorted()).toEqual(["lead", "run:r1"]);
    expect(threads.find((t) => t.id === "lead")!.children).toEqual([]);
  });
});

describe("chain order", () => {
  test("the first claim wins, and the loop follows the rules list", () => {
    const raws = [shell("r", "Review #1 WEB-1")];
    expect(labels(place(inputOf(raws), ["review", "key"], "project")[0].groups)).toEqual(["Reviews"]);
    expect(labels(place(inputOf(raws), ["key", "review"], "project")[0].groups)).toEqual(["WEB-1"]);
  });

  test("a rule that is not in the list claims nothing", () => {
    const tree = place(inputOf([shell("a", "WEB-1 a")]), [] as RuleId[], "project");
    expect(labels(tree[0].groups)).toEqual([NO_KEY]);
  });
});

describe("Home", () => {
  test("project: a keyless child nests under a keyed or review spawner of its project, not another", () => {
    const raws = [
      shell("lead", "WEB-1 lead"),
      shell("rev", "Review #1 WEB-2"),
      shell("far", "far", { projectId: "p2" }),
      shell("k1", "k1"),
      shell("k2", "k2"),
      shell("k3", "k3"),
    ];
    const tree = projectOf(raws, { k1: "lead", k2: "rev", k3: "far" });
    const front = tree.find((b) => b.label === "frontend")!;
    expect(titles(child([front], "frontend", "WEB-1").threads[0].children)).toEqual(["k1"]);
    expect(titles(child([front], "frontend", "Reviews", "WEB-2").threads[0].children)).toEqual(["k2"]);
    expect(titles(child([front], "frontend", NO_KEY).threads)).toEqual(["k3"]);
  });

  test("Linear: a keyless child nests under a keyless spawner that a stack mate placed", () => {
    const raws = [
      ...stacked(),
      shell("mate", "mate", { pullRequests: [pr(10, "stack"), pr(11, "stack")] }),
      shell("kid", "kid"),
    ];
    const tree = linearOf(raws, { kid: "mate" });
    const holder = tree[0].groups[0].groups.find((g) => g.threads.some((t) => t.title === "mate"))!;
    expect(titles(holder.threads.find((t) => t.title === "mate")!.children)).toEqual(["kid"]);
  });

  test("Linear: a keyless child does not nest under a keyed or review spawner", () => {
    const raws = [shell("lead", "WEB-1 lead"), shell("rev", "Review #1 WEB-2"), shell("k1", "k1"), shell("k2", "k2")];
    const tree = linearOf(raws, { k1: "lead", k2: "rev" });
    const loose = tree.find((g) => g.id === "lf:loose")!;
    expect(titles(loose.threads)).toEqual(["k1", "k2"]);
  });

  test("Linear: a keyless child nests under a loose keyless spawner", () => {
    const tree = linearOf([shell("lead", "lead"), shell("kid", "kid")], { kid: "lead" });
    expect(titles(tree[0].threads[0].children)).toEqual(["kid"]);
  });
});

describe("kind", () => {
  test("project layout sets it on every group", () => {
    const raws = [
      shell("rev", "Review #1 WEB-5"),
      ...stacked(),
      shell("loose", "loose thread", { pullRequests: [pr(12, "stack"), pr(10, "stack")] }),
      shell("plain", "plain thread"),
    ];
    expect(kinds(projectOf(raws))).toEqual({
      "p:p1": "project",
      "g:p1:Reviews": "review",
      "g:p1:Reviews:WEB-5": "key",
      "g:p1:WEB-1": "key",
      "g:p1:WEB-2": "key",
      "g:p1:WEB-3": "key",
      "g:p1:PR stack #10": "stack",
      "g:p1:No issue key": "loose",
    });
  });

  test("Linear layout sets it on every group; a stack branch is a stack, whatever its label", () => {
    const raws = [
      shell("rev", "Review #1 WEB-5"),
      ...stacked(),
      shell("none", "WEB-9 none"),
      shell("plain", "plain thread"),
    ];
    const k = kinds(linearOf(raws));
    expect(k["lp:x"]).toBe("linear-project");
    expect(k["lm:x:none"]).toBe("milestone");
    expect(k["lm:x:none:s10:WEB-1"]).toBe("stack");
    expect(k["lf:none"]).toBe("no-project");
    expect(k["lf:reviews"]).toBe("review");
    expect(k["lf:reviews:WEB-5"]).toBe("key");
    expect(Object.values(k).every((v) => v !== undefined)).toBe(true);
  });
});
