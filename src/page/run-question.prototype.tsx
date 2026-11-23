/**
 * PROTOTYPE, throwaway. How a Run question and a paused Run look, as a Triage card and as tree rows.
 * Fake runs, stubbed actions. Switch with `?variant=A|B|C` and `?fixture=` (the floating bar, or ← →).
 *
 * A Thread twin: the thread card and row, with a workflow icon and badge. Pick a chip, then Answer.
 * B Decision form: a card with its own frame, the choices as a vertical list; the row answers in one click.
 * C Run first: the card leads with the run and its steps; the row is the run, the question nests under it.
 *
 * Facts from T3: an answer is always one choice plus an optional reason. T3 sends no deadline, no chips.
 */
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CirclePause,
  ExternalLink,
  LoaderCircle,
  MessagesSquare,
  Play,
  Send,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/* ---------- fake data, shaped like workflows.subscribe ---------- */

type Question = { name: string; title: string; choices: string[]; askedMin: number; thread: boolean };
type Run = {
  id: string;
  workflow: string;
  title: string;
  status: "waiting" | "paused";
  detail: string | null;
  resumesInMin: number | null;
  retired: boolean;
  steps: { name: string; state: "done" | "now" | "failed" }[];
  question?: Question;
};

const LONG_FAIL =
  "Step `open-pr` failed after 3 attempts: gh: GraphQL: Resource not accessible by integration (createPullRequest). The token in GH_TOKEN lacks the `pull_requests: write` permission for acme/storefront. Retry with a token that has that scope, or open the PR by hand and resume the run so it picks up the existing PR from the branch shop-412-payment-route.";

const RUNS: Run[] = [
  {
    id: "q-short",
    workflow: "ship-issue",
    title: "Ship SHOP-412 Split the payment step",
    status: "waiting",
    detail: "approve-plan",
    resumesInMin: null,
    retired: false,
    steps: [
      { name: "plan", state: "done" },
      { name: "approve-plan", state: "now" },
    ],
    question: {
      name: "approve-plan",
      title: "Approve the plan for SHOP-412?",
      choices: ["Approve", "Revise", "Stop"],
      askedMin: 14,
      thread: true,
    },
  },
  {
    id: "q-long",
    workflow: "review-pr",
    title: "Review PR #2107 Saved cards list",
    status: "waiting",
    detail: "pick-fixes",
    resumesInMin: null,
    retired: false,
    steps: [
      { name: "review", state: "done" },
      { name: "verify", state: "done" },
      { name: "pick-fixes", state: "now" },
    ],
    question: {
      name: "pick-fixes",
      title:
        "The review found 4 problems in PR #2107. Two are in code that the PR did not touch. Which fixes do you want the agent to make before it asks for a re-review?",
      choices: [
        "Fix all 4",
        "Fix only the 2 in this PR",
        "Fix the null check in SavedCards and skip the rest",
        "None, request re-review now",
        "Close the PR",
      ],
      askedMin: 52,
      thread: false,
    },
  },
  {
    id: "q-none",
    workflow: "nightly-deps",
    title: "Nightly deps bump",
    status: "waiting",
    detail: "confirm",
    resumesInMin: null,
    retired: false,
    steps: [{ name: "confirm", state: "now" }],
    question: { name: "confirm", title: "Bump react to 19.3?", choices: [], askedMin: 3, thread: false },
  },
  {
    id: "p-person",
    workflow: "ship-issue",
    title: "Ship SHOP-420 Apple Pay button",
    status: "paused",
    detail: LONG_FAIL,
    resumesInMin: null,
    retired: false,
    steps: [
      { name: "plan", state: "done" },
      { name: "build", state: "done" },
      { name: "open-pr", state: "failed" },
    ],
  },
  {
    id: "p-auto",
    workflow: "review-pr",
    title: "Review PR #2088 Coupon field",
    status: "paused",
    detail: "Step `review` failed: the agent hit its usage limit.",
    resumesInMin: 25,
    retired: false,
    steps: [{ name: "review", state: "failed" }],
  },
  {
    id: "p-retired",
    workflow: "triage-bugs",
    title: "Triage bugs from Sentry",
    status: "paused",
    detail: "Step `label` failed: unknown label `p2`.",
    resumesInMin: null,
    retired: true,
    steps: [
      { name: "fetch", state: "done" },
      { name: "label", state: "failed" },
    ],
  },
];

/* ---------- variant + fixture store (URL backed) ---------- */

const VARIANTS = { A: "Thread twin", B: "Decision form", C: "Run first" } as const;
type Variant = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Variant[];
const listeners = new Set<() => void>();
const param = (k: string) => new URLSearchParams(location.search).get(k);
const setParam = (k: string, v: string) => {
  const url = new URL(location.href);
  url.searchParams.set(k, v);
  history.replaceState(history.state, "", url);
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const useParam = (k: string) => useSyncExternalStore(subscribe, () => param(k));
const useVariant = (): Variant => {
  const v = useParam("variant")?.toUpperCase();
  return KEYS.includes(v as Variant) ? (v as Variant) : "A";
};
const useFixture = () => {
  const id = useParam("fixture");
  return RUNS.find((r) => r.id === id) ?? RUNS[0];
};

/* ---------- shared bits ---------- */

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
const Kbd = ({ children }: { children: string }) => (
  <kbd className="font-mono text-[11px] text-muted-foreground">{children}</kbd>
);
const mins = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

/** Stubbed action state: a done line, or a busy cancel that takes a few seconds. */
function useStub() {
  const [done, setDone] = useState<string>();
  const [busy, setBusy] = useState(false);
  return {
    done,
    busy,
    act: (msg: string, slow = false) => {
      if (!slow) return setDone(msg);
      setBusy(true);
      setTimeout(() => (setBusy(false), setDone(msg)), 3000);
    },
    reset: () => setDone(undefined),
  };
}

const Done = ({ msg, reset }: { msg: string; reset: () => void }) => (
  <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
    <Check className="size-3.5 text-status-done" /> {msg}
    <Button variant="link" size="xs" className="ml-auto h-auto p-0" onClick={reset}>
      Undo (prototype)
    </Button>
  </div>
);

/** Resume and Cancel, with an inline confirm for Cancel and a slow cancel. */
function PausedActions({ r, size = "sm" }: { r: Run; size?: "sm" | "xs" }) {
  const s = useStub();
  const [confirm, setConfirm] = useState(false);
  if (s.done) return <Done msg={s.done} reset={s.reset} />;
  if (s.busy)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" /> Cancelling… this can take up to 30 s
      </span>
    );
  if (confirm)
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        Cancel this run and its child runs?
        <Button variant="destructive" size="xs" onClick={() => s.act("Run cancelled", true)}>
          Cancel run
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setConfirm(false)}>
          Keep
        </Button>
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Button
        size={size}
        disabled={r.retired}
        title={r.retired ? "This workflow version is gone. The run cannot go on." : undefined}
        onClick={() => s.act("Resumed: the failed step runs again")}
      >
        <Play /> Resume
      </Button>
      <Button variant="outline" size={size} onClick={() => setConfirm(true)}>
        <Ban /> Cancel
      </Button>
      <Button variant="ghost" size={size}>
        <ExternalLink /> Open run in T3
      </Button>
    </span>
  );
}

const pauseLine = (r: Run) =>
  r.retired
    ? "Its workflow version is gone. It cannot resume."
    : r.resumesInMin
      ? `Resumes by itself in ${mins(r.resumesInMin)}`
      : "Waits for you";

/* ---------- A: Thread twin ---------- */

function CardA({ r }: { r: Run }) {
  const q = r.question;
  const s = useStub();
  const [pick, setPick] = useState<string>();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-xs">
        {q ? (
          <Workflow className="size-3.5 text-status-plan" />
        ) : (
          <CirclePause className="size-3.5 text-status-failed" />
        )}
        <span className={cn("font-semibold", q ? "text-status-plan" : "text-status-failed")}>
          {q ? "Run question" : "Paused run"}
        </span>
        <span className="text-muted-foreground">· {r.workflow}</span>
        {q && <span className="text-status-plan tabular-nums">{mins(q.askedMin)}</span>}
        <span className="ml-auto text-muted-foreground tabular-nums">2 of 7</span>
        <Button variant="ghost" size="icon-xs" aria-label="Close Triage">
          <X />
        </Button>
      </div>
      <div className="text-sm font-semibold break-words">{q ? q.title : r.title}</div>
      <div className="text-xs text-muted-foreground">{q ? r.title : pauseLine(r)}</div>
      {!q && <p className="m-0 line-clamp-3 text-sm text-muted-foreground">{r.detail}</p>}
      {s.done ? (
        <Done msg={s.done} reset={s.reset} />
      ) : q ? (
        q.choices.length === 0 ? (
          <NoChoices />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {q.choices.map((c, i) => (
                <Button key={c} variant={pick === c ? "default" : "outline"} size="xs" onClick={() => setPick(c)}>
                  <Kbd>{String(i + 1)}</Kbd> {c}
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                placeholder="Reason (optional)…"
                className="max-h-40 min-h-9 flex-1 resize-none text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!pick}
                onClick={() => s.act(`Answered “${pick}”${reason ? " with a reason" : ""}`)}
              >
                <Send /> Answer
              </Button>
            </div>
          </>
        )
      ) : (
        <PausedActions r={r} />
      )}
      <div className="flex flex-wrap items-center gap-1">
        {q?.thread && (
          <Button variant="ghost" size="xs">
            <MessagesSquare /> Talk it through
          </Button>
        )}
        {q && (
          <Button variant="ghost" size="xs">
            <ExternalLink /> Open run in T3 <Kbd>o</Kbd>
          </Button>
        )}
        <Button variant="ghost" size="xs" className="ml-auto">
          Skip <Kbd>j</Kbd> <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

const NoChoices = () => (
  <div className="flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
    This question has no choices, and T3 takes only a choice. Answer it in T3.
    <Button size="sm" className="self-start">
      <ExternalLink /> Open run in T3
    </Button>
  </div>
);

function RowA({ r }: { r: Run }) {
  const q = r.question;
  return (
    <li className="my-px">
      <div className="group/row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 py-1 text-[13px] leading-5 hover:bg-muted/50">
        {q ? (
          <Workflow className="size-4 flex-none text-status-plan" />
        ) : (
          <CirclePause className="size-4 flex-none text-status-failed" />
        )}
        <span className={cn("flex-none text-xs", q ? "text-status-plan" : "text-status-failed")}>
          {q
            ? `asks you · ${mins(q.askedMin)}`
            : r.resumesInMin
              ? `paused · resumes ${mins(r.resumesInMin)}`
              : "paused"}
        </span>
        <Badge variant="outline" className={cn(CHIP, "flex-none")}>
          <Workflow className="size-3" /> {r.workflow}
        </Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{q ? q.title : r.title}</span>
        <span className="ml-auto flex-none truncate text-xs text-muted-foreground max-[720px]:hidden">
          {q ? r.title : r.detail?.slice(0, 48)}
        </span>
      </div>
    </li>
  );
}

/* ---------- B: Decision form ---------- */

function CardB({ r }: { r: Run }) {
  const q = r.question;
  const s = useStub();
  const [pick, setPick] = useState<string>();
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-3 border-l-[3px] border-dashed border-l-status-plan pl-3">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        <Workflow className="size-3.5 text-status-plan" /> Workflow · {r.workflow}
        <span className="normal-case">· {r.title}</span>
        <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Close Triage">
          <X />
        </Button>
      </div>
      {q ? (
        <>
          <div className="text-base leading-snug font-semibold break-words">{q.title}</div>
          {s.done ? (
            <Done msg={s.done} reset={s.reset} />
          ) : q.choices.length === 0 ? (
            <NoChoices />
          ) : (
            <>
              <div role="radiogroup" className="flex flex-col gap-1">
                {q.choices.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={pick === c}
                    onClick={() => setPick(c)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                      pick === c && "border-status-plan bg-status-plan/10",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 flex-none place-items-center rounded-full border",
                        pick === c && "border-status-plan bg-status-plan text-white",
                      )}
                    >
                      {pick === c && <Check className="size-3" />}
                    </span>
                    <span className="flex-1">{c}</span>
                    <Kbd>{String(i + 1)}</Kbd>
                  </button>
                ))}
              </div>
              <Textarea
                rows={1}
                placeholder="Why? (optional, sent with your choice)"
                className="min-h-8 resize-none text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!pick} onClick={() => s.act(`Answered “${pick}”`)}>
                  <Send /> Answer {pick ? `“${pick.length > 24 ? `${pick.slice(0, 24)}…` : pick}”` : ""}
                </Button>
                <span className="text-xs text-muted-foreground">asked {mins(q.askedMin)} ago</span>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-1 border-t pt-2">
            {q.thread && (
              <Button variant="ghost" size="xs">
                <MessagesSquare /> Talk it through
              </Button>
            )}
            <Button variant="ghost" size="xs">
              <ExternalLink /> Open run in T3
            </Button>
            <Button variant="ghost" size="xs" className="ml-auto">
              Skip <Kbd>j</Kbd>
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-base font-semibold">
            <CircleAlert className="size-4 text-status-failed" /> Paused: {pauseLine(r)}
          </div>
          <pre className="m-0 max-h-28 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
            {r.detail}
          </pre>
          <PausedActions r={r} />
        </>
      )}
    </div>
  );
}

/** One-click answer from the row: each choice is a button. No reason here. */
function RowB({ r }: { r: Run }) {
  const q = r.question;
  const s = useStub();
  return (
    <li className="my-px rounded-[8px] border border-dashed border-status-plan/50 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <Workflow className="size-4 flex-none text-status-plan" />
        <span className="min-w-0 flex-1 truncate font-medium">{q ? q.title : `${r.title}: paused`}</span>
        <span className="flex-none text-[11px] text-muted-foreground">{r.workflow}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
        {s.done ? (
          <Done msg={s.done} reset={s.reset} />
        ) : q ? (
          q.choices.length ? (
            q.choices.map((c) => (
              <Button key={c} variant="outline" size="xs" className="max-w-56" onClick={() => s.act(`Answered “${c}”`)}>
                <span className="truncate">{c}</span>
              </Button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No choices. Answer in T3.</span>
          )
        ) : (
          <>
            <span className="mr-1 text-xs text-status-failed">{pauseLine(r)}</span>
            <PausedActions r={r} size="xs" />
          </>
        )}
      </div>
    </li>
  );
}

/* ---------- C: Run first ---------- */

function Steps({ r }: { r: Run }) {
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-[11px]">
      {r.steps.map((st, i) => (
        <li key={st.name} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-3 bg-border" />}
          <span
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5",
              st.state === "done" && "text-muted-foreground",
              st.state === "now" && "border-status-plan text-status-plan",
              st.state === "failed" && "border-status-failed text-status-failed",
            )}
          >
            {st.state === "done" ? (
              <Check className="size-3" />
            ) : st.state === "failed" ? (
              <X className="size-3" />
            ) : (
              <Circle className="size-2 fill-current" />
            )}
            {st.name}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CardC({ r }: { r: Run }) {
  const q = r.question;
  const s = useStub();
  const [pick, setPick] = useState("");
  const [why, setWhy] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 flex-none place-items-center rounded-md bg-status-plan/15 text-status-plan">
          <Workflow className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{r.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {r.workflow} · {q ? `asks you · ${mins(q.askedMin)}` : pauseLine(r)}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Close Triage">
          <X />
        </Button>
      </div>
      <Steps r={r} />
      {q ? (
        <div className="rounded-lg bg-muted/60 p-2.5">
          <p className="m-0 mb-2 text-sm break-words">{q.title}</p>
          {s.done ? (
            <Done msg={s.done} reset={s.reset} />
          ) : q.choices.length === 0 ? (
            <NoChoices />
          ) : (
            <div className="flex flex-col gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={pick}
                onValueChange={setPick}
                className="flex w-full flex-wrap"
              >
                {q.choices.map((c) => (
                  <ToggleGroupItem
                    key={c}
                    value={c}
                    className="h-auto min-h-8 flex-auto py-1 text-xs whitespace-normal"
                  >
                    {c}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {why ? (
                <Textarea
                  rows={2}
                  placeholder="Reason…"
                  className="resize-none bg-background text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              ) : (
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground hover:underline"
                  onClick={() => setWhy(true)}
                >
                  + Add a reason
                </button>
              )}
              <Button size="sm" className="self-end" disabled={!pick} onClick={() => s.act(`Answered “${pick}”`)}>
                <Send /> Answer
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-status-failed/40 p-2.5">
          <p className="m-0 line-clamp-4 text-xs text-muted-foreground">{r.detail}</p>
          <PausedActions r={r} />
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {q?.thread && (
          <Button variant="ghost" size="xs">
            <MessagesSquare /> Talk it through
          </Button>
        )}
        {q && (
          <Button variant="ghost" size="xs">
            <ExternalLink /> Open run in T3
          </Button>
        )}
        <Button variant="ghost" size="xs" className="ml-auto">
          Skip <Kbd>j</Kbd>
        </Button>
      </div>
    </div>
  );
}

function RowC({ r }: { r: Run }) {
  const q = r.question;
  return (
    <li className="my-px">
      <div className="flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 py-1 text-[13px]">
        <span className="grid size-5 flex-none place-items-center rounded bg-status-plan/15 text-status-plan">
          <Workflow className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
        <Badge variant="outline" className={cn(CHIP, "flex-none", !q && "text-status-failed")}>
          {q ? "Asks you" : r.resumesInMin ? `Paused · ${mins(r.resumesInMin)}` : "Paused"}
        </Badge>
        <span className="flex-none text-[11px] text-muted-foreground">{r.workflow}</span>
      </div>
      <div className="ml-[18px] flex min-w-0 items-center gap-2 border-l py-1 pl-4 text-[13px]">
        {q ? (
          <>
            <MessagesSquare className="size-3.5 flex-none text-status-plan" />
            <span className="min-w-0 flex-1 truncate">{q.title}</span>
            <span className="flex-none font-mono text-[11px] text-status-plan">{mins(q.askedMin)}</span>
          </>
        ) : (
          <>
            <X className="size-3.5 flex-none text-status-failed" />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.detail}</span>
          </>
        )}
      </div>
    </li>
  );
}

/* ---------- mount points ---------- */

const CARDS = { A: CardA, B: CardB, C: CardC };
const ROWS = { A: RowA, B: RowB, C: RowC };

/** Mounts where the Triage card sits. */
export function RunQuestionCardPrototype() {
  const variant = useVariant();
  const r = useFixture();
  const Card = CARDS[variant];
  return (
    <section aria-label="Triage (prototype)" className="sticky top-0 z-30 mb-3 bg-background">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <Card key={`${variant}${r.id}`} r={r} />
      </div>
    </section>
  );
}

/** Mounts as the first items of the tree list, next to real thread rows. */
export function RunQuestionRowsPrototype() {
  const Row = ROWS[useVariant()];
  return (
    <>
      {RUNS.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </>
  );
}

/** The floating bar: variant and fixture. ← → cycle the variant outside fields. */
export function RunQuestionSwitcher() {
  const variant = useVariant();
  const fixture = useFixture();
  const go = (d: number) => setParam("variant", KEYS[(KEYS.indexOf(variant) + d + KEYS.length) % KEYS.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });
  const bar: ReactNode = (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-2 py-1 text-xs text-background shadow-lg">
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="font-semibold">
        {variant} ({VARIANTS[variant]})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRight className="size-4" />
      </button>
      <select
        aria-label="Card fixture"
        className="rounded-full bg-background px-2 py-0.5 text-foreground"
        value={fixture.id}
        onChange={(e) => setParam("fixture", e.target.value)}
      >
        {RUNS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id}
          </option>
        ))}
      </select>
    </div>
  );
  return bar;
}
