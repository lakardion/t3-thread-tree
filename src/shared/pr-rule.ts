import type { ThreadNode } from "./tree.ts";

/** The code rule for a thread's PRs: fix the first broken open PR, else merge the first ready one. `null` when neither applies. */
export function prRule(n: ThreadNode): { kind: "fix" | "merge"; pr: number; prompt: string } | null {
  const broken = n.prs.find(
    (p) => p.state === "open" && (p.checks === "failing" || p.conflicting || p.review === "changes-requested"),
  );
  if (broken) {
    const steps: [boolean, string][] = [
      [broken.conflicting, "Rebase on main and resolve the conflicts"],
      [broken.checks === "failing", "fix the failing checks"],
      [broken.review === "changes-requested", "address the review comments"],
    ];
    return {
      kind: "fix",
      pr: broken.n,
      prompt: `${steps.flatMap(([on, step]) => (on ? [step] : [])).join(", ")}, and push.`,
    };
  }
  const ready = n.prs.find(
    (p) => p.state === "open" && !p.draft && p.review === "approved" && p.checks === "passing" && !p.conflicting,
  );
  return ready ? { kind: "merge", pr: ready.n, prompt: `Merge PR #${ready.n} and delete its branch.` } : null;
}
