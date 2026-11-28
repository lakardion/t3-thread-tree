export type Finding = {
  axis: "standards" | "spec";
  severity: "blocker" | "major" | "minor" | "nit";
  file?: string | null;
  line?: number | null;
  body: string;
};

export type Verdict = {
  decision: "approve" | "changes";
  summary: string;
  findings: readonly Finding[];
};

/** `changes` when any finding is a blocker or major, else `approve`. */
export const decide = (findings: readonly Finding[]): Verdict["decision"] =>
  findings.some((f) => f.severity === "blocker" || f.severity === "major") ? "changes" : "approve";

export type BriefInput = {
  repo: string;
  number: number;
  title: string;
  base: string;
  head: string;
  text?: string;
  checks?: string;
};

/** The brief of the review agent. */
export const brief = ({ repo, number, title, base, head, text, checks }: BriefInput): string =>
  [
    `Review pull request #${number} "${title}" of ${repo}. Change no file and post nothing.`,
    "",
    `1. Run \`gh pr checkout ${number} -R ${repo} --detach\`, then \`git checkout --detach ${head}\`. Detach: another worktree may hold the PR branch.`,
    `2. Run \`gh pr view ${number} -R ${repo} --json body,closingIssuesReferences\`. Read the PR body and each linked issue.`,
    `3. Review \`git diff origin/${base}...HEAD\` on two axes.`,
    "   - Standards: the repo's own docs, such as CLAUDE.md, AGENTS.md and CONTRIBUTING.md, and any AGENTS.md or CLAUDE.md in a folder of a changed path.",
    "   - Spec: the PR body and the linked issues.",
    "",
    'Give each finding an `axis` ("standards" or "spec") and a `severity`:',
    "- blocker: the change is wrong or breaks a rule, and must not merge.",
    "- major: a real defect or a clear break of a rule.",
    "- minor: worth fixing, not a defect.",
    "- nit: style or taste.",
    "Set `file` (repo-relative) and `line` (a line number on the new side of the diff) when the finding is about one line. Set `body` to the finding. Set `summary` to a short overall verdict.",
    ...(text ? ["", `Extra focus: ${text}`] : []),
    ...(checks
      ? [
          "",
          `Also apply these checks: ${checks}. Use only the checks a file or skill names. Keep this brief's process and output format. Give these findings \`axis: "standards"\`.`,
        ]
      : []),
  ].join("\n");

/** The text that makes a posted review recognizable as the one of a run. */
export const marker = (runId: string): string => `<!-- review-pr run ${runId} -->`;

/**
 * The right-side line numbers that the hunks of each file cover, from a unified diff.
 * GitHub refuses a review whose inline comment is outside the diff.
 */
export const diffLines = (patch: string): Map<string, Set<number>> => {
  const out = new Map<string, Set<number>>();
  let lines: Set<number> | null = null;
  let header = false;
  let next = 0;
  for (const row of patch.split("\n")) {
    if (row.startsWith("diff --git ")) {
      lines = null;
      header = true;
    } else if (header && row.startsWith("+++ ")) {
      const file = row.startsWith("+++ b/") ? row.slice(6) : null;
      lines = file ? new Set() : null;
      if (file && lines) out.set(file, lines);
    } else if (row.startsWith("@@")) {
      header = false;
      next = Number(/\+(\d+)/.exec(row)?.[1] ?? 0);
    } else if (lines && next > 0 && (row.startsWith("+") || row.startsWith(" "))) {
      lines.add(next++);
    }
  }
  return out;
};

const label = (f: Finding) => `**${f.severity} · ${f.axis}**`;

/** The JSON body of `POST /repos/{repo}/pulls/{n}/reviews`. The event is always `COMMENT`. */
export const reviewRequest = (
  verdict: Verdict,
  {
    runId,
    reviewed,
    commitId,
    diffLines: anchors,
  }: { runId: string; reviewed: string; commitId?: string; diffLines: Map<string, Set<number>> },
) => {
  const anchored = (f: Finding) => f.file != null && f.line != null && !!anchors.get(f.file)?.has(f.line);
  const loose = verdict.findings.filter((f) => !anchored(f));
  const body = [
    verdict.summary,
    `Decision: ${verdict.decision}. Reviewed commit: ${reviewed}.`,
    ...(loose.length
      ? [
          "",
          ...loose.map((f) => `- ${label(f)}${f.file ? ` \`${f.file}${f.line ? `:${f.line}` : ""}\`` : ""}: ${f.body}`),
        ]
      : []),
    "",
    marker(runId),
  ].join("\n");
  return {
    event: "COMMENT" as const,
    ...(commitId ? { commit_id: commitId } : {}),
    body,
    comments: verdict.findings
      .filter(anchored)
      .map((f) => ({ path: f.file, line: f.line, side: "RIGHT" as const, body: `${label(f)}\n\n${f.body}` })),
  };
};
