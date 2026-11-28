import { execFile } from "node:child_process";

import { brief, decide, diffLines, marker, reviewRequest } from "./lib/review-pr.ts";

const { workflow, step, agent, ask, title, subject, store } = T3;

/** Runs a command and gives its stdout. A failed command fails the step, which pauses the run. */
const sh = (cmd, args, input) =>
  Effect.tryPromise(
    () =>
      new Promise((resolve, reject) => {
        const child = execFile(cmd, args, { maxBuffer: 1 << 26, timeout: 120_000 }, (error, stdout, stderr) =>
          error ? reject(new Error(String(stderr || error.message))) : resolve(String(stdout)),
        );
        child.stdin.on("error", () => {});
        child.stdin.end(input ?? "");
      }),
  );

export const Pr = Schema.Struct({ repo: Schema.String, number: Schema.Number });

export const Payload = Schema.Struct({
  pr: Pr,
  project: Schema.String,
  text: Schema.optional(Schema.String),
});

export const Finding = Schema.Struct({
  axis: Schema.Literals(["standards", "spec"]),
  severity: Schema.Literals(["blocker", "major", "minor", "nit"]),
  file: Schema.optional(Schema.NullOr(Schema.String)),
  line: Schema.optional(Schema.NullOr(Schema.Number)),
  body: Schema.String,
});

export const Verdict = Schema.Struct({
  decision: Schema.Literals(["approve", "changes"]),
  summary: Schema.String,
  findings: Schema.Array(Finding),
});

const PrInfo = Schema.Struct({
  title: Schema.String,
  base: Schema.String,
  head: Schema.String,
  url: Schema.String,
});

const Settings = Schema.Struct({ checks: Schema.String, extraPrompt: Schema.String });

export default workflow(
  "review-pr",
  { version: 1, payload: Payload, returns: Verdict, asks: { "post-review": "Post review?" } },
  Effect.fn(function* (payload, run) {
    const { repo, number } = payload.pr;
    const n = String(number);

    const pr = yield* step(
      "pr",
      { returns: PrInfo },
      Effect.gen(function* () {
        const out = yield* sh("gh", ["pr", "view", n, "-R", repo, "--json", "title,baseRefName,headRefOid,url"]);
        const j = JSON.parse(out);
        return { title: j.title, base: j.baseRefName, head: j.headRefOid, url: j.url };
      }),
    );
    const heading = `Review #${number} ${pr.title}`;
    yield* title(heading);
    yield* subject(pr.url);

    const settings = yield* step(
      "settings",
      { returns: Settings },
      Effect.gen(function* () {
        const checks = yield* store.entry("settings/review-pr/checks", Schema.String).get;
        const extra = yield* store.entry("settings/review-pr/extra-prompt", Schema.String).get;
        return { checks: Option.getOrElse(checks, () => ""), extraPrompt: Option.getOrElse(extra, () => "") };
      }),
    );

    const review = yield* agent("review", {
      project: payload.project,
      workspace: { type: "worktree", baseRef: `origin/${pr.base}`, startFromOrigin: true },
      title: heading,
      brief: brief({
        repo,
        number,
        title: pr.title,
        base: pr.base,
        head: pr.head,
        text: payload.text?.trim() || undefined,
        checks: settings.checks.trim() || undefined,
      }),
      returns: Schema.Struct({ summary: Schema.String, findings: Schema.Array(Finding) }),
    });
    const verdict = {
      decision: decide(review.value.findings),
      summary: review.value.summary,
      findings: review.value.findings,
    };

    const answer = yield* ask("post-review", {
      kind: "post-review",
      title: `Post this review to #${number}?`,
      choices: ["Post", "Don't post"],
      data: verdict,
    });
    if (Option.isSome(answer) && answer.value.choice === "Post") {
      yield* step(
        "post",
        { returns: Schema.String },
        Effect.gen(function* () {
          const posted = yield* sh("gh", ["api", `repos/${repo}/pulls/${n}/reviews`, "--paginate", "--jq", ".[].body"]);
          if (posted.includes(marker(run.id))) return "already posted";
          const now = JSON.parse(yield* sh("gh", ["pr", "view", n, "-R", repo, "--json", "headRefOid"])).headRefOid;
          const moved = now !== pr.head;
          const anchors = moved ? new Map() : diffLines(yield* sh("gh", ["pr", "diff", n, "-R", repo]));
          const request = reviewRequest(verdict, {
            runId: run.id,
            reviewed: pr.head,
            commitId: moved ? undefined : pr.head,
            diffLines: anchors,
          });
          const url = yield* sh(
            "gh",
            ["api", "-X", "POST", `repos/${repo}/pulls/${n}/reviews`, "--input", "-", "--jq", ".html_url"],
            JSON.stringify(request),
          );
          return url.trim();
        }),
      );
    }

    if (settings.extraPrompt.trim()) {
      yield* agent("extra", { thread: review.thread, brief: settings.extraPrompt });
    }

    return verdict;
  }),
);
