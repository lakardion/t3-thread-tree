// Throwaway study of three map group layouts in the project tree. Enable with ?variant=A|B|C.
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Layers,
  Map as MapIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { Branch, PrNode, ThreadNode } from "../shared/tree.ts";

const looks = { A: "Branch tree", B: "Folder", C: "Waypoints" } as const;
const variants = ["A", "B", "C"] as const;
const mapStates = ["live", "settled", "none"] as const;
const stackLooks = ["badges", "nested", "inline"] as const;

type Variant = (typeof variants)[number];
type MapState = (typeof mapStates)[number];
type StackLook = (typeof stackLooks)[number];
type Row = ComponentType<{ t: ThreadNode; chip?: string; inStack?: boolean; nested?: boolean; corners?: string }>;
type Member = { thread: ThreadNode; map?: MapFixture };
type MapFixture = { name: string; head: ThreadNode; members: Member[] };

const search = () => location.search;
function subscribe(callback: () => void) {
  addEventListener("popstate", callback);
  return () => removeEventListener("popstate", callback);
}

function setParam(key: string, value: string) {
  const url = new URL(location.href);
  url.searchParams.set(key, value);
  history.replaceState(history.state, "", url);
  dispatchEvent(new PopStateEvent("popstate"));
}

function firstThread(branches: Branch[]): ThreadNode | undefined {
  for (const branch of branches) {
    const first = branch.threads[0] ?? firstThread(branch.branches);
    if (first) return first;
  }
}

function fixture(sample: ThreadNode): MapFixture {
  const now = Date.now();
  const phrases = { done: "Completed", "your-turn": "Your turn", working: "Working" } as const;
  const thread = (
    id: string,
    title: string,
    status: keyof typeof phrases,
    minutes: number,
    fields?: Partial<ThreadNode>,
  ): ThreadNode => {
    const updatedAt = new Date(now - minutes * 60_000).toISOString();
    return {
      ...sample,
      id: `proto-map-${id}`,
      href: `t3code://threads/demo/proto-map-${id}`,
      title,
      status,
      raw: status,
      phrase: phrases[status],
      updatedAt,
      since: updatedAt,
      lastRun: updatedAt,
      key: null,
      linear: null,
      settled: false,
      input: false,
      snoozedUntil: null,
      stack: null,
      prs: [],
      children: [],
      catchUp: undefined,
      suggestedReplies: undefined,
      t3Project: undefined,
      run: undefined,
      step: undefined,
      detail: {
        ...sample.detail,
        request: null,
        error: null,
        limitResetAt: null,
        autoResume: false,
        stopRequested: false,
        model: null,
        planMode: false,
        branch: null,
        worktreePath: null,
        launchedBy: null,
        origin: null,
        startedBy: null,
        createdAt: updatedAt,
        goal: null,
        tags: [],
        pinned: false,
      },
      ...fields,
    };
  };
  const pr = (n: number, title: string, draft: boolean): PrNode => ({
    n,
    title,
    draft,
    url: `#proto-pr-${n}`,
    state: "open",
    checks: draft ? "pending" : "passing",
    review: draft ? null : "review-required",
    conflicting: false,
    additions: null,
    deletions: null,
    changedFiles: null,
    labels: [],
  });
  const subMap: MapFixture = {
    name: "Flat view maps",
    head: thread("flat", "Wayfinder: Flat view maps", "working", 9),
    members: [
      { thread: thread("flat-sort", "TT-217 Preserve map order in flat view", "your-turn", 4, { key: "TT-217" }) },
    ],
  };
  return {
    name: "Map groups",
    head: thread("head", "Wayfinder: Map groups", "working", 23),
    members: [
      { thread: thread("shape", "TT-213 Define map membership", "done", 41, { key: "TT-213" }) },
      {
        thread: thread("rail", "TT-214 Render map rails", "your-turn", 12, {
          key: "TT-214",
          stack: { pos: 1, total: 2 },
          prs: [pr(391, "Render map rails", false)],
        }),
      },
      {
        thread: thread("colors", "Rail colors follow-up", "working", 6, {
          stack: { pos: 2, total: 2 },
          prs: [pr(392, "Rail colors follow-up", true)],
        }),
      },
      {
        thread: thread("dispatch", "Implement map groups", "working", 14, {
          children: [
            thread("settled", "Handle settled map heads", "done", 11),
            thread("docs", "Document map groups", "working", 3, {
              t3Project: { id: "thread-tree-docs", label: "thread-tree-docs" },
            }),
          ],
        }),
      },
      { thread: subMap.head, map: subMap },
    ],
  };
}

function memberCount(members: Member[]): number {
  return members.reduce(
    (total, { thread, map }) =>
      total + 1 + memberCount(map?.members ?? thread.children.map((child) => ({ thread: child }))),
    0,
  );
}

type Layout = { Row: Row; variant: Variant; stack: StackLook };

function MapGroup({
  map,
  state,
  layout,
  onDrag,
}: {
  map: MapFixture;
  state: MapState;
  layout: Layout;
  onDrag?: (active: boolean) => void;
}) {
  const { Row, variant, stack } = layout;
  const [open, setOpen] = useState(true);
  const block = useRef<HTMLLIElement>(null);
  const dragHandle = onDrag && (
    <span
      draggable
      title="Drag map group"
      className="flex size-5 flex-none cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
      onDragStart={(event) => {
        const group = block.current;
        if (!group) return;
        event.dataTransfer.setData("text/plain", map.head.id);
        event.dataTransfer.effectAllowed = "move";
        const rect = group.getBoundingClientRect();
        event.dataTransfer.setDragImage(group, event.clientX - rect.left, event.clientY - rect.top);
        onDrag(true);
      }}
      onDragEnd={() => onDrag(false)}
    >
      <GripVertical className="size-3.5" />
    </span>
  );
  return (
    <li
      ref={block}
      data-map-group={map.head.id}
      className={cn(
        "my-1 min-w-0",
        variant === "B" &&
          "overflow-hidden rounded-[10px] border border-l-[3px] border-border border-l-status-plan/45 bg-muted/25",
        variant === "C" && "rounded-[8px] border-y border-border",
      )}
    >
      <div
        className={cn(
          "flex min-h-9 min-w-0 items-center gap-1",
          variant === "B" && "bg-muted/65 px-1",
          variant === "C" && "relative gap-2 bg-muted/35 pl-7 [&>[draggable]]:absolute [&>[draggable]]:left-1",
        )}
      >
        {dragHandle}
        <button
          type="button"
          aria-label={`${open ? "Collapse" : "Expand"} ${map.name}`}
          aria-expanded={open}
          className={cn(
            "flex h-7 flex-none items-center justify-center gap-1 rounded text-status-plan hover:bg-accent",
            variant === "C" ? "w-10 bg-card ring-1 ring-border" : "w-9",
          )}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown
            className={cn("size-3 text-muted-foreground", !open && "-rotate-90", variant === "C" && "order-last")}
          />
          <MapIcon className="size-4" />
        </button>
        {state === "live" ? (
          <ul className="m-0 min-w-0 flex-1 list-none p-0">
            <Row t={map.head} nested />
          </ul>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 px-2 py-1">
            <span className="text-[13px] font-semibold">{map.name}</span>
            <span className="text-[11px] text-muted-foreground">{memberCount(map.members)} members</span>
            {state === "settled" && (
              <a
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                href={map.head.href}
              >
                Open map thread in T3 <ArrowUpRight aria-hidden className="size-3" />
              </a>
            )}
          </div>
        )}
      </div>
      {open && (
        <ul
          className={cn(
            "m-0 list-none",
            variant === "A" && "ml-9",
            variant === "B" && "border-t border-border bg-card py-1 pr-1 pl-5",
            variant === "C" && "pb-1",
          )}
        >
          {map.members.map((member, index) => {
            const stop = member.thread.stack?.pos;
            if (stack === "nested" && stop === 2) return null;
            return (
              <MemberSlot
                key={member.thread.id}
                variant={variant}
                last={index === map.members.length - 1}
                stop={stack === "inline" ? stop : undefined}
              >
                {member.map ? (
                  <ul className="m-0 list-none p-0">
                    <MapGroup map={member.map} state="live" layout={layout} />
                  </ul>
                ) : stack === "nested" && stop === 1 ? (
                  <NestedStack members={map.members.slice(index, index + 2)} Row={Row} />
                ) : (
                  <ul className="m-0 list-none p-0">
                    <Row
                      t={member.thread}
                      chip={member.thread.key ?? undefined}
                      inStack={stack === "inline" || !stop}
                      corners={
                        member.thread.children.length ? "[&>ul]:ml-4 [&>ul]:border-l [&>ul]:border-border" : undefined
                      }
                      nested
                    />
                  </ul>
                )}
              </MemberSlot>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function MemberSlot({
  variant,
  stop,
  last,
  children,
}: {
  variant: Variant;
  stop?: number | null;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "relative flow-root min-w-0",
        variant === "A" && "pl-5",
        variant === "B" && "pl-4 [&+li]:border-t [&+li]:border-border/60",
        variant === "C" && "pl-14",
      )}
    >
      {variant === "A" && (
        <span
          aria-hidden
          className={cn("absolute top-0 left-0 w-px bg-status-plan/35", last ? "h-[18px]" : "h-full")}
        />
      )}
      {variant === "A" && <span aria-hidden className="absolute top-[18px] left-0 h-px w-4 bg-status-plan/35" />}
      {variant === "C" && (
        <span
          aria-hidden
          className={cn("absolute top-0 left-[40px] w-px bg-status-plan/45", last ? "h-[18px]" : "h-full")}
        />
      )}
      {variant === "C" && !stop && (
        <span
          aria-hidden
          className="absolute top-[15px] left-[37px] size-[7px] rounded-full border border-status-plan/70 bg-card"
        />
      )}
      {variant === "B" && stop && (
        <span
          aria-hidden
          className={cn(
            "absolute left-[3px] w-px bg-status-plan/45",
            stop === 1 ? "top-[18px] bottom-0" : "top-0 h-[18px]",
          )}
        />
      )}
      {stop && (
        <span
          aria-label={`PR stack position ${stop} of 2`}
          className={cn(
            "absolute top-[10px] grid size-4 place-items-center rounded-full bg-status-plan text-[9px] font-bold text-background",
            variant === "A" && "-left-[7px]",
            variant === "B" && "-left-1",
            variant === "C" && "left-[33px]",
          )}
        >
          {stop}
        </span>
      )}
      {children}
    </li>
  );
}

function NestedStack({ members, Row }: { members: Member[]; Row: Row }) {
  return (
    <div className="my-1 rounded-[8px] border border-dashed border-border bg-card">
      <div className="flex min-h-7 items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Layers className="mr-1 size-3.5" aria-label="PR stack" />
        {members.map(({ thread }, index) => (
          <Fragment key={thread.id}>
            {index > 0 && <span aria-hidden className="h-px w-3 bg-border" />}
            <span
              className={cn("rounded-full border px-1.5 font-mono text-[11px]", thread.prs[0].draft && "border-dashed")}
            >
              {thread.stack?.pos}/{thread.stack?.total} · #{thread.prs[0].n}
            </span>
          </Fragment>
        ))}
      </div>
      <ul className="m-0 list-none py-0 pr-1 pl-2">
        {members.map(({ thread }, index) => (
          <MemberSlot key={thread.id} variant="A" stop={thread.stack?.pos} last={index === members.length - 1}>
            <ul className="m-0 list-none p-0">
              <Row t={thread} chip={thread.key ?? undefined} inStack />
            </ul>
          </MemberSlot>
        ))}
      </ul>
    </div>
  );
}

export function MapGroupPrototype({ Row, projects, children }: { Row: Row; projects: Branch[]; children: ReactNode }) {
  const params = new URLSearchParams(useSyncExternalStore(subscribe, search));
  const variant = variants.find((v) => v === params.get("variant"));
  const state = mapStates.find((v) => v === params.get("map")) ?? "live";
  const stack = stackLooks.find((v) => v === params.get("stack")) ?? "badges";
  const [dragging, setDragging] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const sample = firstThread(projects);

  const cycle = (step: number) => {
    if (variant) setParam("variant", variants[(variants.indexOf(variant) + step + variants.length) % variants.length]);
  };
  useEffect(() => {
    if (!variant) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      setParam("variant", variants[(variants.indexOf(variant) + offset + variants.length) % variants.length]);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [variant]);
  if (!sample || !variant) return children;

  const group = (
    <MapGroup key="map" map={fixture(sample)} state={state} layout={{ Row, variant, stack }} onDrag={setDragging} />
  );
  const dropTarget = dragging && (
    <li
      className="my-1 grid min-h-9 place-items-center rounded-md border border-dashed border-status-plan bg-card text-xs text-status-plan"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        setAtEnd(!atEnd);
        setDragging(false);
      }}
    >
      {atEnd ? "Move map above projects" : "Move map below projects"}
    </li>
  );
  return (
    <>
      {atEnd ? dropTarget : group}
      <Fragment key="projects">{children}</Fragment>
      {atEnd ? group : dropTarget}
      <li className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background shadow-lg">
        <button className="p-1" type="button" aria-label="Previous variant" onClick={() => cycle(-1)}>
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-semibold">
          {variant} · {looks[variant]}
        </span>
        <button className="p-1" type="button" aria-label="Next variant" onClick={() => cycle(1)}>
          <ChevronRight className="size-4" />
        </button>
        <select
          aria-label="Map state"
          className="rounded-full bg-background px-2 py-1 text-foreground"
          value={state}
          onChange={(e) => setParam("map", e.target.value)}
        >
          {mapStates.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="PR stack layout"
          className="rounded-full bg-background px-2 py-1 text-foreground"
          value={stack}
          onChange={(e) => setParam("stack", e.target.value)}
        >
          <option value="badges">Stack badges</option>
          <option value="nested">Nested rail</option>
          <option value="inline">Inline stops</option>
        </select>
      </li>
    </>
  );
}
