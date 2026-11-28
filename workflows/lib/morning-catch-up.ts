import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import { choiceLabels, nextWeekdayAt9, pick } from "./catch-up-rules.ts";

const { step, agent, ask, title, daily, runs, store, Tick } = T3;

const THREAD_TITLE = "Morning catch-up";

const Pr = Schema.Struct({ number: Schema.Number, state: Schema.String });
const Row = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  project: Schema.String,
  status: Schema.String,
  updatedAt: Schema.String,
  link: Schema.String,
  prs: Schema.Array(Pr),
});
const Found = Schema.Struct({ looksDone: Schema.Array(Row), waiting: Schema.Array(Row) });
const PausedRun = Schema.Struct({
  id: Schema.String,
  workflow: Schema.String,
  title: Schema.NullOr(Schema.String),
  detail: Schema.NullOr(Schema.String),
});
const Done = Schema.Struct({
  settled: Schema.Array(Schema.String),
  snoozed: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
});

const READ_BRIEF = `Find the threads that need a look. Change nothing.

1. Call t3_thread_list with allProjects: true, settled: false, snoozed: false. Follow cursor until the last page.
2. Drop a row at once when parentThreadId is not null, or when its title is exactly "${THREAD_TITLE}".
3. Looks done: a row with pullRequestCount of 1 or more and openPullRequestCount of 0.
4. Waiting: every other row with status waiting, completed, failed or interrupted. Sort by updatedAt, oldest first.
5. For each row return id, title, project, status, updatedAt, link (the link field of the row) and prs (number and state of each entry of the row's pullRequests, which can be empty).`;

export const options = {
  version: 1,
  payload: Tick,
  triggers: [daily("09:00", { weekdays: [1, 2, 3, 4, 5] })],
  asks: { "catch-up": "Morning catch-up" },
};

export const body = Effect.fn(function* () {
  yield* title(THREAD_TITLE);

  const extra = yield* step(
    "settings",
    { returns: Schema.NullOr(Schema.String) },
    Effect.map(store.entry("settings/morning-catch-up/extra-prompt", Schema.String).get, (value) =>
      Option.getOrNull(value),
    ),
  );

  /** The main checkout of the repo that holds this file: T3 knows it as a project. */
  const project = yield* step(
    "project",
    { returns: Schema.String },
    Effect.try({
      try: () =>
        dirname(
          execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
            cwd: import.meta.dirname,
            encoding: "utf8",
          }).trim(),
        ),
      catch: (error) => new Error(`git could not find the repo checkout: ${String(error)}`),
    }),
  );

  const read = yield* agent("read", {
    project,
    runtimeMode: "full-access",
    title: THREAD_TITLE,
    returns: Found,
    brief: READ_BRIEF,
  });
  const { looksDone, waiting } = read.value;

  const paused = yield* step(
    "paused",
    { returns: Schema.Array(PausedRun) },
    Effect.map(runs({ status: "paused" }), (found) =>
      found.map((run) => ({
        id: run.id,
        workflow: run.workflow,
        title: run.title,
        detail: run.detail,
      })),
    ),
  );

  /** Read in a step, so a replay keeps the same value. */
  const until = yield* step(
    "until",
    { returns: Schema.String },
    Effect.sync(() => nextWeekdayAt9(new Date()).toISOString()),
  );

  if (looksDone.length + waiting.length + paused.length > 0) {
    const labels = choiceLabels(looksDone.length, waiting.length, new Date(until).toDateString());
    const answer = yield* ask("catch-up", {
      kind: "catch-up",
      title: `${looksDone.length} look done, ${waiting.length} waiting, ${paused.length} paused runs`,
      choices: labels,
      data: { looksDone, waiting, paused },
      timeout: "9 hours",
    });
    if (Option.isSome(answer)) {
      const { settle, snooze } = pick(
        labels.indexOf(answer.value.choice),
        looksDone.map((row) => row.id),
        waiting.map((row) => row.id),
      );
      if (settle.length + snooze.length > 0) {
        yield* agent("act", {
          thread: read.thread,
          returns: Done,
          brief: `The user chose: ${answer.value.choice}
Reason: ${answer.value.reason || "none"}

Read the reason first. Leave out every thread that the reason names.
Then call t3_thread_organize for each remaining thread:
- Thread ids to settle: ${JSON.stringify(settle)}. Call it with settle.
- Thread ids to snooze: ${JSON.stringify(snooze)}. Call it with snooze and snoozedUntil "${until}".
Return the ids you settled, the ids you snoozed and, as skipped, the ids you left out.`,
        });
      }
    }
  }

  if (extra !== null) yield* agent("extra", { thread: read.thread, brief: extra });
});
