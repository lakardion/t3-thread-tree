import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { choicesOf, decisionsOf, itemsMarkdown, labelOf, openItems } from "./lib/pr-comments.ts";

const { workflow, step, agent, ask, title, subject, stop, store } = T3;

const run = promisify(execFile);

const T3_CLI = join(homedir(), ".t3", "bin", "t3");

type CmdError = { stderr?: string; message?: string };

/** The last non-empty line of stderr, else of the error message. */
const reasonOf = (e: unknown) => {
  const err = e as CmdError;
  for (const t of [err.stderr, err.message]) {
    const last = (t ?? "").trim().split("\n").pop();
    if (last) return last;
  }
  return "command failed";
};

/** Runs a command. A failure carries the reason from `reasonOf`. */
const sh = (cmd: string, args: string[], cwd?: string) =>
  Effect.tryPromise({
    try: async () => (await run(cmd, args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout,
    catch: (e) => new Error(reasonOf(e)),
  });

/**
 * One page of each list. ponytail: more than 100 threads, comments or reviews on one PR are not read. Page with
 * `pageInfo` if a PR needs it.
 */
const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequest(number: $number) {
      state
      headRefName
      baseRefName
      isCrossRepository
      author { login }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          originalLine
          startLine
          originalStartLine
          comments(first: 100) { nodes { body author { login } } }
        }
      }
      comments(first: 100) { nodes { body isMinimized author { login } } }
      reviews(first: 100) { nodes { body author { login } } }
    }
  }
}`;

const Item = Schema.Struct({
  n: Schema.Number,
  kind: Schema.Literals(["inline", "comment", "review"]),
  ref: Schema.String,
  outdated: Schema.Boolean,
  body: Schema.String,
});

const Fetched = Schema.Struct({
  head: Schema.String,
  base: Schema.String,
  defaultBranch: Schema.String,
  state: Schema.String,
  fork: Schema.Boolean,
  items: Schema.Array(Item),
});

const Verdicts = Schema.Struct({
  verdicts: Schema.Array(
    Schema.Struct({
      n: Schema.Number,
      verdict: Schema.Literals(["VALID", "INVALID", "ALREADY_ADDRESSED", "NEEDS_DECISION"]),
      evidence: Schema.String,
      fix: Schema.optional(Schema.String),
      options: Schema.optional(Schema.Array(Schema.Struct({ label: Schema.String, tradeoffs: Schema.String }))),
    }),
  ),
});

const Fixed = Schema.Struct({
  rundown: Schema.String,
  files: Schema.Array(Schema.String),
  replies: Schema.String,
});

const Diff = Schema.Struct({ path: Schema.String, stat: Schema.String });

export default workflow(
  "pr-comments",
  {
    version: 1,
    payload: Schema.Struct({
      pr: Schema.Struct({ repo: Schema.String, number: Schema.Number }),
      project: Schema.String,
    }),
  },
  Effect.fn(function* (payload) {
    const { repo, number } = payload.pr;
    const url = `https://github.com/${repo}/pull/${number}`;
    const name = `PR comments ${repo}#${number}`;
    yield* title(name);
    yield* subject(url);

    const fetched = yield* step(
      "fetch",
      { returns: Fetched },
      Effect.gen(function* () {
        const [owner, repoName] = repo.split("/");
        const out = yield* sh("gh", [
          "api",
          "graphql",
          "-f",
          `query=${QUERY}`,
          "-f",
          `owner=${owner}`,
          "-f",
          `name=${repoName}`,
          "-F",
          `number=${number}`,
        ]);
        const found = JSON.parse(out).data?.repository;
        const pr = found?.pullRequest;
        if (!pr) return yield* Effect.fail(new Error(`${url} was not found`));
        return {
          head: pr.headRefName,
          base: pr.baseRefName,
          defaultBranch: found.defaultBranchRef?.name ?? "",
          state: pr.state,
          fork: pr.isCrossRepository,
          items: openItems(pr),
        };
      }),
    );
    const { head, items } = fetched;
    if (fetched.state !== "OPEN") return yield* stop("The PR is not open");
    if (fetched.fork) return yield* stop("The PR branch is in a fork: the run cannot push to it");
    if (head === fetched.defaultBranch) return yield* stop("The PR branch is the default branch");
    if (items.length === 0) return yield* stop("No open comments");
    const list = itemsMarkdown(items);

    const critic = yield* agent("critic", {
      project: payload.project,
      workspace: { type: "worktree", baseRef: `origin/${head}`, startFromOrigin: true },
      title: name,
      returns: Verdicts,
      brief: [
        `You are a critic for the pull request ${url}. Its base branch is ${fetched.base}.`,
        "You are read-only: change no file and make no commit.",
        "The open items of the PR follow. Each has a number, and the text is verbatim.",
        "",
        list,
        "",
        'Each review comment is presumed invalid: the burden of proof is on the comment. For each one, read the current code at its path and line (the diff may be stale; "outdated" means the code moved), its callers, its types and its tests, and try to refute it: the claimed bug cannot occur, the code already handles it, a later commit fixed it, it is out of the PR\'s scope, or it is a preference with no defect. A comment is VALID only when no refutation stands. Judge each comment on its own evidence, with the same bar for bots and humans.',
        "",
        "Return one entry per item, by its number:",
        "- Verdict: VALID, INVALID, ALREADY_ADDRESSED, or NEEDS_DECISION (a real design fork the user must choose).",
        "- Evidence: the file:line references and the facts that settle the verdict.",
        "- Fix (VALID only): each file and line to change, and the exact change, precise enough to apply with no more research.",
        "- Options (NEEDS_DECISION only): the choices and their trade-offs.",
      ].join("\n"),
    });

    const decisions: string[] = [];
    for (const { item, verdict: d } of decisionsOf(items, critic.value.verdicts)) {
      const options = d.options ?? [];
      const body = [
        itemsMarkdown([item]),
        `Evidence: ${d.evidence}`,
        ...options.map((o) => `Option "${labelOf(o.label)}": ${o.tradeoffs}`),
      ].join("\n\n");
      const answer = yield* ask(`decide-${d.n}`, {
        title: `#${d.n}${item.ref ? ` ${item.ref}` : ""}: which way?`,
        choices: choicesOf(options),
        data: { body },
      });
      const label = Option.isSome(answer) ? answer.value.choice : "skip";
      const reason = Option.isSome(answer) && answer.value.reason ? ` (${answer.value.reason})` : "";
      decisions.push(`[${d.n}] chosen: ${label}${reason}`);
    }

    const fix = yield* agent("fix", {
      thread: critic.thread,
      returns: Fixed,
      brief: [
        "Now edit files. Apply the fix of each VALID item, and the chosen option of each decided item. Make the smallest change for each. Do not commit. Do not push. Do not post anything to GitHub.",
        "",
        decisions.length > 0
          ? `The user's decisions (skip means change nothing):\n${decisions.join("\n")}`
          : "No item needs a decision.",
        "",
        "Return:",
        "- rundown: one line per item, in the format `[n] path:line — asked — Fixed / Invalid (reason) / Already addressed / Skipped`.",
        "- files: the path of each file you changed or added, relative to the worktree root.",
        "- replies: a draft reply for each item, one after the other. These are drafts: post none.",
      ].join("\n"),
    });
    const { rundown, files, replies } = fix.value;
    if (files.length === 0) return { rundown, replies, pushed: false };

    const diff = yield* step(
      "diff",
      { returns: Diff },
      Effect.gen(function* () {
        const shown = JSON.parse(yield* sh(T3_CLI, ["thread", "show", fix.thread, "--json"]));
        const path = shown.thread?.worktreePath;
        if (!path) return yield* Effect.fail(new Error("The fix thread has no worktree"));
        const stat = yield* sh("git", ["diff", "--stat", "--", ...files], path);
        const status = yield* sh("git", ["status", "--short", "--", ...files], path);
        return { path, stat: `${stat}${status}` };
      }),
    );

    const go = yield* ask("push-ask", {
      title: `Push the fixes to ${repo}#${number}?`,
      choices: ["push", "don't push"],
      data: { body: `${rundown}\n\n\`\`\`\n${diff.stat}\n\`\`\`` },
    });
    if (!Option.isSome(go) || go.value.choice !== "push") return { rundown, replies, pushed: false };

    yield* step(
      "push",
      { returns: Schema.Void },
      Effect.gen(function* () {
        yield* sh("git", ["add", "--", ...files], diff.path);
        const staged = yield* Effect.promise(() =>
          run("git", ["diff", "--cached", "--quiet"], { cwd: diff.path }).then(
            () => false,
            () => true,
          ),
        );
        if (staged) yield* sh("git", ["commit", "-m", "Address PR review comments"], diff.path);
        yield* sh("git", ["push", "origin", `HEAD:${head}`], diff.path);
      }),
    );

    const extra = yield* step(
      "extra-prompt",
      { returns: Schema.NullOr(Schema.String) },
      Effect.gen(function* () {
        return Option.getOrNull(yield* store.entry("settings/pr-comments/extra-prompt", Schema.String).get);
      }),
    );
    if (extra) yield* agent("extra", { thread: fix.thread, brief: extra });

    yield* agent("settle", {
      thread: fix.thread,
      brief: "Call `t3_thread_organize` with the action `settle` and no thread id. Change nothing else.",
    });

    return { rundown, replies, pushed: true };
  }),
);
