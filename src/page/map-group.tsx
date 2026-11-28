import { ChevronDown, ExternalLink, GitBranch, Map as MapIcon, Network } from "lucide-react";
import { useContext, useState, type ComponentType, type CSSProperties, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { flat, type Group, type Status, type ThreadNode } from "../shared/tree.ts";
import { lineageScope } from "./graph-scope.ts";
import { OpenGraph } from "./pr-graph.tsx";
import { folds } from "./view.ts";

const MAP_TONE = "text-amber-600 dark:text-amber-400";

type RowProps = {
  t: ThreadNode;
  chip?: string;
  block?: ThreadNode;
  nested?: boolean;
  project?: Group;
  corners?: string;
  end?: ReactNode;
  handle?: ReactNode;
  pin?: ReactNode;
};

const FoldIcon = ({ open }: { open: boolean }) => (
  <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
);

const MAP_DOT =
  "absolute top-[18px] left-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card";

/** The PR graph button of a group head. A group with no map key and no live PR has no button. */
function GraphButton({ t }: { t: ThreadNode }) {
  const open = useContext(OpenGraph);
  const scope = lineageScope(t);
  if (!scope) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative z-10 size-5 flex-none rounded-[6px] text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="PR graph"
          data-graph-for={t.id}
          onClick={() => open(scope)}
        >
          <GitBranch className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>PR graph</TooltipContent>
    </Tooltip>
  );
}

/**
 * A Lineage group: the root row, or a Lineage or Map header, then the members. A group with a map key gets the amber
 * look, any other group the neutral look. `Row` renders a member, a sub-map or a thread row; `Rail` renders consecutive members of one PR stack. `liRef`, `liClass`, `liStyle` and
 * `handle` and `pin` come from the caller, which owns the drag and the row frame. In a status section, a row folds behind
 * "+N other threads" when it and its subthreads are context rows.
 */
export function MapGroup({
  t,
  chip,
  tip,
  project,
  open,
  toggle,
  section,
  Row,
  Rail,
  liRef,
  liClass,
  liStyle,
  handle,
  pin,
}: {
  t: ThreadNode;
  chip?: string;
  /** The hover of the Map header, which shows no age. */
  tip?: string;
  /** The project column of the map thread row; the caller draws the project border. */
  project?: Group;
  open: boolean;
  toggle: () => void;
  section: Status[] | null;
  Row: ComponentType<RowProps>;
  Rail: ComponentType<{ run: Group[] }>;
  liRef: Ref<HTMLLIElement>;
  liClass?: string;
  liStyle?: CSSProperties;
  handle?: ReactNode;
  /** The Pin button of the group. */
  pin?: ReactNode;
}) {
  const [showOther, setShowOther] = useState(false);
  const info = t.map!;
  const isMap = !!info.key;
  const Icon = isMap ? MapIcon : Network;
  const tone = isMap ? MAP_TONE : "text-muted-foreground";
  const iconLabel = isMap ? "Map" : "Lineage group";
  const link = info.root ? "Open root thread in T3" : "Open map thread in T3";
  const count = t.children.flatMap(flat).length;
  const entries = t.children.reduce<ThreadNode[][]>((out, c) => {
    const last = out.at(-1);
    if (c.rail && last?.[0].rail?.id === c.rail.id) last.push(c);
    else out.push([c]);
    return out;
  }, []);
  const hidden = section ? entries.filter((e) => e.every((c) => folds(c, section))) : [];
  const shown = showOther ? entries : entries.filter((e) => !hidden.includes(e));
  const hiddenRows = hidden.flat().length;
  const items = [
    ...shown.map((e) =>
      e.length > 1 ? (
        <Rail
          key={e[0].id}
          run={e.map((c) => ({
            id: `${t.id}:${c.id}`,
            label: c.key ?? c.title,
            kind: "stack",
            stack: c.rail,
            groups: [],
            threads: [c],
          }))}
        />
      ) : (
        <Row key={e[0].id} t={e[0]} nested />
      ),
    ),
    ...(hidden.length > 0
      ? [
          <li key="other" className="list-none">
            <button
              type="button"
              className="rounded-full border border-dashed px-2 py-px text-[11px] text-muted-foreground hover:text-foreground max-[720px]:min-h-11"
              aria-expanded={showOther}
              onClick={() => setShowOther(!showOther)}
            >
              {showOther ? "Hide " : "+"}
              {hiddenRows} other {hiddenRows === 1 ? "thread" : "threads"}
            </button>
          </li>,
        ]
      : []),
  ];
  const countText = (
    <span className="flex-none text-[11px] text-muted-foreground tabular-nums" title="Members">
      {count}
    </span>
  );

  return (
    <li ref={liRef} className={cn("relative my-px list-none", liClass)} style={liStyle}>
      <div className="relative pl-7">
        <span className={cn(MAP_DOT, isMap ? "border-amber-500/60" : "border-border")}>
          <Icon className={cn("size-3", tone)} aria-hidden />
        </span>
        {info.header ? (
          <div
            className="group/row map-head relative flex h-9 min-w-0 items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-accent"
            title={tip}
          >
            {handle}
            <button
              type="button"
              data-stop={t.id}
              aria-expanded={open}
              onClick={toggle}
              className="flex min-w-0 items-center gap-2 text-left select-none after:absolute after:inset-0 max-[720px]:min-h-11"
            >
              <FoldIcon open={open} />
              <Icon className={cn("size-3.5 flex-none", tone)} aria-label={iconLabel} />
              <span className="truncate font-semibold">{info.name}</span>
            </button>
            {lineageScope(t) && (
              <span
                aria-hidden
                data-hint="row"
                className="key-hint -top-3 right-8 items-center gap-1 rounded-md border bg-popover px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm"
              >
                <Kbd>g</Kbd> Graph
              </span>
            )}
            {countText}
            <GraphButton t={t} />
            {pin}
            {info.href && (
              <a
                href={info.href}
                aria-label={link}
                title={link}
                className="relative z-10 flex-none text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
        ) : (
          <ul className="m-0 min-w-0 list-none p-0">
            <Row
              t={{ ...t, children: [], map: undefined }}
              block={t}
              chip={chip}
              project={project}
              corners="border-l-0 pl-0"
              nested
              handle={handle}
              pin={pin}
              end={
                <>
                  {countText}
                  <GraphButton t={t} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 flex-none rounded-[6px] text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    aria-label={open ? "Fold group" : "Unfold group"}
                    aria-expanded={open}
                    data-fold
                    data-stop={`fold:${t.id}`}
                    onClick={toggle}
                  >
                    <FoldIcon open={open} />
                  </Button>
                </>
              }
            />
          </ul>
        )}
      </div>
      {open && items.length > 0 && (
        <ul className="m-0 ml-[13px] list-none p-0">
          {items.map((el, i) => (
            <li key={el.key} className="relative list-none pl-3">
              {i < items.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0 w-0.5",
                    isMap ? "bg-amber-500/40" : "bg-muted-foreground/40",
                  )}
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 left-0 h-[18px] w-2 rounded-bl-[8px] border-b-2 border-l-2",
                    isMap ? "border-amber-500/40" : "border-muted-foreground/40",
                  )}
                />
              )}
              <ul className="m-0 flex list-none flex-col p-0">{el}</ul>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
