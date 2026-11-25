import { Map as MapNode, X } from "lucide";
import { ChevronDown, ExternalLink, Map as MapIcon } from "lucide-react";
import { MorphIcon } from "morphicons/react";
import { useState, type ComponentType, type CSSProperties, type ReactNode, type Ref } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { flat, type Group, type Status, type ThreadNode } from "../shared/tree.ts";
import { postMapThread } from "./send.ts";
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
};

const FoldIcon = ({ open }: { open: boolean }) => (
  <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
);

const MAP_DOT =
  "absolute top-[18px] left-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 border-amber-500/60 bg-card";

/** The map icon of a marked map. It morphs to an X on hover and keyboard focus, and unmarks the thread on click. The tooltip shows an error. */
function UnmarkDot({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [hot, setHot] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Unmark map thread"
          disabled={busy}
          className={cn(
            MAP_DOT,
            "cursor-pointer pointer-coarse:min-h-11 pointer-coarse:min-w-11",
            err ? "border-destructive text-destructive" : MAP_TONE,
          )}
          onPointerEnter={() => setHot(true)}
          onPointerLeave={() => setHot(false)}
          onFocus={(e) => setHot(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setHot(false)}
          onClick={async () => {
            setBusy(true);
            setErr(undefined);
            const r = await postMapThread(id, false);
            setBusy(false);
            if (!r.ok) setErr(r.err.error);
          }}
        >
          <MorphIcon icon={hot ? X : MapNode} size={12} reducedMotion="user" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{err ?? "Unmark map thread"}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A Map group on its amber rail: the map thread row, or a Map header, then the members. `Row` renders a member, a
 * sub-map or a thread row; `Rail` renders consecutive members of one PR stack. `liRef`, `liClass`, `liStyle` and
 * `handle` come from the caller, which owns the drag and the row frame. In a status section, a row folds behind
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
}) {
  const [showOther, setShowOther] = useState(false);
  const info = t.map!;
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
    <span className="flex-none text-[11px] text-muted-foreground tabular-nums" title="Map members">
      {count}
    </span>
  );

  return (
    <li ref={liRef} className={cn("relative my-px list-none", liClass)} style={liStyle}>
      <div className="relative pl-7">
        {t.detail.mapMarked && !t.id.startsWith("map:") ? (
          <UnmarkDot id={t.id} />
        ) : (
          <span className={MAP_DOT}>
            <MapIcon className={cn("size-3", MAP_TONE)} aria-hidden />
          </span>
        )}
        {info.header ? (
          <div
            className="group/row relative flex h-9 min-w-0 items-center gap-2 rounded-[8px] px-2 text-xs hover:bg-accent"
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
              <MapIcon className={cn("size-3.5 flex-none", MAP_TONE)} aria-label="Map" />
              <span className="truncate font-semibold">{info.name}</span>
            </button>
            {countText}
            {info.href && (
              <a
                href={info.href}
                aria-label="Open map thread in T3"
                title="Open map thread in T3"
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
              end={
                <>
                  {countText}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5 flex-none rounded-[6px] text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    aria-label={open ? "Fold map" : "Unfold map"}
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
                <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-amber-500/40" />
              ) : (
                <span
                  aria-hidden
                  className="absolute top-0 left-0 h-[18px] w-2 rounded-bl-[8px] border-b-2 border-l-2 border-amber-500/40"
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
