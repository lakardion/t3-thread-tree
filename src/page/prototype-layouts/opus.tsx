/** PROTOTYPE — throwaway layout variants. */
import { Check, Layers, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { allThreads, type Branch, type PrNode, type Status, type ThreadNode, type Tree } from "../../shared/tree.ts";
import { ago, linearHref, phraseWith, stripKey } from "../format.ts";
import { STATUS, StatusIcon } from "../status-icon.tsx";
import type { Variant, VariantProps } from "./switcher.tsx";

/** Attention buckets, most urgent first. */
const BUCKETS = [
  { id: "needs", label: "Needs you", tone: "needs-input", has: ["needs-input", "plan-ready"] },
  { id: "turn", label: "Your turn", tone: "done", has: ["your-turn"] },
  { id: "stopped", label: "Stopped", tone: "failed", has: ["failed", "interrupted"] },
  { id: "working", label: "Working", tone: "working", has: ["working", "starting", "waiting"] },
  { id: "quiet", label: "Done & idle", tone: "idle", has: ["done", "snoozed", "idle"] },
] as const satisfies readonly { id: string; label: string; tone: string; has: readonly Status[] }[];
type Bucket = (typeof BUCKETS)[number];

const bucketOf = (s: Status): Bucket => BUCKETS.find((b) => (b.has as readonly Status[]).includes(s))!;
const rank = (s: Status) => BUCKETS.indexOf(bucketOf(s));

/** Static class names per tone, so Tailwind sees them. */
const TONE = {
  "needs-input": {
    bar: "bg-status-needs-input",
    text: "text-status-needs-input-fg",
    border: "border-status-needs-input",
  },
  done: { bar: "bg-status-done", text: "text-status-done-fg", border: "border-status-done" },
  failed: { bar: "bg-status-failed", text: "text-status-failed-fg", border: "border-status-failed" },
  working: { bar: "bg-status-working", text: "text-status-working-fg", border: "border-status-working" },
  idle: { bar: "bg-status-idle", text: "text-muted-foreground", border: "border-status-idle" },
} as const;

/** One thread with the context it loses when it leaves its project tree. */
type Item = { t: ThreadNode; project: Branch; parent: ThreadNode | null };

const flatten = (projects: Branch[]): Item[] =>
  projects.flatMap((project) => {
    const parents = new Map<string, ThreadNode>();
    const all = allThreads(project);
    for (const p of all) for (const c of p.children) parents.set(c.id, p);
    return all.map((t) => ({ t, project, parent: parents.get(t.id) ?? null }));
  });

/** Urgency first, then the most recent update. */
const byAttention = (a: Item, b: Item) =>
  rank(a.t.status) - rank(b.t.status) || Date.parse(b.t.updatedAt) - Date.parse(a.t.updatedAt);

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";

const Dot = ({ className, title }: { className: string; title: string }) => (
  <span title={title} className={cn("size-1.5 flex-none rounded-full", className)} />
);

function PrChip({ p }: { p: PrNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(CHIP, "font-mono", p.draft && "border-dashed", p.state === "merged" && "text-pr-merged")}
      asChild
    >
      <a href={p.url} target="_blank" rel="noreferrer" title={p.draft ? `${p.state} · draft` : p.state}>
        <span className={cn(p.state === "closed" && "line-through")}>#{p.n}</span>
        {p.checks === "passing" && <Dot className="bg-status-done" title="Checks passing" />}
        {p.checks === "failing" && <Dot className="bg-status-failed" title="Checks failing" />}
        {p.checks === "pending" && <Dot className="border border-status-needs-input" title="Checks pending" />}
        {p.review === "approved" && <Check className="text-status-done" />}
        {p.review === "changes-requested" && <X className="text-status-failed" />}
        {p.conflicting && <TriangleAlert className="text-status-needs-input" />}
      </a>
    </Badge>
  );
}

const Marks = ({ t }: { t: ThreadNode }) => (
  <>
    {t.input && (
      <Badge variant="outline" className={CHIP}>
        Input
      </Badge>
    )}
    {t.stack && (
      <Badge variant="outline" className={CHIP} title="PR stack">
        <Layers />
        {t.stack.pos ? `${t.stack.pos}/${t.stack.total}` : `base · ${t.stack.total}`}
      </Badge>
    )}
    {t.prs.map((p) => (
      <PrChip key={p.n} p={p} />
    ))}
  </>
);

function KeyChip({ k, linear }: { k: string; linear: Tree["linear"] }) {
  const href = linearHref(k, linear);
  return (
    <Badge variant="outline" className={cn(CHIP, "flex-none font-mono", href && "hover:underline")} asChild={!!href}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title="Open in Linear">
          {k}
        </a>
      ) : (
        k
      )}
    </Badge>
  );
}

const Title = ({ t, className }: { t: ThreadNode; className?: string }) => (
  <a
    href={t.href}
    className={cn(
      "min-w-0 hover:underline",
      t.status === "your-turn" ? "font-[650]" : "font-medium",
      (t.status === "snoozed" || t.settled) && "text-muted-foreground",
      className,
    )}
  >
    {(t.key ? stripKey(t.title, t.key) : t.title) || t.id}
  </a>
);

const ProjectTag = ({ b }: { b: Branch }) => (
  <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
    <span
      aria-hidden
      className="flex size-4 flex-none items-center justify-center rounded-[4px] bg-muted text-[10px] font-semibold uppercase"
    >
      {b.label[0]}
    </span>
    <span className="truncate">{b.label}</span>
  </span>
);

const Phrase = ({ t, now }: { t: ThreadNode; now: number }) => (
  <span className={cn("text-xs font-medium", STATUS[t.status].text)}>{phraseWith(t, now)}</span>
);

/* ---------- opus-1: status lanes ---------- */

/** Columns by attention bucket across all projects; each thread is a compact card tagged with its project. */
function Lanes({ projects, now, linear }: VariantProps) {
  const items = flatten(projects).toSorted(byAttention);
  const lanes = BUCKETS.map((b) => ({ b, items: items.filter((i) => bucketOf(i.t.status) === b) })).filter(
    (l) => l.items.length > 0 || l.b.id !== "quiet",
  );
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {lanes.map(({ b, items: lane }) => (
        <section key={b.id} className="flex min-w-0 flex-col rounded-[12px] bg-muted/50 p-1.5">
          <h2 className="flex items-center gap-2 px-1.5 py-1 text-xs font-semibold">
            <span className={cn("size-2 rounded-full", TONE[b.tone].bar)} />
            {b.label}
            <span className="ml-auto font-mono text-muted-foreground tabular-nums">{lane.length}</span>
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lane.length === 0 && <li className="px-1.5 py-2 text-xs text-muted-foreground">Nothing here.</li>}
            {lane.map(({ t, project, parent }) => (
              <li
                key={t.id}
                className={cn(
                  "rounded-[8px] border-l-[3px] bg-card px-2 py-1.5 text-[13px] shadow-xs",
                  TONE[b.tone].border,
                )}
              >
                <div className="flex items-center gap-1.5">
                  <ProjectTag b={project} />
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                    {ago(t.updatedAt, now)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-start gap-1.5 leading-5">
                  <span className="mt-1">
                    <StatusIcon t={t} />
                  </span>
                  <Title t={t} className="line-clamp-2" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Phrase t={t} now={now} />
                  {t.key && <KeyChip k={t.key} linear={linear} />}
                  <Marks t={t} />
                </div>
                {parent && (
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">↳ from {parent.title}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ---------- opus-2: attention table ---------- */

/** One dense table of every thread, sorted by urgency then recency, with bucket dividers. */
function Table({ projects, now, linear }: VariantProps) {
  const items = flatten(projects).toSorted(byAttention);
  return (
    <div className="overflow-hidden rounded-[12px] border">
      <table className="w-full border-collapse text-[13px] max-[720px]:block">
        <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground max-[720px]:hidden">
          <tr>
            <th className="w-[150px] px-2 py-1 font-medium">Status</th>
            <th className="w-[130px] px-2 py-1 font-medium">Project</th>
            <th className="px-2 py-1 font-medium">Thread</th>
            <th className="w-px px-2 py-1 font-medium">PRs</th>
            <th className="w-10 px-2 py-1 text-right font-medium">Upd.</th>
          </tr>
        </thead>
        <tbody className="max-[720px]:block">
          {items.flatMap(({ t, project, parent }, i) => {
            const b = bucketOf(t.status);
            const head =
              b !== (i > 0 && bucketOf(items[i - 1].t.status)) ? (
                <tr key={`h:${b.id}`} className="border-t bg-muted/30">
                  <td colSpan={5} className={cn("px-2 py-0.5 text-[11px] font-semibold", TONE[b.tone].text)}>
                    {b.label} · {items.filter((x) => bucketOf(x.t.status) === b).length}
                  </td>
                </tr>
              ) : null;
            const row = (
              <tr
                key={t.id}
                className="border-t border-border/50 hover:bg-accent/50 max-[720px]:flex max-[720px]:flex-wrap max-[720px]:items-center max-[720px]:gap-x-2 max-[720px]:px-2 max-[720px]:py-1"
              >
                <td className="px-2 py-1 whitespace-nowrap max-[720px]:p-0">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusIcon t={t} />
                    <Phrase t={t} now={now} />
                  </span>
                </td>
                <td className="max-w-[130px] px-2 py-1 max-[720px]:p-0">
                  <ProjectTag b={project} />
                </td>
                <td className="max-w-0 px-2 py-1 max-[720px]:max-w-none max-[720px]:basis-full max-[720px]:p-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {parent && <span className="text-muted-foreground">↳</span>}
                    {t.key && <KeyChip k={t.key} linear={linear} />}
                    <Title t={t} className="truncate" />
                  </span>
                </td>
                <td className="w-px px-2 py-1 whitespace-nowrap max-[720px]:w-auto max-[720px]:p-0">
                  <span className="flex gap-1">
                    <Marks t={t} />
                  </span>
                </td>
                <td className="px-2 py-1 text-right font-mono text-[11px] text-muted-foreground tabular-nums max-[720px]:ml-auto max-[720px]:p-0">
                  {ago(t.updatedAt, now)}
                </td>
              </tr>
            );
            return head ? [head, row] : [row];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- opus-3: project × status matrix ---------- */

/** A projects × buckets grid of counts; pick a cell, row or column to list its threads below. */
function Matrix({ projects, now, linear }: VariantProps) {
  const items = flatten(projects);
  const [pick, setPick] = useState<{ project?: string; bucket?: Bucket["id"] }>(() => ({
    bucket: items.some((i) => bucketOf(i.t.status).id === "needs") ? "needs" : undefined,
  }));
  const cell = (p?: string, b?: Bucket["id"]) =>
    items.filter((i) => (!p || i.project.id === p) && (!b || bucketOf(i.t.status).id === b));
  const shown = cell(pick.project, pick.bucket).toSorted(byAttention);
  const is = (p?: string, b?: Bucket["id"]) => pick.project === p && pick.bucket === b;
  const pickBtn = "cursor-pointer rounded-[6px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-[12px] border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/60 text-[11px]">
              <th className="px-2 py-1 text-left">
                <button className={cn(pickBtn, "px-1 font-medium", is() && "bg-accent")} onClick={() => setPick({})}>
                  All · {items.length}
                </button>
              </th>
              {BUCKETS.map((b) => (
                <th key={b.id} className="px-1 py-1">
                  <button
                    className={cn(
                      pickBtn,
                      "w-full px-1 font-semibold",
                      TONE[b.tone].text,
                      is(undefined, b.id) && "bg-accent",
                    )}
                    onClick={() => setPick({ bucket: b.id })}
                  >
                    {b.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t border-border/50">
                <th className="px-2 py-0.5 text-left font-normal">
                  <button
                    className={cn(pickBtn, "flex max-w-[180px] px-1 py-0.5", is(p.id) && "bg-accent")}
                    onClick={() => setPick({ project: p.id })}
                  >
                    <ProjectTag b={p} />
                  </button>
                </th>
                {BUCKETS.map((b) => {
                  const n = cell(p.id, b.id).length;
                  return (
                    <td key={b.id} className="p-0.5 text-center">
                      <button
                        disabled={n === 0}
                        aria-label={`${p.label} · ${b.label}: ${n}`}
                        onClick={() => setPick({ project: p.id, bucket: b.id })}
                        className={cn(
                          pickBtn,
                          "h-7 w-full min-w-10 font-mono tabular-nums disabled:cursor-default disabled:text-muted-foreground/40",
                          n > 0 && "font-semibold",
                          is(p.id, b.id) && "ring-2 ring-ring",
                        )}
                        style={
                          n > 0
                            ? {
                                background: `color-mix(in oklch, var(--status-${b.tone}) ${Math.min(10 + n * 12, 55)}%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {n || "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-[12px] border p-1.5">
        <h2 className="px-1.5 py-1 text-xs font-semibold text-muted-foreground">
          {[projects.find((p) => p.id === pick.project)?.label, BUCKETS.find((b) => b.id === pick.bucket)?.label]
            .filter(Boolean)
            .join(" · ") || "All threads"}{" "}
          · {shown.length}
        </h2>
        <ul className="m-0 list-none p-0">
          {shown.map(({ t, project }) => (
            <li
              key={t.id}
              className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[8px] px-1.5 py-0.5 text-[13px] hover:bg-accent/50"
            >
              <StatusIcon t={t} />
              <span className="w-[110px] flex-none truncate">
                <Phrase t={t} now={now} />
              </span>
              {!pick.project && (
                <span className="w-[110px] flex-none">
                  <ProjectTag b={project} />
                </span>
              )}
              {t.key && <KeyChip k={t.key} linear={linear} />}
              <Title t={t} className="flex-1 truncate max-[720px]:basis-full" />
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <Marks t={t} />
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {ago(t.updatedAt, now)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------- opus-4: tile wall ---------- */

/** Masonry of compact project tiles with a status strip; urgent threads show as rows, quiet ones fold into icons. */
function Wall({ projects, now, linear }: VariantProps) {
  const [open, setOpen] = useState(() => new Set<string>());
  const tiles = projects
    .map((p) => ({ p, items: flatten([p]).toSorted(byAttention) }))
    .toSorted((a, b) => rank(a.items[0]?.t.status ?? "idle") - rank(b.items[0]?.t.status ?? "idle"));
  return (
    <div className="columns-[300px] gap-3">
      {tiles.map(({ p, items }) => {
        const loud = items.filter((i) => rank(i.t.status) < 3);
        const quiet = items.filter((i) => rank(i.t.status) >= 3);
        const expanded = open.has(p.id);
        const top = bucketOf(items[0]?.t.status ?? "idle");
        return (
          <section
            key={p.id}
            className={cn(
              "mb-3 break-inside-avoid overflow-hidden rounded-[10px] border border-t-[3px] bg-card",
              TONE[top.tone].border,
            )}
          >
            <header className="flex items-center gap-2 px-2.5 pt-1.5">
              <span className="truncate text-sm font-semibold">{p.label}</span>
              <span className="ml-auto flex flex-none gap-1 font-mono text-[11px] tabular-nums">
                {BUCKETS.map((b) => {
                  const n = items.filter((i) => bucketOf(i.t.status) === b).length;
                  return n > 0 ? (
                    <span key={b.id} title={b.label} className={TONE[b.tone].text}>
                      {n}
                    </span>
                  ) : null;
                })}
              </span>
            </header>
            <div className="mx-2.5 mt-1 flex h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              {items.map(({ t }) => (
                <span
                  key={t.id}
                  className={cn("flex-1 border-r border-card last:border-0", TONE[bucketOf(t.status).tone].bar)}
                />
              ))}
            </div>
            <ul className="m-0 list-none px-1 py-1">
              {[...loud, ...(expanded ? quiet : [])].map(({ t, parent }) => (
                <li
                  key={t.id}
                  className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 text-[13px] leading-5 hover:bg-accent/50"
                >
                  {parent && <span className="text-muted-foreground">↳</span>}
                  <StatusIcon t={t} />
                  {t.key && <KeyChip k={t.key} linear={linear} />}
                  <Title t={t} className="flex-1 truncate" />
                  <span className={cn("flex-none text-[11px]", STATUS[t.status].text)}>{phraseWith(t, now)}</span>
                </li>
              ))}
            </ul>
            {quiet.length > 0 && (
              <button
                className="flex w-full cursor-pointer flex-wrap items-center gap-1 border-t px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent/50"
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  })
                }
              >
                {expanded ? "Hide" : `${quiet.length} working or quiet`}
                {!expanded && quiet.map(({ t }) => <StatusIcon key={t.id} t={t} />)}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export const variants: Variant[] = [
  { key: "opus-1", name: "Status lanes", Component: Lanes },
  { key: "opus-2", name: "Attention table", Component: Table },
  { key: "opus-3", name: "Project × status matrix", Component: Matrix },
  { key: "opus-4", name: "Tile wall", Component: Wall },
];
