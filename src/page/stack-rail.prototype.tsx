/**
 * PROTOTYPE: three variants of the PR stack rail, switchable via `?variant=A|B|C`, on the existing tree page.
 * Question: how should a stack collapse, and how should a line tie its PRs together?
 */
import { Layers } from "lucide-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { allThreads, type Branch, type PrNode } from "../shared/tree.ts";
import { Chevron, DragHandle, GroupRow, Icons, Sortable, ThreadRow, type Fold, type RefFn, type Sort } from "./app.tsx";
import { folded } from "./format.ts";
import { useVariant } from "./prototype-switcher.tsx";

export const STACK_VARIANTS = { A: "Fold the label row", B: "GitHub-style graph", C: "Metro header + numbered line" };

type Props = { run: Branch[]; sort?: Sort } & Fold;

export function StackRailPrototype(p: Props) {
  const v = useVariant(Object.keys(STACK_VARIANTS));
  if (v === "B") return <RailB {...p} />;
  if (v === "C") return <RailC {...p} />;
  return <RailA {...p} />;
}

const railId = (run: Branch[]) => `rail:${run[0].stack!.id}`;

/** The PR this group opened in the stack. */
const ownPr = (g: Branch): PrNode | undefined => allThreads(g).find((t) => t.stack?.pos)?.prs[0];

/** One color per PR: red when blocked, green when approved, grey when draft, blue otherwise. The -fg tokens keep 4.5:1 against `--background` text in both themes. */
const tone = (p?: PrNode) =>
  !p || p.draft
    ? "var(--muted-foreground)"
    : p.checks === "failing" || p.conflicting || p.review === "changes-requested"
      ? "var(--status-failed-fg)"
      : p.review === "approved"
        ? "var(--status-done-fg)"
        : "var(--status-working-fg)";

const Base = ({ base }: { base: string | null }) => (
  <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
    {base ?? "base"}
  </code>
);

/** A: today's rail, with the label row as a fold trigger. Closed shows one status icon per thread. */
function RailA({ run, closed, toggle, sort }: Props) {
  const { total, base } = run[0].stack!;
  const open = !closed.has(railId(run));
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(railId(run))}>
      <li ref={ref} className="stack-rail my-1">
        <div className="group/row flex min-h-7 flex-wrap items-center gap-x-1.5 rounded-[8px] px-2 text-xs text-muted-foreground hover:bg-accent">
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 select-none">
            <Chevron open={open} />
            <Layers className="size-3 flex-none" aria-hidden />
            <span>
              PR stack · {total} PRs
              {base && (
                <>
                  {" "}
                  · base <code className="font-mono">{base}</code>
                </>
              )}
            </span>
          </CollapsibleTrigger>
          {!open && (
            <span className="inline-flex items-center gap-2">
              {run.map((g) => (
                <Icons key={g.id} b={g} />
              ))}
            </span>
          )}
          <DragHandle handleRef={handleRef} name={`PR stack of ${run[0].label}`} className="ml-auto" />
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none p-0">
            {run.map((c) => (
              <GroupRow key={c.id} b={c} closed={closed} toggle={toggle} />
            ))}
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/**
 * The gutter of one graph row: a node at `y` and line segments above and below it.
 * `above`/`below` false leave that segment out.
 */
function Gutter({
  y,
  color,
  above,
  below,
  hollow,
  children,
}: {
  y: number;
  color: string;
  above: boolean;
  below: boolean;
  hollow?: boolean;
  children?: ReactNode;
}) {
  const line = `color-mix(in oklch, ${color} 45%, transparent)`;
  return (
    <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-0 w-5">
      {above && <span className="absolute left-[9px] w-0.5" style={{ top: 0, height: y, background: line }} />}
      {below && <span className="absolute bottom-0 left-[9px] w-0.5" style={{ top: y, background: line }} />}
      <span
        className={cn(
          "absolute flex -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-background",
          children ? "left-[1px] size-[18px]" : "left-[4px] size-3",
          hollow && "border-2 border-muted-foreground bg-card",
        )}
        style={{ top: y, background: hollow ? undefined : color }}
      >
        {children}
      </span>
    </span>
  );
}

/** B: like GitHub. Top PR first, a colored node per PR, one line down to the base. Closed shows the graph sideways. */
function RailB({ run, closed, toggle, sort }: Props) {
  const { total, base } = run[0].stack!;
  const open = !closed.has(railId(run));
  const top = [...run].reverse();
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(railId(run))}>
      <li ref={ref} className="my-1">
        <div className="group/row flex min-h-7 items-center gap-2 rounded-[8px] px-2 text-xs text-muted-foreground hover:bg-accent">
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 select-none">
            <Chevron open={open} />
            <span className="font-semibold underline underline-offset-2">Stack</span>
            <span>· {total} PRs</span>
          </CollapsibleTrigger>
          {!open && (
            <span className="inline-flex items-center">
              <Base base={base} />
              {run.map((g) => (
                <span key={g.id} className="inline-flex items-center" title={`#${ownPr(g)?.n} ${g.label}`}>
                  <span className="h-0.5 w-3" style={{ background: tone(ownPr(g)) }} />
                  <span className="size-2.5 rounded-full" style={{ background: tone(ownPr(g)) }} />
                </span>
              ))}
            </span>
          )}
          <DragHandle handleRef={handleRef} name={`PR stack of ${run[0].label}`} className="ml-auto" />
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none p-0">
            {top.map((g, i) => {
              const color = tone(ownPr(g));
              return (
                <li key={g.id} className="relative pl-5">
                  <Gutter y={folded(g) ? 18 : 14} color={color} above={i > 0} below />
                  <ul className="m-0 list-none p-0">
                    <GroupRow b={g} closed={closed} toggle={toggle} />
                  </ul>
                </li>
              );
            })}
            <li className="relative flex h-8 items-center pl-7">
              <Gutter y={16} color="var(--muted-foreground)" above below={false} hollow />
              <Base base={base} />
            </li>
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/**
 * C: the header is a metro line from the base to the top PR, always shown; each stop links to its PR.
 * The body is flat: one row per thread, numbered by stack position on a vertical line. No group headers.
 */
function RailC({ run, closed, toggle, sort }: Props) {
  const { base } = run[0].stack!;
  const open = !closed.has(railId(run));
  const rows = run.flatMap((g) => allThreads(g).map((t, i) => ({ g, t, first: i === 0 })));
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(railId(run))}>
      <li ref={ref} className="my-1 rounded-[10px] border border-dashed border-border">
        <div className="group/row flex min-h-8 flex-wrap items-center gap-2 px-2 text-xs">
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1 text-muted-foreground select-none">
            <Chevron open={open} />
            <Layers className="size-3.5" aria-hidden />
          </CollapsibleTrigger>
          <span className="inline-flex flex-wrap items-center gap-y-1">
            <Base base={base} />
            {run.map((g, i) => {
              const p = ownPr(g);
              return (
                <span key={g.id} className="inline-flex items-center">
                  <span className="h-0.5 w-4" style={{ background: tone(p) }} />
                  <a
                    href={p?.url}
                    target="_blank"
                    rel="noreferrer"
                    title={g.label}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[11px] hover:underline",
                      p?.draft && "border-dashed",
                    )}
                    style={{ borderColor: tone(p) }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: tone(p) }} />
                    {i + 1} · #{p?.n}
                  </a>
                </span>
              );
            })}
          </span>
          <DragHandle handleRef={handleRef} name={`PR stack of ${run[0].label}`} className="ml-auto" />
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none p-0 pb-1 pl-3">
            {rows.map(({ g, t, first }, i) => (
              <li key={t.id} className="relative pl-6">
                <Gutter
                  y={18}
                  color={tone(ownPr(g))}
                  above={i > 0}
                  below={i < rows.length - 1}
                  hollow={!first}
                >
                  {first && t.stack?.pos}
                </Gutter>
                <ul className="m-0 list-none p-0">
                  <ThreadRow t={t} chip={g.label} hideStack />
                </ul>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}
