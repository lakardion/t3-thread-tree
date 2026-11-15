import { Check, GitPullRequest, TriangleAlert, X } from "lucide-react";
/** Throwaway: compare a global queue, status lanes, and a project/status dispatch matrix. */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { allThreads, type ThreadNode, type PrNode } from "../../shared/tree.ts";
import { needsYou } from "../attention.ts";
import { ago, phraseWith, stripKey, linearHref } from "../format.ts";
import { StatusIcon, STATUS } from "../status-icon.tsx";
import type { Variant, VariantProps } from "./switcher.tsx";

type Entry = { t: ThreadNode; project: string; projectId: string };
const entries = (projects: VariantProps["projects"]): Entry[] =>
  projects.flatMap((p) => allThreads(p).map((t) => ({ t, project: p.label, projectId: p.id })));
const bucket = (t: ThreadNode) =>
  needsYou(t.status)
    ? 0
    : ["failed", "interrupted"].includes(t.status)
      ? 1
      : ["working", "starting", "waiting"].includes(t.status)
        ? 2
        : 3;
const groups = [
  {
    name: "Needs you",
    hint: "Decisions & handoffs",
    color: "text-status-needs-input-fg",
    border: "border-t-status-needs-input",
  },
  { name: "Stopped", hint: "Errors & interruptions", color: "text-status-failed-fg", border: "border-t-status-failed" },
  { name: "Running", hint: "Agents in progress", color: "text-status-working-fg", border: "border-t-status-working" },
  { name: "At rest", hint: "Done, idle & snoozed", color: "text-muted-foreground", border: "border-t-border" },
];
const ordered = (rows: Entry[]) =>
  rows.toSorted((a, b) => bucket(a.t) - bucket(b.t) || Date.parse(b.t.updatedAt) - Date.parse(a.t.updatedAt));

function Pr({ p }: { p: PrNode }) {
  return (
    <Badge
      variant="outline"
      asChild
      className={cn(
        "gap-1 px-1 py-0 font-mono text-[10px]",
        p.draft && "border-dashed",
        p.state === "merged" && "text-pr-merged",
      )}
    >
      <a
        href={p.url}
        title={`${p.title ?? `PR #${p.n}`} · ${p.state}${p.draft ? " · draft" : ""}${p.checks ? ` · checks ${p.checks}` : ""}${p.review ? ` · ${p.review}` : ""}${p.conflicting ? " · merge conflict" : ""}`}
      >
        <GitPullRequest className="size-2.5" />
        <span className={p.state === "closed" ? "line-through" : ""}>#{p.n}</span>
        {p.checks && (
          <span
            className={cn(
              "size-1.5 rounded-full",
              p.checks === "passing"
                ? "bg-status-done"
                : p.checks === "failing"
                  ? "bg-status-failed"
                  : "border border-status-needs-input",
            )}
          />
        )}
        {p.review === "approved" && <Check className="size-2.5 text-status-done" />}
        {p.review === "changes-requested" && <X className="size-2.5 text-status-failed" />}
        {p.conflicting && <TriangleAlert className="size-2.5 text-status-needs-input" />}
      </a>
    </Badge>
  );
}
function Marks({ t, linear }: { t: ThreadNode; linear: VariantProps["linear"] }) {
  const href = t.key && linearHref(t.key, linear);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {t.key &&
        (href ? (
          <a href={href} className="font-mono text-[10px] text-muted-foreground hover:underline">
            {t.key}
          </a>
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">{t.key}</span>
        ))}
      {t.prs.map((p) => (
        <Pr key={p.url} p={p} />
      ))}
      {t.stack && (
        <span className="text-[10px] text-muted-foreground" title="PR stack">
          stack {t.stack.pos ?? "–"}/{t.stack.total}
        </span>
      )}
    </span>
  );
}
function Title({ t }: { t: ThreadNode }) {
  return (
    <a href={t.href} className="min-w-0 text-xs leading-5 font-medium break-words hover:underline" title={t.title}>
      {t.key ? stripKey(t.title, t.key) : t.title || t.id}
    </a>
  );
}
function Detail({ t }: { t: ThreadNode }) {
  return (
    <details className="text-[11px] text-muted-foreground">
      <summary className="cursor-pointer py-1 hover:text-foreground">Context</summary>
      <div className="space-y-1 pb-2 break-words">
        {t.detail.request && <p>{t.detail.request}</p>}
        {t.detail.error && (
          <p className="text-status-failed-fg">
            {[t.detail.error.class, t.detail.error.code, t.detail.error.text].filter(Boolean).join(" · ")}
          </p>
        )}
        {t.detail.branch && <p className="font-mono">{t.detail.branch}</p>}
        {t.detail.model && (
          <p>
            {t.detail.model}
            {t.detail.planMode ? " · plan mode" : ""}
          </p>
        )}
        {t.detail.launchedBy && (
          <a href={t.detail.launchedBy.href} className="block hover:underline">
            From {t.detail.launchedBy.title}
          </a>
        )}
        <a href={t.href} className="underline">
          Open thread →
        </a>
      </div>
    </details>
  );
}

function Queue({ projects, now, linear }: VariantProps) {
  const [sort, setSort] = useState<"attention" | "recent">("attention");
  const rows = entries(projects);
  const sorted =
    sort === "attention"
      ? ordered(rows)
      : rows.toSorted((a, b) => Date.parse(b.t.updatedAt) - Date.parse(a.t.updatedAt));
  return (
    <section className="pb-20">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-semibold">
          All threads <span className="ml-1 font-mono text-muted-foreground">{rows.length}</span>
        </h2>
        <Button size="sm" variant={sort === "attention" ? "secondary" : "ghost"} onClick={() => setSort("attention")}>
          Attention first
        </Button>
        <Button size="sm" variant={sort === "recent" ? "secondary" : "ghost"} onClick={() => setSort("recent")}>
          Latest activity
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="hidden grid-cols-[140px_150px_minmax(0,1fr)_45px] gap-3 border-b bg-muted/50 px-3 py-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase md:grid">
          <span>State</span>
          <span>Project</span>
          <span>Thread / pull requests</span>
          <span>Updated</span>
        </div>
        {sorted.map(({ t, project, projectId }) => (
          <div
            key={`${projectId}:${t.id}`}
            className={cn(
              "grid grid-cols-[1fr_auto] items-start gap-x-3 border-b px-3 py-2 last:border-0 hover:bg-accent/40 md:grid-cols-[140px_150px_minmax(0,1fr)_45px]",
              needsYou(t.status) && "bg-status-needs-input/5",
            )}
          >
            <span className={cn("flex items-center gap-2 text-[11px]", STATUS[t.status].text)}>
              <StatusIcon t={t} />
              {phraseWith(t, now)}
            </span>
            <span className="truncate text-[11px] text-muted-foreground" title={project}>
              {project}
            </span>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <Title t={t} />
                <Marks t={t} linear={linear} />
              </div>
              <Detail t={t} />
            </div>
            <time
              className="hidden pt-0.5 text-right font-mono text-[10px] text-muted-foreground md:block"
              title={t.updatedAt}
            >
              {ago(t.updatedAt, now)}
            </time>
          </div>
        ))}
      </div>
    </section>
  );
}

function Lanes({ projects, now, linear }: VariantProps) {
  const rows = ordered(entries(projects));
  return (
    <section className="grid grid-cols-1 items-start gap-3 pb-20 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map((g, i) => (
        <div key={g.name} className={cn("min-w-0 rounded-lg border border-t-2 bg-muted/20", g.border)}>
          <div className="border-b px-3 py-3">
            <div className="flex items-center justify-between">
              <h2 className={cn("text-xs font-semibold", g.color)}>{g.name}</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {rows.filter((r) => bucket(r.t) === i).length}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{g.hint}</p>
          </div>
          <div className="space-y-2 p-2">
            {rows
              .filter((r) => bucket(r.t) === i)
              .map(({ t, project, projectId }) => (
                <article key={`${projectId}:${t.id}`} className="rounded-md border bg-card px-2.5 py-2 shadow-sm">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate font-medium">{project}</span>
                    <time className="shrink-0">{ago(t.updatedAt, now)}</time>
                  </div>
                  <Title t={t} />
                  <div className={cn("my-1 flex items-center gap-1.5 text-[11px]", STATUS[t.status].text)}>
                    <StatusIcon t={t} />
                    {phraseWith(t, now)}
                  </div>
                  <Marks t={t} linear={linear} />
                  <Detail t={t} />
                </article>
              ))}
            {!rows.some((r) => bucket(r.t) === i) && <p className="p-3 text-xs text-muted-foreground">No threads</p>}
          </div>
        </div>
      ))}
    </section>
  );
}

function Matrix({ projects, now, linear }: VariantProps) {
  const [selection, setSelection] = useState<{ project: string; group: number } | null>(null);
  const rows = entries(projects);
  const selected = selection && projects.some((p) => p.id === selection.project) ? selection : null;
  const visible = ordered(
    selected ? rows.filter((r) => r.projectId === selected.project && bucket(r.t) === selected.group) : rows,
  );
  return (
    <section className="grid items-start gap-4 pb-20 lg:grid-cols-[minmax(380px,0.9fr)_minmax(0,1.1fr)]">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[370px]">
          <div className="grid grid-cols-[minmax(130px,1fr)_repeat(4,55px)] items-center border-b bg-muted/40 px-3 py-3 text-[10px]">
            <span className="font-semibold">Project / state</span>
            {groups.map((g) => (
              <span key={g.name} className={cn("text-center", g.color)}>
                {g.name}
              </span>
            ))}
          </div>
          {projects.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[minmax(130px,1fr)_repeat(4,55px)] items-center gap-y-1 border-b px-3 py-2 last:border-0"
            >
              <div className="min-w-0 pr-2">
                <h3 className="truncate text-xs font-medium" title={p.label}>
                  {p.label}
                </h3>
                <p className="truncate text-[10px] text-muted-foreground">{allThreads(p).length} threads</p>
              </div>
              {groups.map((g, i) => {
                const count = allThreads(p).filter((t) => bucket(t) === i).length;
                const active = selected?.project === p.id && selected.group === i;
                return (
                  <button
                    key={g.name}
                    aria-label={`${p.label}: ${count} ${g.name}`}
                    aria-pressed={active}
                    onClick={() => setSelection(active ? null : { project: p.id, group: i })}
                    className={cn(
                      "mx-1 flex h-10 items-center justify-center rounded font-mono text-sm transition-colors hover:ring-1 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring",
                      count ? "bg-muted font-semibold" : "text-muted-foreground/40",
                      count > 0 && g.color,
                      active && "bg-accent ring-2 ring-ring",
                    )}
                  >
                    {count || "·"}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="border-t px-3 py-3 text-[11px] text-muted-foreground">
            Select a cell to inspect its threads. Select it again to show all.
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold">
            {selected
              ? `${projects.find((p) => p.id === selected.project)?.label} · ${groups[selected.group].name}`
              : "All projects"}{" "}
            <span className="text-muted-foreground">/ {visible.length}</span>
          </h2>
          {selected && (
            <Button size="sm" variant="ghost" onClick={() => setSelection(null)}>
              Show all
            </Button>
          )}
        </div>
        <div className="divide-y rounded-lg border bg-card">
          {visible.map(({ t, project, projectId }) => (
            <article key={`${projectId}:${t.id}`} className="px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="pt-1">
                  <StatusIcon t={t} />
                </span>
                <div className="min-w-0 flex-1">
                  <Title t={t} />
                  <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                    <span>{project}</span>
                    <span className={STATUS[t.status].text}>{phraseWith(t, now)}</span>
                    <span>updated {ago(t.updatedAt, now)}</span>
                  </div>
                  <Marks t={t} linear={linear} />
                  <Detail t={t} />
                </div>
              </div>
            </article>
          ))}
          {visible.length === 0 && <p className="p-5 text-xs text-muted-foreground">No threads in this cell.</p>}
        </div>
      </div>
    </section>
  );
}
export const variants: Variant[] = [
  { key: "gpt-1", name: "Global queue", Component: Queue },
  { key: "gpt-2", name: "Status lanes", Component: Lanes },
  { key: "gpt-3", name: "Dispatch matrix", Component: Matrix },
];
