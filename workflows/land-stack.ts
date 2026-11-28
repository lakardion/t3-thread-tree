import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { gateOf, layersOf, nextLayer, titleOf } from "./lib/land-stack.ts";

const { workflow, step, agent, ask, title, stop, sleep, store, pullRequests } = T3;

const run = promisify(execFile);

type GhError = { stderr?: string; message?: string };

/** The last non-empty line of stderr, else of the error message. */
const reasonOf = (e: unknown) => {
  const err = e as GhError;
  for (const t of [err.stderr, err.message]) {
    const line = (t ?? "").trim().split("\n").pop();
    if (line) return line;
  }
  return "gh failed";
};

/** Runs `gh`. A failure carries the reason from `reasonOf`. */
const gh = (args: string[], cwd?: string) =>
  Effect.tryPromise({
    try: async () => (await run("gh", args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout,
    catch: (e) => new Error(reasonOf(e)),
  });

/** True when the answer is the choice that a person gave. A timeout is no choice. */
const picked = (a: Option.Option<{ choice: string }>, c: string) => Option.isSome(a) && a.value.choice === c;

/** True when the stack exists, false on a 404, and a failure for any other error. */
const stackExists = (repo: string, n: number) =>
  Effect.gen(function* () {
    const result = yield* Effect.promise(() =>
      run("gh", ["api", `repos/${repo}/stacks/${n}`]).then(
        () => null,
        (e: unknown) => e,
      ),
    );
    if (result === null) return true;
    if (/HTTP 404/.test(String((result as GhError).stderr))) return false;
    return yield* Effect.fail(new Error(reasonOf(result)));
  });

const View = Schema.Struct({
  state: Schema.String,
  isDraft: Schema.Boolean,
  reviewDecision: Schema.NullOr(Schema.String),
  mergeStateStatus: Schema.String,
  mergeable: Schema.String,
  headRefOid: Schema.String,
  headRefName: Schema.String,
  baseRefName: Schema.String,
});

const Read = Schema.Struct({
  stack: Schema.Number,
  next: Schema.Union([
    Schema.Struct({ kind: Schema.Literals(["done"]) }),
    Schema.Struct({ kind: Schema.Literals(["land", "closed"]), n: Schema.Number }),
  ]),
});

const Fixed = Schema.Struct({ pushed: Schema.Boolean, summary: Schema.String });

export default workflow(
  "land-stack",
  {
    version: 1,
    payload: Schema.Struct({
      stack: Schema.Struct({ repo: Schema.String, prs: Schema.Array(Schema.Number) }),
      project: Schema.String,
    }),
    asks: {
      review: "Changes requested or draft",
      conflict: "Conflict not fixed",
      checks: "Checks failed",
      merge: "Merge refused",
    },
  },
  Effect.fn(function* (payload) {
    const { repo, prs } = payload.stack;
    const project = payload.project;
    if (prs.length === 0) return yield* stop("The stack has no PRs");
    const top = prs[prs.length - 1];
    const ref = (n: number) => ({ project, url: `https://github.com/${repo}/pull/${n}` });
    const allowed = new Set<number>();
    let conflictThread: string | undefined;

    const resolveConflict = (n: number, round: number, v: typeof View.Type) =>
      Effect.gen(function* () {
        const fix = yield* agent.try(`conflict-${n}-${round}`, {
          project,
          timeout: "1 hour",
          returns: Fixed,
          brief: [
            `Pull request #${n} of ${repo} has a merge conflict with its base branch.`,
            `Run git fetch. Then add a new detached worktree of this project at origin/${v.headRefName}.`,
            `In it, run git merge origin/${v.baseRefName}, resolve the conflicts, and commit.`,
            `Push with: git push origin HEAD:${v.headRefName}. This must be a fast-forward push.`,
            "Never force-push. Never rebase. Remove the worktree when you finish.",
            "Return pushed true when the push worked, and a short summary.",
          ].join("\n"),
        });
        if (fix.thread) conflictThread = fix.thread;
        if (fix.outcome === "done" && fix.value.pushed) return;
        const again = yield* ask(`conflict-ask-${n}-${round}`, {
          kind: "conflict",
          title: `Conflict on #${n}`,
          choices: ["retry", "stop"],
        });
        if (!picked(again, "retry")) return yield* stop(`Stopped by you at #${n}`);
      });

    for (let round = 1; ; round++) {
      const read = yield* step(
        `stack-${round}`,
        { returns: Read },
        Effect.gen(function* () {
          const out = yield* gh(["api", `repos/${repo}/stacks?pull_request=${top}`]);
          const found = layersOf(JSON.parse(out), top);
          if (!found) return yield* Effect.fail(new Error(`No stack holds #${top}`));
          return { stack: found.stack, next: nextLayer(found.layers, [...prs]) };
        }),
      );
      if (read.next.kind === "done") break;
      const n = read.next.n;
      if (read.next.kind === "closed") return yield* stop(`#${n} is closed`);

      yield* title(titleOf(repo, [...prs], n));

      const view = yield* step(
        `view-${n}-${round}`,
        { returns: View },
        gh([
          "pr",
          "view",
          String(n),
          "-R",
          repo,
          "--json",
          "state,isDraft,reviewDecision,mergeStateStatus,mergeable,headRefOid,headRefName,baseRefName",
        ]).pipe(Effect.map((out) => JSON.parse(out))),
      );
      const gate = gateOf(view, allowed.has(n));

      if (gate === "merged") continue;
      if (gate === "closed") return yield* stop(`#${n} is closed`);
      if (gate === "draft" || gate === "changes") {
        const answer = yield* ask(`review-${n}-${round}`, {
          kind: "review",
          title: gate === "draft" ? `#${n} is a draft` : `#${n} has changes requested`,
          choices: ["merge anyway", "stop"],
        });
        if (!picked(answer, "merge anyway")) return yield* stop(`Stopped by you at #${n}`);
        allowed.add(n);
        continue;
      }
      if (view.isDraft) {
        yield* step(`ready-${n}-${round}`, { returns: Schema.Void }, pullRequests.act(ref(n), "ready"));
        continue;
      }
      if (gate === "conflict") {
        yield* resolveConflict(n, round, view);
        continue;
      }
      if (gate === "behind") {
        const update = yield* step.try(
          `update-${n}-${round}`,
          { returns: Schema.Void },
          pullRequests.act(ref(n), "update-branch"),
        );
        if (update.outcome === "failed") {
          yield* resolveConflict(n, round, view);
          continue;
        }
        yield* step(
          `head-${n}-${round}`,
          { returns: Schema.String, retry: { times: 20, schedule: Schedule.spaced("15 seconds") } },
          Effect.gen(function* () {
            const oid = (yield* gh([
              "pr",
              "view",
              String(n),
              "-R",
              repo,
              "--json",
              "headRefOid",
              "-q",
              ".headRefOid",
            ])).trim();
            if (oid === view.headRefOid) return yield* Effect.fail(new Error(`#${n} has no new head yet`));
            return oid;
          }),
        );
        continue;
      }

      const at = yield* pullRequests.wait(`checks-${n}-${round}`, ref(n), { until: "checks", timeout: "60 minutes" });
      if (Option.isSome(at) && at.value.state !== "open") continue;
      if (Option.isNone(at) || (at.value.checks !== "passing" && at.value.checks !== "none")) {
        const answer = yield* ask(`checks-ask-${n}-${round}`, {
          kind: "checks",
          title: `Checks failed on #${n}`,
          choices: ["retry", "stop"],
        });
        if (!picked(answer, "retry")) return yield* stop(`Stopped by you at #${n}`);
        yield* step(
          `rerun-${n}-${round}`,
          { returns: Schema.Void },
          Effect.gen(function* () {
            const out = yield* gh([
              "run",
              "list",
              "-R",
              repo,
              "--commit",
              view.headRefOid,
              "--status",
              "failure",
              "--json",
              "databaseId",
            ]);
            for (const r of JSON.parse(out)) yield* gh(["run", "rerun", String(r.databaseId), "--failed", "-R", repo]);
          }),
        );
        continue;
      }

      const merge = yield* step.try(
        `merge-${n}-${round}`,
        { returns: Schema.Void },
        Effect.gen(function* () {
          const state = JSON.parse(yield* gh(["pr", "view", String(n), "-R", repo, "--json", "state"], project)).state;
          if (state === "MERGED") return;
          if (read.stack === n || (yield* stackExists(repo, n))) {
            return yield* Effect.fail(
              new Error(`#${n} is also stack number ${n}. Merge #${n} on GitHub, then pick retry`),
            );
          }
          yield* gh(["stack", "merge", String(n), "--yes", "--squash"], project);
        }),
      );
      if (merge.outcome === "failed") {
        const answer = yield* ask(`merge-ask-${n}-${round}`, {
          kind: "merge",
          title: `Merge refused on #${n}: ${merge.reason}`,
          choices: ["retry", "stop"],
        });
        if (!picked(answer, "retry")) return yield* stop(`Stopped by you at #${n}`);
        continue;
      }

      const merged = yield* pullRequests.wait(`merged-${n}-${round}`, ref(n), { until: "merged" });
      if (n === top && Option.isSome(merged) && merged.value.state === "merged") break;
      yield* sleep(`settle-${n}-${round}`, "20 seconds");
    }

    const extra = yield* step(
      "extra-prompt",
      { returns: Schema.NullOr(Schema.String) },
      Effect.gen(function* () {
        return Option.getOrNull(yield* store.entry("settings/land-stack/extra-prompt", Schema.String).get);
      }),
    );
    if (extra) {
      yield* agent("extra", conflictThread ? { thread: conflictThread, brief: extra } : { project, brief: extra });
    }
  }),
);
