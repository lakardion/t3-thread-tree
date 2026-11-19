/**
 * PROTOTYPE, throw away. Three variants of Triage mode on the real demo page: `?triage=modal|panel|inline`.
 * The "Triage" header button (key `t`) takes the place of the "What's next" controls. All actions are stubs: nothing
 * is sent, settled or snoozed. The bottom bar switches the variant and fakes queue changes.
 * Catch-ups are stubs keyed by demo thread id, copied from the Catch-up look prototype.
 */
import {
  ArrowRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ExternalLink,
  Inbox,
  Moon,
  Pin,
  Send,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { ThreadNode } from "../shared/tree.ts";
import { ago, stripKey } from "./format.ts";
import { revealRow } from "./focus.tsx";
import { LastMessage, useLastMessage } from "./send-dialog.tsx";
import { STATUS, StatusIcon } from "./status-icon.tsx";

type CatchUp = { did: string | null; ask: string | null; options?: string[] };

const STUB: Record<string, CatchUp> = {
  "demo-2": { did: "Saved cards list works.", ask: "Make a new card the default?", options: ["At once", "Only when picked"] },
  "demo-15": { did: "Retry queue needs a new table.", ask: "Approve db:migrate retry_queue?" },
  "demo-12": { did: "Found the cart badge race; fix half done. Stopped on a rate limit.", ask: null },
  "demo-17": { did: null, ask: null },
  "demo-20": { did: "Plan: cursor pagination in 3 steps.", ask: "Approve to start step 1?" },
  "demo-22": { did: "Guest wants 'Fixed' renamed to 'Bug fixes'.", ask: "Use the guest's wording?" },
  "demo-24": {
    did: "Linked 4 release PRs; #3001 approved, checks pass.",
    ask: "Draft #3004:",
    options: ["Mark ready", "Leave for docs team"],
  },
  "demo-25": { did: "Schema change adds a nullable region column.", ask: "Approve the migration?" },
  dispatch: { did: "3 cache threads as a stack; 2 done, 1 runs.", ask: "Go ahead and request reviews?" },
  "search-b": {
    did: "Backfill ready: 2.1 M docs, about 40 min.",
    ask: "When to run it?",
    options: ["One batch tonight", "By shard, daytime"],
  },
  "search-plan": { did: "Index plan written: one index per locale.", ask: "Is freshness ranking in scope?" },
};

type Key = "modal" | "panel" | "inline";
const VARIANTS: { key: Key; name: string; position: string }[] = [
  {
    key: "modal",
    name: "A · Modal deck",
    position: "A dialog over the page, one card, own keys. Full screen at 390 px. The tree is hidden while you triage.",
  },
  {
    key: "panel",
    name: "B · Side panel",
    position:
      "A panel on the right; the tree stays visible and the card's row flashes in it. Bottom sheet at 390 px. Page keys pause while it is open.",
  },
  {
    key: "inline",
    name: "C · Inline card",
    position:
      "The card sits at the top of the list, where the brief panel was, with the next three as a peek line. The tree scrolls under it.",
  },
];

/** URL-backed state, so each variant has its own link. */
const read = () => {
  const p = new URLSearchParams(location.search);
  return {
    key: (VARIANTS.find((v) => v.key === p.get("triage"))?.key ?? "modal") as Key,
    open: p.get("topen") === "1",
  };
};
let snap = read();
const subs = new Set<() => void>();
function set(next: Partial<typeof snap>) {
  snap = { ...snap, ...next };
  const p = new URLSearchParams(location.search);
  p.set("triage", snap.key);
  if (snap.open) p.set("topen", "1");
  else p.delete("topen");
  history.replaceState(null, "", `?${p}`);
  subs.forEach((f) => f());
}
const useProto = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => snap,
  );

/** True when the Triage UI is mounted: page keys pause. */
export const triageOpen = () => snap.open;

const TITLE: Record<string, string> = {
  "needs-input": "Needs input",
  "plan-ready": "Plan ready",
  "your-turn": "Your turn",
};

/** Request kinds that only T3 can answer. */
const APPROVAL = new Set(["command", "file-change", "file-read", "permission", "dynamic_tool_call"]);
const approvalOf = (t: ThreadNode) => {
  const kind = t.detail.request?.split(" · ")[0] ?? "";
  return t.status === "needs-input" && APPROVAL.has(kind) ? kind : null;
};

/** Rule chips: a broken PR gives a fix prompt, a ready PR a merge prompt. Only on your-turn cards. */
function ruleChips(t: ThreadNode): { label: string; text: string }[] {
  if (t.status !== "your-turn") return [];
  const broken = t.prs.find(
    (p) => p.state === "open" && (p.checks === "failing" || p.conflicting || p.review === "changes-requested"),
  );
  if (broken) {
    const steps = [
      broken.conflicting && "Rebase on main and resolve the conflicts",
      broken.checks === "failing" && "fix the failing checks",
      broken.review === "changes-requested" && "address the review comments",
    ].filter(Boolean);
    return [{ label: `Fix PR #${broken.n}`, text: `${steps.join(", ")}, and push.` }];
  }
  const ready = t.prs.find(
    (p) => p.state === "open" && !p.draft && p.review === "approved" && p.checks === "passing" && !p.conflicting,
  );
  return ready ? [{ label: `Merge PR #${ready.n}`, text: `Merge PR #${ready.n} and delete its branch.` }] : [];
}

const firstLine = (s: string | null | undefined) => (s ?? "").split("\n").find((l) => l.trim()) ?? "";

type Outcome = "sent" | "settled" | "snoozed" | "skipped";

/** The local queue model. The card in hand is pinned until the user acts; skips go to the end of the round. */
function useTriage(queue: ThreadNode[], live: Map<string, ThreadNode>) {
  const [done, setDone] = useState<Map<string, Outcome>>(new Map());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<ThreadNode[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  /** Ids in queue order, with fakes at the end, minus the done ones; skipped ones after the rest. */
  const all = [...queue, ...extra].filter((t) => !done.has(t.id));
  const fresh = all.filter((t) => !skipped.includes(t.id));
  const order = [...fresh, ...skipped.flatMap((id) => all.filter((t) => t.id === id))];
  const byId = new Map([...queue, ...extra].map((t) => [t.id, t] as const));
  const pick = order.find((t) => !gone.has(t.id))?.id ?? null;
  const shown = current && !done.has(current) && byId.has(current) ? current : pick;
  useEffect(() => {
    if (shown !== current) setCurrent(shown);
  }, [shown, current]);
  const t = shown ? (live.get(shown) ?? byId.get(shown)!) : null;
  const act = (o: Outcome) => {
    if (!shown) return;
    if (o === "skipped") setSkipped((s) => [...s.filter((x) => x !== shown), shown]);
    else setDone((m) => new Map(m).set(shown, o));
    setCurrent(null);
  };
  const total = done.size + order.filter((x) => !gone.has(x.id)).length;
  return {
    t,
    /** The card's thread left the queue elsewhere (answered in T3, settled on another device). */
    isGone: !!shown && gone.has(shown),
    pos: done.size + 1,
    total,
    upcoming: order.filter((x) => x.id !== shown && !gone.has(x.id)).slice(0, 3),
    newCount: extra.length,
    done,
    act,
    leave: () => setCurrent(null),
    fakeGone: () => shown && setGone((g) => new Set(g).add(shown)),
    fakeNew: () => {
      const base = queue[0];
      if (!base) return;
      const n = extra.length + 1;
      setExtra((e) => [
        ...e,
        {
          ...base,
          id: `fake-${n}`,
          title: `New wait ${n} · Pick a cache TTL for the search API`,
          key: null,
          status: "needs-input",
          phrase: "Question",
          since: new Date().toISOString(),
          prs: [],
          detail: { ...base.detail, request: "user_input" },
        },
      ]);
    },
    restart: () => (setDone(new Map()), setSkipped([]), setGone(new Set()), setCurrent(null)),
  };
}
type Triage = ReturnType<typeof useTriage>;

function CatchUpLine({ t }: { t: ThreadNode }) {
  const c = STUB[t.id];
  const text = useLastMessage(t.id, t.updatedAt);
  if (c?.ask && c.did)
    return (
      <p className="text-sm leading-relaxed">
        <span className="text-muted-foreground">{c.did} </span>
        <span className={cn("font-semibold", STATUS[t.status].shape)}>Asks:</span> {c.ask}
      </p>
    );
  return (
    <p className="flex flex-wrap items-baseline gap-1.5 text-sm">
      <Badge variant="outline" className="h-[18px] border-dashed text-[11px] text-muted-foreground">
        No clear ask
      </Badge>
      <span className="text-muted-foreground italic">“{firstLine(text) || t.phrase}”</span>
    </p>
  );
}

function Card({ tri, onClose, compact }: { tri: Triage; onClose?: () => void; compact?: boolean }) {
  const t = tri.t!;
  const [reply, setReply] = useState("");
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const text = useLastMessage(t.id, t.updatedAt);
  const approval = approvalOf(t);
  const chips = [
    ...(STUB[t.id]?.options ?? []).map((o) => ({ label: o, text: o })),
    ...ruleChips(t),
  ];
  useEffect(() => (setReply(""), setMore(false)), [t.id]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(id);
  }, [toast]);
  const doIt = (o: Outcome | "focus" | "open", label: string) => {
    setToast(`Stub: ${label}`);
    if (o === "focus") return;
    if (o === "open") return tri.act("skipped");
    tri.act(o);
  };
  const send = () => reply.trim() && doIt("sent", `send “${reply.trim().slice(0, 40)}”`);

  /** Letters act when the reply field is not focused; Cmd/Ctrl+Enter sends from the field, Esc leaves it. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = document.activeElement === field.current;
      if (inField) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), send());
        if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), field.current?.blur());
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const map: Record<string, () => void> = {
        r: () => field.current?.focus(),
        e: () => doIt("settled", "settle"),
        z: () => doIt("snoozed", "snooze 1 h"),
        f: () => doIt("focus", "add to Focus"),
        o: () => doIt("open", "open in T3"),
        j: () => doIt("skipped", "skip"),
        ArrowRight: () => doIt("skipped", "skip"),
        " ": () => setMore((m) => !m),
      };
      const n = Number(e.key);
      if (n >= 1 && n <= chips.length) map[e.key] = () => (setReply(chips[n - 1].text), field.current?.focus());
      const f = map[e.key];
      if (f) (e.preventDefault(), e.stopImmediatePropagation(), f());
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  });

  const since = t.since ? ago(t.since, Date.now()) : "";
  return (
    <div className="relative flex min-h-0 flex-col gap-3">
      {tri.isGone && (
        <div className="rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
          No longer waits: answered in T3. <Button variant="link" size="xs" className="h-auto p-0" onClick={tri.leave}>Next</Button>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon t={t} now={Date.now()} />
        <span className={cn("font-semibold", STATUS[t.status].shape)}>{TITLE[t.status] ?? t.status}</span>
        <span className="text-muted-foreground">· {t.phrase}</span>
        {since && <span className={cn("font-mono tabular-nums", STATUS[t.status].shape)}>{since}</span>}
        <span className="ml-auto text-muted-foreground tabular-nums">
          {tri.pos} of {tri.total}
          {tri.newCount > 0 && <span className="ml-1 text-status-needs-input">+{tri.newCount} new</span>}
        </span>
        {onClose && (
          <Button variant="ghost" size="icon" className="size-6" aria-label="Close Triage" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
      <a href={t.href} className={cn("font-semibold hover:underline", compact ? "text-sm" : "text-base")}>
        {t.key && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{t.key}</span>}
        {(t.key ? stripKey(t.title, t.key) : t.title) || t.id}
      </a>
      <CatchUpLine t={t} />
      <button
        type="button"
        className="self-start text-xs text-muted-foreground hover:underline"
        onClick={() => setMore((m) => !m)}
      >
        {more ? "Hide" : "Show"} last message <kbd className="ml-1 font-mono">space</kbd>
      </button>
      {more && <LastMessage text={text === undefined ? "Loading…" : (text ?? "No message.")} />}
      {approval ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
          <span>
            The agent asks to approve a <b>{approval}</b>. Approve or deny it in T3: T3 does not take an approval as a
            message.
          </span>
          <Button size="sm" className="self-start" onClick={() => doIt("open", "open in T3")}>
            <ExternalLink /> Open in T3 <kbd className="ml-1 font-mono opacity-70">o</kbd>
          </Button>
        </div>
      ) : (
        <>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <Button
                  key={c.label}
                  variant="outline"
                  size="xs"
                  title={c.text}
                  onClick={() => (setReply(c.text), field.current?.focus())}
                >
                  <kbd className="font-mono text-muted-foreground">{i + 1}</kbd> {c.label}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={field}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={t.status === "plan-ready" ? "Reply to the plan… (r)" : "Reply… (r)"}
              rows={compact ? 1 : 2}
              className="min-h-9 flex-1 resize-none text-sm"
            />
            <Button size="sm" disabled={!reply.trim()} onClick={send}>
              <Send /> Send <kbd className="font-mono opacity-70">⌘↵</kbd>
            </Button>
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="xs" onClick={() => doIt("settled", "settle")}>
          <CircleCheckBig /> Settle <kbd className="font-mono text-muted-foreground">e</kbd>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs">
              <Moon /> Snooze <kbd className="font-mono text-muted-foreground">z</kbd>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {["1 hour", "Until tonight", "Until tomorrow"].map((d) => (
              <DropdownMenuItem key={d} onSelect={() => doIt("snoozed", `snooze ${d}`)}>
                {d}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="xs" onClick={() => doIt("focus", "add to Focus")}>
          <Pin /> Focus <kbd className="font-mono text-muted-foreground">f</kbd>
        </Button>
        {!approval && (
          <Button variant="ghost" size="xs" onClick={() => doIt("open", "open in T3")}>
            <ExternalLink /> Open in T3 <kbd className="font-mono text-muted-foreground">o</kbd>
          </Button>
        )}
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => doIt("skipped", "skip")}>
          Skip <kbd className="font-mono text-muted-foreground">j</kbd> <ArrowRight />
        </Button>
      </div>
      {toast && (
        <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-foreground px-2 py-0.5 text-xs text-background">
          {toast}
        </div>
      )}
    </div>
  );
}

function End({ tri, onClose }: { tri: Triage; onClose?: () => void }) {
  const n = (o: Outcome) => [...tri.done.values()].filter((x) => x === o).length;
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCheck className="size-6 text-status-done" />
      <span className="text-sm font-semibold">Nothing waits</span>
      <span className="text-xs text-muted-foreground">
        {n("sent")} sent · {n("settled")} settled · {n("snoozed")} snoozed
      </span>
      <div className="w-full rounded-md border border-dashed p-2 text-xs text-muted-foreground">
        Slot: “Looks done” bulk settle offer (decided in its own ticket).
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={tri.restart}>
          Start again
        </Button>
        {onClose && (
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

const Body = ({ tri, onClose, compact }: { tri: Triage; onClose?: () => void; compact?: boolean }) =>
  tri.t ? <Card key={tri.t.id} tri={tri} onClose={onClose} compact={compact} /> : <End tri={tri} onClose={onClose} />;

/** The header button that replaces the "What's next" controls. */
export function TriageButton({ count }: { count: number }) {
  const { open } = useProto();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || snap.open) return;
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) (e.preventDefault(), set({ open: true }));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  return (
    <Button
      variant={open ? "secondary" : "outline"}
      size="sm"
      aria-keyshortcuts="t"
      onClick={() => set({ open: !open })}
    >
      <Inbox /> <span className="max-[720px]:hidden">Triage</span>
      {count > 0 && (
        <span className="rounded-[4px] bg-status-needs-input px-1 text-[11px] text-white tabular-nums">{count}</span>
      )}
    </Button>
  );
}

/** The inline variant mounts in the list; the others float. */
export function TriageInline({ tri }: { tri: Triage }) {
  const { key, open } = useProto();
  if (key !== "inline" || !open) return null;
  const close = () => set({ open: false });
  return (
    <section className="mb-3 rounded-lg border border-l-[3px] border-l-status-needs-input bg-card p-3 shadow-sm">
      <Body tri={tri} onClose={close} compact />
      {tri.upcoming.length > 0 && (
        <p className="mt-2 truncate border-t pt-2 text-xs text-muted-foreground">
          Next: {tri.upcoming.map((u) => u.title || u.id).join(" · ")}
        </p>
      )}
    </section>
  );
}

export function TriageFloat({ tri }: { tri: Triage }) {
  const { key, open } = useProto();
  const close = () => set({ open: false });
  const id = tri.t?.id;
  useEffect(() => {
    if (open && key === "panel" && id) revealRow(id);
  }, [open, key, id]);
  useEffect(() => {
    if (!open || key === "modal") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, key]);
  if (!open) return null;
  if (key === "modal")
    return (
      <Dialog open onOpenChange={(o) => !o && close()}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-xl max-[720px]:h-dvh max-[720px]:max-w-none max-[720px]:rounded-none max-[720px]:content-start"
        >
          <DialogTitle className="sr-only">Triage</DialogTitle>
          <DialogDescription className="sr-only">One waiting thread at a time.</DialogDescription>
          <Body tri={tri} onClose={close} />
          {tri.upcoming.length > 0 && (
            <ul className="border-t pt-2 text-xs text-muted-foreground">
              {tri.upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-1.5 truncate">
                  <StatusIcon t={u} now={Date.now()} /> <span className="truncate">{u.title || u.id}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    );
  if (key === "panel")
    return (
      <aside className="fixed top-0 right-0 z-40 flex h-dvh w-[420px] flex-col gap-3 overflow-y-auto border-l bg-background p-4 shadow-xl max-[720px]:top-auto max-[720px]:bottom-0 max-[720px]:h-[72dvh] max-[720px]:w-full max-[720px]:rounded-t-xl max-[720px]:border-t max-[720px]:border-l-0">
        <Body tri={tri} onClose={close} />
        {tri.upcoming.length > 0 && (
          <div className="mt-auto border-t pt-2 text-xs text-muted-foreground">
            <span className="font-semibold">Up next</span>
            <ul>
              {tri.upcoming.map((u) => (
                <li key={u.id} className="flex items-center gap-1.5 truncate">
                  <StatusIcon t={u} now={Date.now()} /> <span className="truncate">{u.title || u.id}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    );
  return null;
}

export { useTriage };

/** Variant switcher plus queue-change fakes. */
export function TriageBar({ tri }: { tri: Triage }) {
  const { key } = useProto();
  const i = VARIANTS.findIndex((v) => v.key === key);
  const go = (d: number) => set({ key: VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length].key });
  return (
    <div className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-foreground/40 bg-background/95 p-1 text-xs shadow-lg backdrop-blur">
      <Button variant="ghost" size="icon" className="size-7" aria-label="Previous variant" onClick={() => go(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-32 text-center font-medium" title={VARIANTS[i].position}>
        {VARIANTS[i].name}
      </span>
      <Button variant="ghost" size="icon" className="size-7" aria-label="Next variant" onClick={() => go(1)}>
        <ChevronRight />
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button variant="ghost" size="xs" onClick={tri.fakeGone} disabled={!tri.t}>
        Answered elsewhere
      </Button>
      <Button variant="ghost" size="xs" onClick={tri.fakeNew}>
        New wait arrives
      </Button>
    </div>
  );
}

