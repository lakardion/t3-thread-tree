/** The Next-step brief that the backend keeps in memory and the page renders. */
export type Cli = "claude" | "codex";

export type ActionKind = "answer" | "merge" | "fix" | "review" | "clean-up" | "unblock";

export type BriefAction = {
  kind: ActionKind;
  title: string;
  reason: string;
  threadIds: string[];
  prompt: string | null;
};

export type BriefState =
  | { status: "idle" }
  | {
      status: "running";
      cli: Cli;
      threadCount: number;
      startedAt: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    }
  | { status: "done"; cli: Cli; generatedAt: string; actions: BriefAction[]; titles: Record<string, string> }
  | {
      status: "failed";
      cli: Cli;
      error: string;
      stderrTail: string;
      actions: BriefAction[];
      titles: Record<string, string>;
    };
