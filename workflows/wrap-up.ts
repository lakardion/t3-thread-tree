import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { keepReason, otherThreadIds, planWrapUp, question, recheck, summary } from "./lib/wrap-up.ts";

const { workflow, step, agent, ask, stop, title, store } = T3;

const execFileP = promisify(execFile);
const T3_CLI = process.env.T3_BIN?.trim() || join(homedir(), ".t3", "bin", "t3");
const BUSY_FILES = ["rebase-merge", "rebase-apply", "MERGE_HEAD", "BISECT_LOG"];

const failed = (e) => ({ ok: false, stdout: String(e?.stdout ?? ""), stderr: String(e?.stderr || e?.message) });

/** Runs a command. It never fails: a failed command gives `ok: false`, so each step decides what to do. */
const run = (cmd, args, cwd) =>
  Effect.promise(() => {
    try {
      return execFileP(cmd, args, { cwd, maxBuffer: 1 << 24, timeout: 120_000 }).then(
        (r) => ({ ok: true, stdout: String(r.stdout), stderr: String(r.stderr) }),
        failed,
      );
    } catch (e) {
      return Promise.resolve(failed(e));
    }
  });

const firstLine = (text) => text.trim().split("\n")[0];

/** `t3 thread show` for one thread: `{ thread }`, or `{ error }`. */
const showThread = (id) =>
  Effect.gen(function* () {
    const r = yield* run(T3_CLI, ["thread", "show", id, "--json", "--messages", "0"]);
    if (!r.ok) return { error: `cannot read thread: ${firstLine(r.stderr)}` };
    try {
      const out = JSON.parse(r.stdout);
      return out.thread ? { thread: out.thread } : { error: `cannot read thread: ${out.error ?? "no thread"}` };
    } catch {
      return { error: "cannot read thread: bad JSON from t3" };
    }
  });

const isIdle = (t) =>
  !t.activeRunId &&
  !(t.pendingRequestCount > 0) &&
  !(Array.isArray(t.pendingBackgroundTasks) ? t.pendingBackgroundTasks.length > 0 : t.pendingBackgroundTasks);

/** HEAD, the dirty flag and the branch tip, read from inside a worktree. */
const readTree = (worktreePath, branch) =>
  Effect.gen(function* () {
    const head = yield* run("git", ["symbolic-ref", "--quiet", "HEAD"], worktreePath);
    const status = yield* run("git", ["status", "--porcelain", "--untracked-files=all"], worktreePath);
    const tip = yield* run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], worktreePath);
    return {
      head: head.ok ? head.stdout.trim() : null,
      dirty: !status.ok || status.stdout.trim() !== "",
      tip: tip.ok ? tip.stdout.trim() : null,
      failed: status.ok ? null : `git status failed: ${firstLine(status.stderr)}`,
    };
  });

const readFacts = (id) =>
  Effect.gen(function* () {
    const facts = {
      id,
      title: "",
      projectId: "",
      worktreePath: null,
      branch: null,
      idle: false,
      gitDir: null,
      head: null,
      dirty: false,
      busy: null,
      tip: null,
      merge: null,
      ignored: [],
      error: null,
    };
    const shown = yield* showThread(id);
    if (shown.error) return { ...facts, error: shown.error };
    const t = shown.thread;
    const base = {
      ...facts,
      title: t.title ?? id,
      projectId: t.projectId ?? "",
      worktreePath: t.worktreePath ?? null,
      branch: t.branch ?? null,
      idle: isIdle(t),
    };
    if (!base.worktreePath || !base.branch) return base;
    const cwd = base.worktreePath;

    const gitDir = yield* run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
    if (!gitDir.ok) return { ...base, error: `git failed: ${firstLine(gitDir.stderr)}` };
    const tree = yield* readTree(cwd, base.branch);
    if (tree.failed) return { ...base, error: tree.failed };

    let busy = null;
    for (const name of BUSY_FILES) {
      const path = yield* run("git", ["rev-parse", "--path-format=absolute", "--git-path", name], cwd);
      if (path.ok && existsSync(path.stdout.trim())) {
        busy = name;
        break;
      }
    }

    const pull = yield* run("gh", ["pr", "view", base.branch, "--json", "state,headRefOid"], cwd);
    let merge = null;
    if (pull.ok) {
      try {
        const out = JSON.parse(pull.stdout);
        merge = { state: String(out.state), headRefOid: String(out.headRefOid) };
      } catch {
        return { ...base, error: "gh returned bad JSON" };
      }
    } else if (!/no pull requests found/i.test(pull.stderr)) {
      return { ...base, error: `gh failed: ${firstLine(pull.stderr)}` };
    }

    const ignored = yield* run("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"], cwd);
    return {
      ...base,
      gitDir: gitDir.stdout.trim(),
      head: tree.head,
      dirty: tree.dirty,
      busy,
      tip: tree.tip,
      merge,
      ignored: ignored.ok ? ignored.stdout.split("\n").filter(Boolean) : [],
    };
  });

const Facts = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  projectId: Schema.String,
  worktreePath: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  idle: Schema.Boolean,
  gitDir: Schema.NullOr(Schema.String),
  head: Schema.NullOr(Schema.String),
  dirty: Schema.Boolean,
  busy: Schema.NullOr(Schema.String),
  tip: Schema.NullOr(Schema.String),
  merge: Schema.NullOr(Schema.Struct({ state: Schema.String, headRefOid: Schema.String })),
  ignored: Schema.Array(Schema.String),
  error: Schema.NullOr(Schema.String),
});

/** The worktrees (of the passing ones) that another unsettled thread of the project uses, and those it cannot tell. */
const readOthers = (facts, payloadIds) =>
  Effect.gen(function* () {
    const passing = facts.filter((f) => keepReason(f) === null);
    const used = new Set();
    const unknown = new Set();
    for (const projectId of new Set(passing.map((f) => f.projectId))) {
      const paths = passing.filter((f) => f.projectId === projectId).map((f) => f.worktreePath);
      const list = yield* run(T3_CLI, ["thread", "list", "--project", projectId, "--json"]);
      let parsed = null;
      try {
        parsed = list.ok ? JSON.parse(list.stdout) : null;
      } catch {
        parsed = null;
      }
      const otherIds = otherThreadIds(parsed, payloadIds);
      if (!otherIds) {
        for (const p of paths) unknown.add(p);
        continue;
      }
      for (const otherId of otherIds) {
        const shown = yield* showThread(otherId);
        if (shown.error) {
          for (const p of paths) unknown.add(p);
        } else if (paths.includes(shown.thread.worktreePath)) {
          used.add(shown.thread.worktreePath);
        }
      }
    }
    return { used: [...used], unknown: [...unknown] };
  });

/** Removes one worktree after a late re-check. Never fails: a refusal is `kept: <reason>`. */
const removeWorktree = (r) =>
  Effect.gen(function* () {
    if (!existsSync(r.worktreePath)) return "removed";
    let idle = true;
    for (const id of r.threadIds) {
      const shown = yield* showThread(id);
      if (shown.error) return `kept: ${shown.error}`;
      idle = idle && isIdle(shown.thread);
    }
    const tree = yield* readTree(r.worktreePath, r.branch);
    if (tree.failed) return `kept: ${tree.failed}`;
    const late = recheck({ idle, head: tree.head, dirty: tree.dirty, tip: tree.tip }, r);
    if (late) return `kept: ${late}`;
    const out = yield* run("git", ["--git-dir", r.gitDir, "worktree", "remove", r.worktreePath]);
    if (out.ok || /is not a working tree/i.test(out.stderr)) return "removed";
    return `kept: ${firstLine(out.stderr)}`;
  });

/** Deletes one local branch after a tip check. Never fails: a refusal is `kept: <reason>`. */
const deleteBranch = (r) =>
  Effect.gen(function* () {
    const ref = yield* run("git", [
      "--git-dir",
      r.gitDir,
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${r.branch}`,
    ]);
    if (!ref.ok) return "deleted";
    if (ref.stdout.trim() !== r.headRefOid) return "kept: branch moved";
    const out = yield* run("git", ["--git-dir", r.gitDir, "branch", "-D", r.branch]);
    if (out.ok || /not found/i.test(out.stderr)) return "deleted";
    return `kept: ${firstLine(out.stderr)}`;
  });

export default workflow(
  "wrap-up",
  {
    version: 1,
    payload: Schema.Struct({ threadIds: Schema.NonEmptyArray(Schema.String) }),
    asks: { confirm: "Wrap up threads?" },
  },
  Effect.fn(function* (payload) {
    const ids = payload.threadIds;
    yield* title(`Wrap up ${ids.length} ${ids.length === 1 ? "thread" : "threads"}`);

    const facts = yield* step(
      "read",
      { returns: Schema.Array(Facts) },
      Effect.all(ids.map(readFacts), { concurrency: 4 }),
    );
    const project = facts.find((f) => f.projectId)?.projectId;
    if (!project) return yield* stop("no thread could be read");

    const others = yield* step(
      "others",
      { returns: Schema.Struct({ used: Schema.Array(Schema.String), unknown: Schema.Array(Schema.String) }) },
      readOthers(facts, ids),
    );
    const plan = planWrapUp(facts, others.used, others.unknown);

    const q = question(plan, ids.length);
    const answer = yield* ask("confirm", {
      kind: "confirm",
      title: q.title,
      choices: [`Wrap up ${ids.length}`, "Cancel"],
      data: q.data,
    });
    if (Option.isNone(answer) || answer.value.choice === "Cancel") return yield* stop("cancelled");

    const remove = [];
    const branch = [];
    for (const [i, r] of plan.removals.entries()) {
      remove.push(yield* step(`remove/${i}`, { returns: Schema.String }, removeWorktree(r)));
    }
    for (const [i, r] of plan.removals.entries()) {
      branch.push(
        remove[i] === "removed" ? yield* step(`branch/${i}`, { returns: Schema.String }, deleteBranch(r)) : null,
      );
    }

    const settle = yield* agent("settle", {
      project,
      runtimeMode: "full-access",
      brief: [
        "Settle each thread in the list below.",
        'For each one, call t3_thread_organize with the action "settle" and the thread id as its threadId argument.',
        "Change nothing else. Then report which ids you settled and which failed, with the reason.",
        "",
        ...ids.map((id) => `- ${id}`),
      ].join("\n"),
      returns: Schema.Struct({
        settled: Schema.Array(Schema.String),
        failed: Schema.Array(Schema.Struct({ id: Schema.String, reason: Schema.String })),
      }),
    });

    const extra = yield* step(
      "extra-prompt",
      { returns: Schema.NullOr(Schema.String) },
      Effect.suspend(() =>
        Effect.map(store.entry("settings/wrap-up/extra-prompt", Schema.String).get, (value) => Option.getOrNull(value)),
      ),
    );
    if (extra && extra.trim()) yield* agent("extra", { thread: settle.thread, brief: extra });

    return summary(plan, { remove, branch, settled: settle.value.settled, failed: settle.value.failed });
  }),
);
