import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import {
  Accessibility,
  type defaultPreset,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Draggable,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ChevronsDownUp, ChevronsUpDown } from "lucide";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleArrowUp,
  Contrast,
  ExternalLink,
  Eye,
  GripVertical,
  Info,
  Layers,
  List,
  ListTree,
  LoaderCircle,
  Moon,
  Rows3,
  Send,
  SlidersHorizontal,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { MorphIcon } from "morphicons/react";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BriefState, Cli } from "../shared/brief.ts";
import type { UpdateState } from "../shared/desktop.ts";
import type { CliStatus } from "../shared/send.ts";
import {
  allThreads,
  parseLinear,
  REVIEWS,
  type Branch,
  type PrNode,
  type ThreadNode,
  type Tree,
} from "../shared/tree.ts";
import {
  countAttention,
  needsYou,
  needsYouThreads,
  notifyEvents,
  onlyNeedsYou,
  type Statuses,
  waits,
} from "./attention.ts";
import { BriefControls, BriefPanel, type Offered } from "./brief.tsx";
import {
  ago,
  folded,
  foldIds,
  groupIds,
  isKeyGroup,
  linearHref,
  ownPr,
  prTone,
  stackRuns,
  stripKey,
} from "./format.ts";
import {
  PROJECTS,
  arrange,
  isPinned,
  parseOrders,
  prune,
  groupsKey,
  reorder,
  runUnitId,
  threadUnitId,
  threadsKey,
  type Arranged,
  type Freeze,
  type Orders,
} from "./order.ts";
import { Presence, useMotion } from "./presence.tsx";
import { ProjectIcon, projectHex } from "./project-icon.tsx";
import { CliGate, SendDialog } from "./send-dialog.tsx";
import { LEGEND, LegendIcon, STATUS, StatusIcon } from "./status-icon.tsx";
import { Swap, useChanges } from "./swap.tsx";
import {
  flatten,
  itemIds,
  sequence,
  sortFlat,
  sortTree,
  vtName,
  type FlatItem,
  type GroupBy,
  type Layout,
  type SortBy,
} from "./view.ts";

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only";
const CLOSED_KEY = "thread-tree:closed";
const SETTLED_KEY = "thread-tree:settled";
const FILTER_KEY = "thread-tree:filter";
const THEME_KEY = "thread-tree:theme";
const CLI_KEY = "thread-tree:cli";
const ORDER_KEY = "thread-tree:order";
const LINEAR_KEY = "thread-tree:linear";
const SORT_KEY = "thread-tree:sort";
const LAYOUT_KEY = "thread-tree:layout";
const GROUP_KEY = "thread-tree:group";
const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** Sends the token to the server, which saves it and reconnects to T3. */
function TokenForm() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Save failed (${res.status})`);
      setValue("");
      setMessage({ text: "Saved. Reconnecting to T3…", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    setSaving(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex gap-2">
        <Input
          type="password"
          aria-label="T3 token"
          placeholder="Paste a token"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={!value || saving}>
          Save
        </Button>
      </div>
      {message && <p className={cn("mt-1 text-xs", message.error && "text-destructive")}>{message.text}</p>}
    </form>
  );
}

const HINT = "text-xs text-muted-foreground";

type LinearProps = { linear: Tree["linear"]; setLinear: (workspace: string, teams: string) => void };

/** Mounts with the panel, so the fields start from the current setting each time it opens. */
function LinearForm({ linear, setLinear }: LinearProps) {
  const [workspace, setWorkspace] = useState(linear?.workspace ?? "");
  const [teams, setTeams] = useState(linear?.teams.join(", ") ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setLinear(workspace, teams);
        setSaved(true);
      }}
    >
      <p className={HINT}>Issue keys in thread titles, like ENG-123, link to their Linear issue.</p>
      <div className="grid gap-1.5">
        <Label htmlFor="linear-workspace">Workspace</Label>
        <Input
          id="linear-workspace"
          placeholder="acme"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
        />
        <p className={HINT}>
          The name after <code>linear.app/</code> in any Linear URL. You can paste the URL. Empty turns the links off.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="linear-teams">Team keys (optional)</Label>
        <Input id="linear-teams" placeholder="ENG, OPS" value={teams} onChange={(e) => setTeams(e.target.value)} />
        <p className={HINT}>
          The prefix of an issue key: ENG in ENG-123. Separate keys with commas. Empty: every issue key links.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        {saved && <span className={HINT}>Saved.</span>}
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}

/** One labelled group: a title outside a card of rows. */
const Group = ({ title, children, accent }: { title: string; children: ReactNode; accent?: boolean }) => (
  <section className="grid gap-1.5">
    <h3 className="m-0 px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
    <div className={cn("divide-y rounded-lg border bg-background", accent && "border-l-[3px] border-l-primary")}>
      {children}
    </div>
  </section>
);

/** Label and hint at the left, control at the right. */
const Row = ({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}) => (
  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
    <div className="grid min-w-0 gap-0.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-normal">
        {label}
      </Label>
      {hint && <div className={HINT}>{hint}</div>}
    </div>
    {children}
  </div>
);

type Tone = "ok" | "warn" | "info";
const TONE: Record<Tone, { cls: string; Icon: typeof Info | null }> = {
  ok: { cls: "text-status-done-fg", Icon: null },
  warn: { cls: "text-status-needs-input-fg", Icon: TriangleAlert },
  info: { cls: "text-status-working-fg", Icon: Info },
};

/** A row that folds open, with its current value at the right. */
const Fold = ({
  label,
  value,
  tone,
  defaultOpen,
  children,
}: {
  label: string;
  value: ReactNode;
  tone: Tone;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const { cls, Icon } = TONE[tone];
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="text-[13px]">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 text-xs", cls)}>
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {value}
          </span>
          <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
};

/** Light, system, dark: icons only, so the three parts are the same width. */
const THEME_ICONS: [Theme, string, typeof Sun][] = [
  ["light", "Light", Sun],
  ["system", "System", Contrast],
  ["dark", "Dark", Moon],
];
const ThemeToggle = ({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) => (
  <ToggleGroup
    type="single"
    size="sm"
    variant="outline"
    aria-label="Theme"
    value={theme}
    onValueChange={(v) => v && setTheme(v as Theme)}
  >
    {THEME_ICONS.map(([t, name, Icon]) => (
      <ToggleGroupItem key={t} value={t} aria-label={name} className={cn(FILTER_ITEM, "w-9 px-0")}>
        {/** The tooltip sits inside: as the trigger it would replace the item's `data-state="on"`. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-full items-center justify-center">
              <Icon />
            </span>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const SORTS: [SortBy, string][] = [
  ["manual", "Manual"],
  ["updated", "Last updated"],
];
const SortMenu = ({ sortBy, setSortBy }: { sortBy: SortBy; setSortBy: (s: SortBy) => void }) => (
  <DropdownMenu modal={false}>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Sort">
            <ArrowDownUp />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>Sort: {SORTS.find(([s]) => s === sortBy)?.[1]}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="min-w-40">
      <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
        {SORTS.map(([s, name]) => (
          <DropdownMenuRadioItem key={s} value={s}>
            {name}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

const LAYOUTS: [Layout, string, typeof List][] = [
  ["tree", "Tree", ListTree],
  ["flat", "Flat", List],
];
const LayoutToggle = ({ layout, setLayout }: { layout: Layout; setLayout: (l: Layout) => void }) => (
  <ToggleGroup
    type="single"
    size="sm"
    variant="outline"
    aria-label="Layout"
    value={layout}
    onValueChange={(v) => v && setLayout(v as Layout)}
  >
    {LAYOUTS.map(([l, name, Icon]) => (
      <ToggleGroupItem key={l} value={l} aria-label={name} className={cn(FILTER_ITEM, "w-9 px-0")}>
        {/** The tooltip sits inside: as the trigger it would replace the item's `data-state="on"`. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-full items-center justify-center">
              <Icon />
            </span>
          </TooltipTrigger>
          <TooltipContent>{name}</TooltipContent>
        </Tooltip>
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

const GROUPS: [GroupBy, string][] = [
  ["none", "None"],
  ["status", "Status"],
];
const GroupMenu = ({ groupBy, setGroupBy }: { groupBy: GroupBy; setGroupBy: (g: GroupBy) => void }) => (
  <DropdownMenu modal={false}>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Group by">
            <Rows3 />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>Group by: {GROUPS.find(([g]) => g === groupBy)?.[1]}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="min-w-40">
      <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        {GROUPS.map(([g, name]) => (
          <DropdownMenuRadioItem key={g} value={g}>
            {name}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Follows the update state of the main process. Undefined in the browser. */
function useUpdate(): UpdateState | undefined {
  const [state, setState] = useState<UpdateState>();
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const off = bridge.onUpdateState(setState);
    void bridge.updateState().then((s) => setState((current) => current ?? s));
    return off;
  }, []);
  return state;
}

/** Circumference of the r=6 ring. */
const RING = 2 * Math.PI * 6;

/** The View button. An update shows as a dot, and a running install as a progress ring in place of the icon. */
function ViewButton({ update, open, toggle }: { update: UpdateState | undefined; open: boolean; toggle: () => void }) {
  const install = update?.install ?? null;
  const running = install !== null && install.stage !== "failed";
  const spinning = install?.stage === "unpacking" || (install?.stage === "downloading" && install.progress === null);
  const filled = install?.stage === "downloading" && install.progress !== null ? install.progress : spinning ? 0.25 : 1;
  const note =
    install?.stage === "downloading"
      ? `downloading update${install.progress === null ? "" : ` ${Math.round(install.progress * 100)}%`}`
      : install?.stage === "unpacking"
        ? "unpacking update"
        : install?.stage === "restarting"
          ? "restarting"
          : install?.stage === "failed"
            ? "update failed"
            : update?.release
              ? "update available"
              : null;
  const dot = install?.stage === "failed" ? "bg-destructive" : !install && update?.release ? "bg-primary" : null;
  return (
    <Button
      variant={open ? "secondary" : "ghost"}
      size="sm"
      aria-expanded={open}
      aria-label={note ? `View and settings, ${note}` : "View and settings"}
      onClick={toggle}
    >
      {running ? (
        <svg
          viewBox="0 0 16 16"
          className={cn("size-4 -rotate-90", spinning && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        >
          <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-muted-foreground/25" />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - filled)}
            className="stroke-primary transition-[stroke-dashoffset] duration-150"
          />
        </svg>
      ) : (
        <span className="relative inline-flex">
          <SlidersHorizontal />
          {dot && (
            <span className={cn("absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-background", dot)} />
          )}
        </span>
      )}
      View
    </Button>
  );
}

/** The version row, with the update state as its hint, and a bar while an install runs. */
function UpdateRows({ update }: { update: UpdateState }) {
  const { release, install, checking, checkedAt, checkFailed } = update;
  const bridge = window.desktopBridge;
  const recheck = (label: string, variant: "ghost" | "outline") => (
    <Button variant={variant} size="sm" disabled={checking} onClick={() => bridge?.checkUpdates(true)}>
      {label}
    </Button>
  );
  const releasePage = (
    <Button variant="outline" size="sm" onClick={() => bridge?.openRelease()}>
      <ExternalLink /> Open release page
    </Button>
  );
  const next = release?.version;
  let line: ReactNode;
  let action: ReactNode = null;
  let bar: number | null | undefined;
  if (install?.stage === "downloading") {
    const percent = install.progress === null ? null : Math.round(install.progress * 100);
    line = percent === null ? `Downloading ${next}…` : `Downloading ${next}… ${percent}%`;
    bar = percent;
  } else if (install?.stage === "unpacking") {
    line = `Unpacking ${next}… Keep the app open.`;
    bar = null;
  } else if (install?.stage === "restarting") {
    line = `Restarting into ${next}…`;
    bar = 100;
  } else if (install?.stage === "failed") {
    line = <span className="text-destructive">Cannot install the update: {install.error}</span>;
    action = (
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => bridge?.installUpdate()}>
          Try again
        </Button>
        {releasePage}
      </div>
    );
  } else if (release) {
    line = `Version ${next} is available`;
    action = release.canInstall ? (
      <Button size="sm" onClick={() => bridge?.installUpdate()}>
        <CircleArrowUp /> Update and restart
      </Button>
    ) : (
      releasePage
    );
  } else if (checking || (checkedAt === null && !checkFailed)) {
    line = (
      <span className="inline-flex items-center gap-1.5">
        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> Checking for updates…
      </span>
    );
    action = recheck("Check again", "ghost");
  } else if (checkFailed) {
    line = <span className="text-destructive">Cannot check for updates.</span>;
    action = recheck("Try again", "outline");
  } else {
    line = `Up to date · checked ${hhmm(checkedAt!)}`;
    action = recheck("Check again", "ghost");
  }
  return (
    <>
      <Row
        label={
          <>
            Version <span className="font-mono text-xs">{update.version}</span>
          </>
        }
        hint={<span aria-live="polite">{line}</span>}
      >
        {action}
      </Row>
      {bar !== undefined && (
        <div className="px-3 pb-3">
          <Progress value={bar} aria-label="Update progress" />
        </div>
      )}
    </>
  );
}

const tokenSummary = (conn: Tree["conn"] | undefined) =>
  conn === "no-token" ? "Not set" : conn === "unauthorized" ? "Rejected" : "Connected";
const linearSummary = (l: Tree["linear"]) =>
  l ? [l.workspace, l.teams.join(", ")].filter(Boolean).join(" · ") : "Not set";

type PanelProps = LinearProps & {
  close: () => void;
  settled: boolean;
  setSettled: (v: boolean) => void;
  canReset: boolean;
  resetOrder: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  update: UpdateState | undefined;
  conn: Tree["conn"] | undefined;
  /** Opens the T3 token fold. */
  tokenOpen: boolean;
};

/** View options and settings, beside the list so a change shows at once. */
function SettingsPanel(p: PanelProps) {
  const { close } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [close]);
  useEffect(() => window.desktopBridge?.checkUpdates(false), []);
  const token = tokenSummary(p.conn);
  return (
    <aside
      aria-label="View and settings"
      className="fixed top-0 right-0 z-40 flex h-full w-[380px] max-w-full flex-col overflow-y-auto border-l bg-card shadow-xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
        <h2 className="m-0 text-[15px] font-semibold">View and settings</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={close}>
          <X />
        </Button>
      </div>
      <div className="grid content-start gap-4 p-4">
        {p.update && (
          <Group title="Updates" accent={p.update.release !== null && p.update.install === null}>
            <UpdateRows update={p.update} />
          </Group>
        )}
        <Group title="View">
          <Row label="Show settled threads" htmlFor="settled">
            <Switch id="settled" checked={p.settled} onCheckedChange={p.setSettled} />
          </Row>
          <Row label="Drag-and-drop order">
            <Button variant="outline" size="sm" disabled={!p.canReset} onClick={p.resetOrder}>
              Reset
            </Button>
          </Row>
          <Row label="Theme">
            <ThemeToggle theme={p.theme} setTheme={p.setTheme} />
          </Row>
        </Group>
        <Group title="Setup">
          <Fold label="T3 token" value={token} tone={token === "Connected" ? "ok" : "warn"} defaultOpen={p.tokenOpen}>
            <div className="grid gap-2">
              <p className={cn(HINT, "m-0")}>
                The app reads your threads from T3 with this token. Run this command in a terminal to issue one, then
                paste it below. Paste a new one at any time to replace it.
              </p>
              <code className="rounded-[6px] bg-muted p-2 text-xs break-all select-all">{TOKEN_CMD}</code>
              <TokenForm />
            </div>
          </Fold>
          <Fold label="Linear links" value={linearSummary(p.linear)} tone={p.linear ? "ok" : "warn"}>
            <LinearForm linear={p.linear} setLinear={p.setLinear} />
          </Fold>
          <Fold label="Status icons" value={<span className="sr-only">Legend</span>} tone="info">
            <Legend />
          </Fold>
        </Group>
      </div>
    </aside>
  );
}

const load = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const forget = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {}
};

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const until = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

const Now = createContext(Date.now());
const Details = createContext<{ open: Set<string>; toggle: (id: string) => void; show: (id: string) => void }>({
  open: new Set(),
  toggle: () => {},
  show: () => {},
});
/** Opens the send dialog for a thread. Null where rows cannot send. */
const SendTo = createContext<{ t3cli: CliStatus | null; open: (id: string) => void } | null>(null);
const NeedsOnly = createContext(false);
const Linear = createContext<Tree["linear"]>(null);
/** The rendered ids of each list, by list key. */
const Lists = createContext(new Map<string, string[]>());
/** No list, so no row is sortable. */
const NO_LISTS = new Map<string, string[]>();

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
const ROW_BUTTON =
  "size-5 rounded-[6px] text-muted-foreground motion-reduce:transition-none pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const SEND_REVEAL =
  "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100";
const FILTER_ITEM =
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const Mark = ({ title, children }: { title: string; children: ReactNode }) => (
  <span title={title} className="flex [&>svg]:size-3">
    {children}
  </span>
);

type RefFn = (el: Element | null) => void;
type Sort = { id: string; list: string; index: number; name: string };

/** A unit gets sort props only when its list has two or more units and it is in the list. */
const sortOf = (lists: Map<string, string[]>, list: string, id: string, name: string): Sort | undefined => {
  const ids = lists.get(list);
  const index = ids?.indexOf(id) ?? -1;
  return ids && ids.length > 1 && index >= 0 ? { id, list, index, name } : undefined;
};

type Detector = NonNullable<Parameters<typeof useSortable>[0]["collisionDetector"]>;
/** How far, in px, the leading edge of the dragged row must enter a row before that row moves. */
const SWAP_AT = 12;

/**
 * A row moves as soon as the leading edge of the dragged row enters it by `SWAP_AT` (or half its height),
 * so a tall row moves as early as a short one. A row behind the dragged center never collides, so a swap
 * does not bounce back.
 */
const leadingEdge: Detector = ({ dragOperation, droppable }) => {
  const dir = dragOperation.position.direction;
  const drag = dragOperation.shape?.current.boundingRectangle;
  const rect = droppable.shape?.boundingRectangle;
  if (!drag || !rect || (dir !== "down" && dir !== "up")) return null;
  const mid = drag.top + drag.height / 2;
  const enter = Math.min(SWAP_AT, rect.height / 2);
  const depth = dir === "down" ? drag.bottom - (rect.top + enter) : rect.bottom - enter - drag.top;
  const ahead = dir === "down" ? rect.top + rect.height / 2 > mid : rect.top + rect.height / 2 < mid;
  if (!ahead || depth < 0) return null;
  return {
    id: droppable.id,
    value: 1 / (1 + depth),
    type: CollisionType.Collision,
    priority: CollisionPriority.Normal,
  };
};

function SortHook({ sort, children }: { sort: Sort; children: (ref: RefFn, handleRef: RefFn) => ReactNode }) {
  const motion = useMotion();
  const { ref, handleRef } = useSortable({
    id: sort.id,
    index: sort.index,
    group: sort.list,
    type: sort.list,
    accept: sort.list,
    data: { name: sort.name },
    collisionDetector: leadingEdge,
  });
  const both = useCallback<RefFn>(
    (el) => {
      ref(el);
      motion(el);
    },
    [ref, motion],
  );
  return children(both, handleRef);
}

function MotionHook({ children }: { children: (ref: RefFn) => ReactNode }) {
  return children(useMotion());
}

/** Renders `children` with the sort refs of `sort`, or with only the motion ref when `sort` is unset. */
const Sortable = ({ sort, children }: { sort?: Sort; children: (ref: RefFn, handleRef?: RefFn) => ReactNode }) =>
  sort ? <SortHook sort={sort}>{children}</SortHook> : <MotionHook>{children}</MotionHook>;

const DragHandle = ({ handleRef, name, className }: { handleRef?: RefFn; name: string; className?: string }) =>
  !handleRef ? (
    <span aria-hidden className="size-5 flex-none pointer-coarse:min-h-11 pointer-coarse:min-w-11" />
  ) : (
    <Button
      ref={handleRef}
      variant="ghost"
      size="icon"
      aria-label={`Move ${name}`}
      className={cn(
        ROW_BUTTON,
        "cursor-grab opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
        className,
      )}
    >
      <GripVertical className="size-3.5" />
    </Button>
  );

function PrChip({ p }: { p: PrNode }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP,
        "font-mono focus-visible:ring-0",
        p.draft && "border-dashed",
        "duration-300 motion-reduce:transition-none",
        p.state === "merged" && "text-pr-merged",
      )}
      asChild
    >
      <a href={p.url} target="_blank" rel="noreferrer" title={p.draft ? `${p.state} · draft` : p.state}>
        <Swap k={`${p.state}|${p.draft}`}>
          <span className={cn(p.state === "closed" && "line-through")}>#{p.n}</span>
        </Swap>
        <Swap k={p.checks ?? ""}>
          {p.checks === "passing" && (
            <Mark title="Checks passing">
              <span className="size-1.5 rounded-full bg-status-done" />
            </Mark>
          )}
          {p.checks === "failing" && (
            <Mark title="Checks failing">
              <span className="size-1.5 rounded-full bg-status-failed" />
            </Mark>
          )}
          {p.checks === "pending" && (
            <Mark title="Checks pending">
              <span className="size-1.5 rounded-full border border-status-needs-input" />
            </Mark>
          )}
        </Swap>
        <Swap k={p.review ?? ""}>
          {p.review === "approved" && (
            <Mark title="Approved">
              <Check className="text-status-done" />
            </Mark>
          )}
          {p.review === "changes-requested" && (
            <Mark title="Changes requested">
              <X className="text-status-failed" />
            </Mark>
          )}
        </Swap>
        <Swap k={p.conflicting ? "1" : ""}>
          {p.conflicting && (
            <Mark title="Merge conflict">
              <TriangleAlert className="text-status-needs-input" />
            </Mark>
          )}
        </Swap>
      </a>
    </Badge>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  );
}

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono">{children}</span>;

function DetailBlock({ t }: { t: ThreadNode }) {
  const now = useContext(Now);
  const d = t.detail;
  const limit = [d.limitResetAt && `resets ${hhmm(d.limitResetAt)}`, d.autoResume && "auto-resume"]
    .filter(Boolean)
    .join(" · ");
  const tags = [d.tags.join(", "), d.pinned && "Pinned"].filter(Boolean).join(" · ");
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-1 pl-[178px] text-xs max-[720px]:pl-7">
      {d.request && <Line label="Request">{d.request}</Line>}
      {d.error && (
        <Line label="Error">
          {[[d.error.class, d.error.code].filter(Boolean).join(" · "), d.error.text].filter(Boolean).join(" ")}
        </Line>
      )}
      {limit && <Line label="Limit">{limit}</Line>}
      {d.stopRequested && <Line label="Run">Stop requested</Line>}
      {(d.model || d.planMode) && (
        <Line label="Model">
          {d.model && <Mono>{d.model}</Mono>}
          {d.model && d.planMode && " · "}
          {d.planMode && "plan mode"}
        </Line>
      )}
      {d.branch && (
        <Line label="Branch">
          <Mono>{d.branch}</Mono>
        </Line>
      )}
      {d.worktreePath && (
        <Line label="Worktree">
          <Mono>{d.worktreePath}</Mono>
        </Line>
      )}
      {d.launchedBy && (
        <Line label="Launched by">
          <a className="hover:underline" href={d.launchedBy.href}>
            {d.launchedBy.title}
          </a>
        </Line>
      )}
      {d.origin && <Line label="Origin">{d.origin}</Line>}
      {d.startedBy && <Line label="Started by">{d.startedBy}</Line>}
      {d.createdAt && <Line label="Created">{ago(d.createdAt, now)}</Line>}
      {d.goal && (
        <Line label="Goal">
          {d.goal.objective} · {d.goal.status}
        </Line>
      )}
      {tags && <Line label="Tags">{tags}</Line>}
      {t.prs.map((p, i) => (
        <Line key={p.n} label={i === 0 ? "PRs" : ""}>
          <a className="font-mono hover:underline" href={p.url} target="_blank" rel="noreferrer">
            #{p.n}
          </a>{" "}
          {[
            p.title,
            p.draft ? `${p.state} (draft)` : p.state,
            p.checks && `checks ${p.checks}`,
            p.review,
            p.additions !== null && p.deletions !== null && `+${p.additions} -${p.deletions}`,
            p.changedFiles !== null && `${p.changedFiles} ${p.changedFiles === 1 ? "file" : "files"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Line>
      ))}
    </dl>
  );
}

/**
 * `inStack`: the row sits on a stack rail, which holds no drag handles and shows the stack itself.
 * `flat`: the row sits in the flat list, which has no handles. `project` adds the Project column, `review` the eye.
 */
function ThreadRow({
  t,
  chip,
  sort,
  inStack,
  flat,
  project,
  review,
}: {
  t: ThreadNode;
  chip?: string;
  sort?: Sort;
  inStack?: boolean;
  flat?: boolean;
  project?: Branch;
  review?: boolean;
}) {
  const now = useContext(Now);
  const { open, toggle, show } = useContext(Details);
  const dim = useContext(NeedsOnly) && !needsYou(t.status);
  const linear = useContext(Linear);
  const sendTo = useContext(SendTo);
  const chipHref = chip ? linearHref(chip, linear) : null;
  const pulse = useChanges(t.status);
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open.has(t.id)} onOpenChange={() => toggle(t.id)}>
      <li ref={ref} className="my-px" style={{ viewTransitionName: vtName("t", t.id) }}>
        <div
          className="thread-row group/row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 py-1 text-[13px] leading-5 max-[720px]:flex-wrap"
          data-status={t.status}
        >
          {!inStack && !flat && <DragHandle handleRef={handleRef} name={t.title || t.id} className="-ml-1.5" />}
          <StatusIcon t={t} now={now} />
          {pulse > 0 && <span key={pulse} aria-hidden className={cn("row-pulse", STATUS[t.status].shape)} />}
          {project && <ProjectColumn b={project} />}
          {chip && (
            <Badge
              variant="outline"
              className={cn(CHIP, "flex-none font-mono", chipHref && "hover:underline")}
              asChild={!!chipHref}
            >
              {chipHref ? (
                <a href={chipHref} target="_blank" rel="noreferrer" title="Open in Linear">
                  {chip}
                </a>
              ) : (
                chip
              )}
            </Badge>
          )}
          {review && <Eye className="size-3.5 flex-none text-review" aria-label="Review" />}
          <a
            className={cn(
              "min-w-0 flex-1 break-words hover:underline",
              t.status === "your-turn" ? "font-[650]" : "font-medium",
              (t.status === "snoozed" || t.settled || dim) && "text-muted-foreground",
              "max-[720px]:basis-full max-[720px]:pl-5",
            )}
            href={t.href}
          >
            {(chip ? stripKey(t.title, chip) : t.title) || t.id}
          </a>
          <span className="ml-auto flex flex-none items-center gap-1.5 max-[720px]:ml-0 max-[720px]:basis-full max-[720px]:flex-wrap max-[720px]:pl-5">
            {t.input && (
              <Badge variant="outline" className={CHIP}>
                Input
              </Badge>
            )}
            {t.snoozedUntil && (
              <Badge variant="outline" className={CHIP}>
                until {until(t.snoozedUntil)}
              </Badge>
            )}
            {t.settled && (
              <Badge variant="outline" className={CHIP}>
                Settled
              </Badge>
            )}
            {t.stack && !inStack && (
              <Badge variant="outline" className={cn(CHIP, "chip-stack")} title="PR stack">
                <Layers />
                {t.stack.pos ? `${t.stack.pos}/${t.stack.total}` : `base · ${t.stack.total}`}
              </Badge>
            )}
            {t.prs.slice(0, 2).map((p) => (
              <PrChip key={p.n} p={p} />
            ))}
            {t.prs.length > 2 && (
              <Button
                variant="ghost"
                className={cn(ROW_BUTTON, "w-auto px-1 text-[11px] font-normal")}
                title={`Show all ${t.prs.length} pull requests`}
                onClick={() => show(t.id)}
              >
                +{t.prs.length - 2}
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {ago(t.updatedAt, now)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Updated {new Date(t.updatedAt).toLocaleString()}</TooltipContent>
            </Tooltip>
            {sendTo && (
              <CliGate t3cli={sendTo.t3cli}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(ROW_BUTTON, SEND_REVEAL)}
                  aria-label="Send message"
                  disabled={sendTo.t3cli?.available === false}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendTo.open(t.id);
                  }}
                >
                  <Send className="size-3.5" />
                </Button>
              </CliGate>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className={cn(ROW_BUTTON, "group")} aria-label="Details">
                <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
              </Button>
            </CollapsibleTrigger>
          </span>
        </div>
        <CollapsibleContent>
          <DetailBlock t={t} />
        </CollapsibleContent>
        {t.children.length > 0 && (
          <ul className="m-0 list-none pl-2.5">
            <Presence items={t.children} keyOf={(c) => c.id}>
              {(c) => <ThreadRow t={c} inStack={inStack} flat={flat} />}
            </Presence>
          </ul>
        )}
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** The project icon and name of a flat row. Phone widths show the icon only. */
const ProjectColumn = ({ b }: { b: Branch }) => (
  <span className="flex w-32 flex-none items-center gap-1.5 max-[720px]:w-auto" title={b.repo ?? b.label}>
    <ProjectIcon name={b.label} />
    <span className="truncate text-xs text-muted-foreground max-[720px]:hidden">{b.label}</span>
  </span>
);

const Chevron = ({ open }: { open: boolean }) => (
  <ChevronRight
    className={cn(
      "size-3.5 flex-none text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
      open && "rotate-90",
    )}
  />
);

/** One status icon for each thread of a closed branch, in tree order. */
const Icons = ({ b }: { b: Branch }) => (
  <span className="relative z-10 inline-flex flex-wrap items-center gap-[3px]">
    {allThreads(b).map((t) => (
      <StatusIcon key={t.id} t={t} />
    ))}
  </span>
);

type Fold = { closed: Set<string>; toggle: (id: string) => void; fold: (ids: string[], shut: boolean) => void };

/** Opens `self` and all `inner` ids when one of them is closed, else closes all `inner` ids. Hidden with no `inner` ids. */
function FoldAll({
  inner,
  self,
  name,
  closed,
  fold,
  className,
}: { inner: string[]; self?: string; name?: string; className?: string } & Omit<Fold, "toggle">) {
  if (inner.length === 0) return null;
  const all = self ? [self, ...inner] : inner;
  const shut = all.every((id) => !closed.has(id));
  const label = `${shut ? "Collapse" : "Expand"} all${name ? ` in ${name}` : ""}`;
  return (
    <Button
      variant="ghost"
      size={name ? "icon" : "icon-sm"}
      aria-label={label}
      title={label}
      className={className}
      onClick={() => fold(shut ? inner : all, shut)}
    >
      <MorphIcon icon={shut ? ChevronsDownUp : ChevronsUpDown} size={name ? 14 : 16} reducedMotion="user" />
    </Button>
  );
}

/** The row variant of `FoldAll`: on top of the row trigger, shown on hover or focus. */
const ROW_FOLD = cn(
  ROW_BUTTON,
  "relative z-10 ml-auto opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
);

function GroupRow({ b, closed, toggle, fold, sort }: { b: Branch; sort?: Sort } & Fold) {
  const open = !closed.has(b.id);
  const one = folded(b);
  const linear = useContext(Linear);
  const lists = useContext(Lists);
  const groupHref = isKeyGroup(b) ? linearHref(b.label, linear) : null;
  if (one) return <ThreadRow t={one} chip={b.label} sort={sort} />;
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
      <li ref={ref} className="my-px">
        <div
          className="group/row relative flex h-7 min-w-0 items-center gap-2 rounded-[8px] px-2 hover:bg-accent max-[720px]:h-auto max-[720px]:min-h-7 max-[720px]:flex-wrap"
          data-waiting={!open && waits(b) ? "" : undefined}
        >
          <DragHandle handleRef={handleRef} name={b.label} className="relative z-10 -ml-1.5" />
          <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-center gap-2 select-none after:absolute after:inset-0 max-[720px]:min-h-11">
            <Chevron open={open} />
            {b.label === REVIEWS && <Eye className="size-3.5 flex-none text-review" aria-hidden />}
            <span
              className={cn(
                "truncate text-xs font-semibold",
                b.label === REVIEWS ? "text-review" : isKeyGroup(b) ? "font-mono" : "text-muted-foreground",
              )}
            >
              {b.label}
            </span>
          </CollapsibleTrigger>
          {groupHref && (
            <a
              href={groupHref}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${b.label} in Linear`}
              title="Open in Linear"
              className="relative z-10 flex-none text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          {!open && <Icons b={b} />}
          <FoldAll
            inner={b.branches.flatMap(groupIds)}
            self={b.id}
            name={b.label}
            closed={closed}
            fold={fold}
            className={ROW_FOLD}
          />
        </div>
        <CollapsibleContent asChild>
          <ul className={cn("m-0 list-none", isPinned(b) ? "pl-6" : "pl-2.5")}>
            <Presence items={b.branches} keyOf={(c) => c.id}>
              {(c) => (
                <GroupRow
                  b={c}
                  closed={closed}
                  toggle={toggle}
                  fold={fold}
                  sort={sortOf(lists, groupsKey(b.id), c.id, c.label)}
                />
              )}
            </Presence>
            <Presence items={b.threads} keyOf={(t) => t.id}>
              {(t) => <ThreadRow t={t} sort={sortOf(lists, threadsKey(b.id), threadUnitId(t), t.title || t.id)} />}
            </Presence>
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** A node on the rail line at `y` px, with line segments above and below it. A node with no `n` is hollow. */
function RailNode({
  y,
  color,
  above,
  below,
  n,
}: {
  y: number;
  color: string;
  above: boolean;
  below: boolean;
  n?: number;
}) {
  const line = `color-mix(in oklch, ${color} 45%, transparent)`;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-5">
      {above && <span className="absolute left-[9px] w-0.5" style={{ top: 0, height: y, background: line }} />}
      {below && <span className="absolute bottom-0 left-[9px] w-0.5" style={{ top: y, background: line }} />}
      <span
        className={cn(
          "absolute flex -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-background",
          n ? "left-px size-[18px]" : "left-1 size-3 border-2 border-muted-foreground bg-card",
        )}
        style={{ top: y, background: n ? color : undefined }}
      >
        {n}
      </span>
    </span>
  );
}

/**
 * Key groups of one PR stack. The header is a line of stops from the base to the top PR; the body lists the
 * threads on a numbered line, one number per PR. Both are colored by PR state.
 */
function StackRail({
  run,
  closed,
  toggle,
  sort,
  flat,
  project,
}: { run: Branch[]; sort?: Sort; flat?: boolean; project?: Branch } & Fold) {
  const { id, total, base } = run[0].stack!;
  const open = flat || !closed.has(`rail:${id}`);
  const stops = run.map((g) => ({ g, p: ownPr(g) }));
  const rows = stops.flatMap(({ g, p }, i) =>
    g.threads.map((t, j) => ({ t, g, color: prTone(p), n: j ? undefined : i + 1 })),
  );
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(`rail:${id}`)}>
      <li
        ref={ref}
        className={cn("relative my-1 ml-7 rounded-[10px] border border-dashed border-border", flat && "ml-0")}
        style={{ viewTransitionName: vtName("s", run[0].id) }}
      >
        <div
          className="group/row relative flex min-h-7 flex-wrap items-center gap-2 rounded-[10px] px-2 text-xs"
          data-waiting={!open && run.some(waits) ? "" : undefined}
        >
          {handleRef && (
            <DragHandle
              handleRef={handleRef}
              name={`PR stack of ${run[0].label}`}
              className="absolute top-1 -left-7 z-10"
            />
          )}
          {flat ? (
            <span className="flex items-center text-muted-foreground" title={`PR stack · ${total} PRs`}>
              <Layers className="size-3.5" aria-label={`PR stack · ${total} PRs`} />
            </span>
          ) : (
            <CollapsibleTrigger
              className="flex cursor-pointer items-center gap-1 text-muted-foreground select-none after:absolute after:inset-0 max-[720px]:min-h-11"
              aria-label={`PR stack · ${total} PRs`}
              title={`PR stack · ${total} PRs`}
            >
              <Chevron open={open} />
              <Layers className="size-3.5" aria-hidden />
            </CollapsibleTrigger>
          )}
          {project && <ProjectColumn b={project} />}
          <span className="inline-flex flex-wrap items-center gap-y-1">
            {base && (
              <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {base}
              </code>
            )}
            {stops.map(({ g, p }, i) => (
              <span key={g.id} className="inline-flex items-center">
                {(i > 0 || base) && <span className="h-0.5 w-4" style={{ background: prTone(p) }} />}
                <a
                  href={p?.url}
                  target="_blank"
                  rel="noreferrer"
                  title={g.label}
                  className={cn(
                    "relative z-10 inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-mono text-[11px] hover:underline",
                    p?.draft && "border-dashed",
                  )}
                  style={{ borderColor: prTone(p) }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: prTone(p) }} />
                  {i + 1}
                  {p && ` · #${p.n}`}
                </a>
              </span>
            ))}
          </span>
        </div>
        <CollapsibleContent asChild>
          <ul className="m-0 list-none p-0 pb-1 pl-1">
            <Presence items={rows} keyOf={(r) => r.t.id}>
              {(r) => (
                <li className="relative pl-6">
                  <RailNode y={18} color={r.color} above={r.t !== rows[0].t} below={r.t !== rows.at(-1)!.t} n={r.n} />
                  <ul className="m-0 list-none p-0">
                    <ThreadRow t={r.t} chip={r.g.label} inStack />
                  </ul>
                </li>
              )}
            </Presence>
          </ul>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** A flat-list item: a status section header, a thread row or a PR stack. */
function FlatRow({ i, closed, toggle, fold }: { i: FlatItem } & Fold) {
  if (i.kind === "thread")
    return <ThreadRow t={i.t} chip={i.t.key ?? undefined} project={i.project} review={i.review} flat />;
  if (i.kind === "stack")
    return <StackRail run={i.run} project={i.project} flat closed={closed} toggle={toggle} fold={fold} />;
  return (
    <MotionHook>
      {(ref) => (
        <li
          ref={ref}
          className="flex h-7 items-center gap-2 px-2 text-xs font-semibold text-muted-foreground"
          style={{ viewTransitionName: vtName("sec", i.key) }}
        >
          {i.label}
          <span className="font-normal tabular-nums">{i.count}</span>
        </li>
      )}
    </MotionHook>
  );
}

/** A project as one block of the shared list: a one-line header, then its groups. */
function ProjectBlock({ b, closed, toggle, fold }: { b: Branch } & Fold) {
  const open = !closed.has(b.id);
  const lists = useContext(Lists);
  const color = projectHex(b.label);
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <li ref={ref} className="border-l-[3px] not-last:border-b" style={{ borderLeftColor: color }}>
      <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
        <div>
          <div
            className="group/row sticky top-0 z-20 flex h-8 min-w-0 items-center gap-1.5 bg-card px-2 max-[720px]:h-auto max-[720px]:min-h-8"
            data-waiting={!open && waits(b) ? "" : undefined}
          >
            <DragHandle handleRef={handleRef} name={b.label} className="relative z-10 -ml-1" />
            <CollapsibleTrigger className="flex min-w-0 cursor-pointer items-center gap-1.5 select-none after:absolute after:inset-0">
              <Chevron open={open} />
              <ProjectIcon name={b.label} />
              <span className="min-w-0 truncate text-[13px] font-semibold" title={b.repo ?? b.label}>
                {b.label}
              </span>
            </CollapsibleTrigger>
            {!open && <Icons b={b} />}
            <FoldAll inner={foldIds(b)} self={b.id} name={b.label} closed={closed} fold={fold} className={ROW_FOLD} />
          </div>
          <div className="min-w-0 px-1 pb-1">
            <CollapsibleContent asChild>
              <ul className="m-0 list-none p-0">
                <Presence
                  items={stackRuns(b.branches)}
                  keyOf={(run) => (run[0].stack ? `rail:${run[0].id}` : run[0].id)}
                >
                  {(run) => {
                    const sort = !isPinned(run[0])
                      ? sortOf(
                          lists,
                          groupsKey(b.id),
                          runUnitId(b.id, run),
                          run[0].stack ? `PR stack of ${run[0].label}` : run[0].label,
                        )
                      : undefined;
                    return run[0].stack ? (
                      <StackRail run={run} closed={closed} toggle={toggle} fold={fold} sort={sort} />
                    ) : (
                      <GroupRow b={run[0]} closed={closed} toggle={toggle} fold={fold} sort={sort} />
                    );
                  }}
                </Presence>
              </ul>
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </li>
  );
  return <Sortable sort={sortOf(lists, PROJECTS, b.id, b.label)}>{render}</Sortable>;
}

/** The meaning of each status icon. */
const Legend = () => (
  <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-xs">
    {LEGEND.map(([status, phrase, meaning]) => (
      <Fragment key={phrase}>
        <dt className="flex items-center gap-1.5 font-medium text-foreground">
          <LegendIcon status={status} phrase={phrase} />
          {phrase}
        </dt>
        <dd className="m-0 text-muted-foreground">{meaning}</dd>
      </Fragment>
    ))}
  </dl>
);

/** Set while a drag runs. */
const drag = { on: false };

/** Runs `change` as a View Transition, so the rows slide. Runs it at once when a transition cannot or must not play. */
const transition = (change: () => void) => {
  if (
    !document.startViewTransition ||
    drag.on ||
    document.hidden ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    change();
  else document.startViewTransition(() => flushSync(change));
};

type Cfg = { orders: Orders; needsOnly: boolean; sortBy: SortBy; layout: Layout; groupBy: GroupBy; freeze?: Freeze };

/**
 * The user order on the whole tree, then the filter, then the drag freeze. In the tree, `view.projects` is also sorted.
 * In the flat layout, `view.flat` is also set: the sorted units, with section headers when grouped.
 */
const pipeline = (ps: Branch[], c: Cfg): { full: Arranged; view: Arranged & { flat?: FlatItem[] } } => {
  const full = arrange(ps, c.orders);
  const view = arrange(c.needsOnly ? onlyNeedsYou(full.projects) : full.projects, {}, c.freeze);
  if (c.layout === "flat") {
    const units = flatten(view.projects);
    return { full, view: { ...view, flat: sequence(c.sortBy === "updated" ? sortFlat(units) : units, c.groupBy) } };
  }
  return { full, view: { ...view, projects: c.sortBy === "updated" ? sortTree(view.projects) : view.projects } };
};

function App() {
  const [tree, setTree] = useState<Tree | null>(null);
  const [settled, setSettled] = useState(load(SETTLED_KEY) === "1");
  const [needsOnly, setNeedsOnly] = useState(load(FILTER_KEY) === "needs");
  const [theme, setTheme] = useState<Theme>(() => THEMES.find((t) => t === load(THEME_KEY)) ?? "system");
  const [sortBy, setSortBy] = useState<SortBy>(() => (load(SORT_KEY) === "updated" ? "updated" : "manual"));
  const [layout, setLayout] = useState<Layout>(() => (load(LAYOUT_KEY) === "flat" ? "flat" : "tree"));
  const [groupBy, setGroupBy] = useState<GroupBy>(() => (load(GROUP_KEY) === "status" ? "status" : "none"));
  const [now, setNow] = useState(Date.now);
  const [shown, setShown] = useState(() => new Set<string>());
  const [closed, setClosed] = useState(() => new Set<string>(JSON.parse(load(CLOSED_KEY) ?? "[]") as string[]));
  const [brief, setBrief] = useState<BriefState>({ status: "idle" });
  const [clis, setClis] = useState<Offered | null>(null);
  const [cli, setCli] = useState(load(CLI_KEY) as Cli | null);
  const [hideBrief, setHideBrief] = useState(false);
  const [t3cli, setT3cli] = useState<CliStatus | null>(null);
  const [sent, setSent] = useState(() => new Map<string, string[]>());
  const [sendTo, setSendTo] = useState({ id: "", open: false });
  const briefStatus = useRef<BriefState["status"]>("idle");
  const [orders, setOrders] = useState(() => parseOrders(load(ORDER_KEY)));
  /** The page setting wins over the server's `.env` config. */
  const [linearSet, setLinearSet] = useState<Tree["linear"]>(() => {
    try {
      const v = JSON.parse(load(LINEAR_KEY) ?? "null") as { workspace?: string; teams?: string } | null;
      return v && parseLinear(v.workspace, v.teams);
    } catch {
      return null;
    }
  });
  const linear = linearSet ?? tree?.linear ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const update = useUpdate();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const setLinear = (workspace: string, teams: string) => {
    const next = parseLinear(workspace, teams);
    setLinearSet(next);
    if (next) save(LINEAR_KEY, JSON.stringify({ workspace: next.workspace, teams: next.teams.join(",") }));
    else forget(LINEAR_KEY);
  };
  const [freeze, setFreeze] = useState<Freeze>();
  const sentNeedsYou = useRef("");

  useEffect(() => {
    if (!window.desktopBridge || !tree) return;
    const list = needsYouThreads(tree.projects);
    const key = JSON.stringify(list);
    if (key === sentNeedsYou.current) return;
    sentNeedsYou.current = key;
    window.desktopBridge.setNeedsYou(list);
  }, [tree]);

  const lastStatuses = useRef<Statuses | null>(null);
  useEffect(() => {
    if (!window.desktopBridge || !tree) return;
    const { events, nextStatuses } = notifyEvents(lastStatuses.current, tree);
    lastStatuses.current = nextStatuses;
    if (events.length > 0) window.desktopBridge.notify(events);
  }, [tree]);

  useEffect(() => {
    fetch("/brief/clis")
      .then((r) => r.json() as Promise<Offered>)
      .then(setClis, () => setClis([]));
    fetch("/t3/cli")
      .then((r) => r.json() as Promise<CliStatus>)
      .then(setT3cli, () => setT3cli(null));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    save(FILTER_KEY, needsOnly ? "needs" : "all");
  }, [needsOnly]);

  useEffect(() => {
    save(THEME_KEY, theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const toggle = (id: string) => {
    const n = new Set(closed);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setClosed(n);
    save(CLOSED_KEY, JSON.stringify([...n]));
  };
  const fold = (ids: string[], shut: boolean) => {
    const n = new Set(closed);
    for (const id of ids) {
      if (shut) n.add(id);
      else n.delete(id);
    }
    setClosed(n);
    save(CLOSED_KEY, JSON.stringify([...n]));
  };

  const details = {
    open: shown,
    toggle: (id: string) =>
      setShown((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    show: (id: string) => setShown((s) => new Set(s).add(id)),
  };
  const pick = clis?.find((c) => c.id === cli)?.id ?? clis?.[0]?.id;
  const runBrief = () => {
    if (!pick) return;
    setHideBrief(false);
    void fetch(`/brief/run?settled=${settled ? 1 : 0}`, { method: "POST", body: JSON.stringify({ cli: pick }) });
  };
  const live = new Map((tree?.projects ?? []).flatMap(allThreads).map((t) => [t.id, t]));
  const counts = countAttention(tree?.projects ?? []);
  const connecting = !tree || tree.conn === "connecting";
  const cfg: Cfg = { orders, needsOnly, sortBy, layout, groupBy, freeze };
  const { full, view } = pipeline(tree?.projects ?? [], cfg);
  /** The ids of the rendered rows and section headers, in order, for a tree. */
  const rows = (ps: Branch[]) => {
    const v = pipeline(ps, cfg).view;
    return (
      layout === "flat" ? (v.flat ?? []).flatMap(itemIds) : v.projects.flatMap(allThreads).map((t) => t.id)
    ).join();
  };
  const latest = useRef({ full, view, rows, projects: tree?.projects ?? [], connecting });
  useEffect(() => {
    latest.current = { full, view, rows, projects: tree?.projects ?? [], connecting };
  });
  useEffect(() => {
    save(SETTLED_KEY, settled ? "1" : "0");
    const es = new EventSource(settled ? "/events?settled=1" : "/events");
    es.onmessage = (e) => {
      const next = JSON.parse(e.data) as Tree;
      const cur = latest.current;
      /** Only a change of the row order plays a transition; a push every second while a thread works does not. */
      if (cur.connecting || cur.rows(next.projects) === cur.rows(cur.projects)) setTree(next);
      else transition(() => setTree(next));
    };
    es.addEventListener("brief", (e) => {
      const b = JSON.parse(e.data) as BriefState;
      if (b.status === "running" && briefStatus.current !== "running") setSent(new Map());
      briefStatus.current = b.status;
      setBrief(b);
    });
    return () => es.close();
  }, [settled]);

  const projects = connecting ? undefined : view.projects;

  const plugins = useCallback((defaults: typeof defaultPreset.plugins) => {
    /** The name and the "position i of n" text of a sortable `source`; n is the rendered list size. */
    const spot = (source: Draggable | null) => {
      if (!isSortable(source)) return undefined;
      const n = latest.current.view.lists.get(String(source.sortable.group))?.length ?? 0;
      return { name: String(source.data.name), at: `position ${source.sortable.index + 1} of ${n}` };
    };
    return [
      ...defaults.filter((p) => p !== Accessibility),
      Accessibility.configure({
        announcements: {
          dragstart: ({ operation }: DragStartEvent) => {
            const s = spot(operation.source);
            return s && `Picked up ${s.name}. ${s.at}.`;
          },
          dragover: ({ operation }: DragOverEvent) => {
            const s = spot(operation.source);
            return s && `${s.name} is at ${s.at}.`;
          },
          dragend: ({ operation, canceled }: DragEndEvent) => {
            const s = spot(operation.source);
            return s && (canceled ? `Move canceled. ${s.name} is back at ${s.at}.` : `${s.name} dropped at ${s.at}.`);
          },
        },
      }),
    ];
  }, []);
  const dragStart = ({ operation: { source } }: DragStartEvent) => {
    if (!isSortable(source)) return;
    drag.on = true;
    const list = String(source.sortable.group);
    const ids = latest.current.view.lists.get(list);
    const units = latest.current.view.units.get(list);
    if (ids && units) setFreeze({ list, ids, units });
  };
  const dragEnd = ({ operation: { source }, canceled }: DragEndEvent) => {
    drag.on = false;
    setFreeze(undefined);
    if (canceled || !isSortable(source)) return;
    const list = String(source.sortable.group);
    const all = latest.current.full.lists.get(list);
    const visible = latest.current.view.lists.get(list);
    if (!all || !visible) return;
    const moved = reorder(all, visible, source.sortable.initialIndex, source.sortable.index);
    const lists = latest.current.full.lists;
    setOrders((prev) => {
      const next = prune({ ...prev, [list]: moved }, lists);
      save(ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };
  const resetOrder = () => {
    setOrders({});
    forget(ORDER_KEY);
  };

  return (
    <TooltipProvider>
      <header className="mb-3.5 flex flex-none flex-wrap items-center gap-x-4 gap-y-3 text-muted-foreground">
        <h1 className="m-0 text-[15px] font-semibold text-foreground">Thread tree</h1>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          aria-label="Filter"
          value={needsOnly ? "needs" : "all"}
          onValueChange={(v) => v && setNeedsOnly(v === "needs")}
        >
          <ToggleGroupItem value="all" className={FILTER_ITEM}>
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="needs" className={cn(FILTER_ITEM, "gap-1.5 px-2.5")}>
            Needs you
            {counts.needYou > 0 && (
              <span className="rounded-[4px] bg-status-needs-input px-1 text-[11px] text-white tabular-nums">
                {counts.needYou}
              </span>
            )}
          </ToggleGroupItem>
        </ToggleGroup>
        <BriefControls
          clis={clis}
          cli={pick}
          setCli={(c) => (setCli(c), save(CLI_KEY, c))}
          running={brief.status === "running"}
          run={runBrief}
        />
        <div className="ml-auto flex items-center gap-1">
          <SortMenu
            sortBy={sortBy}
            setSortBy={(s) => {
              save(SORT_KEY, s);
              transition(() => setSortBy(s));
            }}
          />
          <LayoutToggle
            layout={layout}
            setLayout={(l) => {
              save(LAYOUT_KEY, l);
              transition(() => setLayout(l));
            }}
          />
          {layout === "flat" && (
            <GroupMenu
              groupBy={groupBy}
              setGroupBy={(g) => {
                save(GROUP_KEY, g);
                transition(() => setGroupBy(g));
              }}
            />
          )}
          {projects && layout === "tree" && (
            <FoldAll inner={projects.flatMap((p) => [p.id, ...foldIds(p)])} closed={closed} fold={fold} />
          )}
          <ViewButton
            update={update}
            open={settingsOpen}
            toggle={() => {
              setTokenOpen(false);
              setSettingsOpen((o) => !o);
            }}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tree?.conn === "down" && (
          <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
            <AlertDescription className="text-foreground">
              T3 not running: last update {tree.lastUpdate ? hhmm(tree.lastUpdate) : "never"}
            </AlertDescription>
          </Alert>
        )}
        {(tree?.conn === "no-token" || tree?.conn === "unauthorized") && (
          <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
            <AlertDescription className="flex flex-wrap items-center gap-x-2 text-foreground">
              {tree.conn === "no-token" ? "No T3 token is set." : "T3 rejected the token."}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => {
                  setTokenOpen(true);
                  setSettingsOpen(true);
                }}
              >
                Set the token
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!hideBrief && brief.status !== "idle" && (
          <BriefPanel
            state={brief}
            clis={clis}
            live={live}
            projects={tree?.projects ?? []}
            t3cli={t3cli}
            sent={sent}
            onSent={(key, id) =>
              setSent((m) => {
                const ids = m.get(key) ?? [];
                return ids.includes(id) ? m : new Map(m).set(key, [...ids, id]);
              })
            }
            run={runBrief}
            cancel={() => fetch("/brief/cancel", { method: "POST" })}
            close={() => setHideBrief(true)}
          />
        )}
        <Details value={details}>
          <NeedsOnly value={needsOnly}>
            <Linear value={linear}>
              <Lists value={sortBy === "updated" || layout === "flat" ? NO_LISTS : view.lists}>
                <Now value={now}>
                  <div
                    className={!connecting && tree.conn !== "up" ? "grayscale" : ""}
                    data-conn={!connecting && tree.conn !== "up" ? "down" : undefined}
                  >
                    {projects?.length === 0 && <p className="text-muted-foreground">No active threads.</p>}
                    {projects ? (
                      <DragDropProvider plugins={plugins} onDragStart={dragStart} onDragEnd={dragEnd}>
                        <Card className="gap-0 overflow-clip rounded-[12px] py-0 shadow-none">
                          <ul className={cn("m-0 list-none p-0", layout === "flat" && "p-1")}>
                            <SendTo value={{ t3cli, open: (id) => setSendTo({ id, open: true }) }}>
                              {layout === "flat" ? (
                                <Presence items={view.flat ?? []} keyOf={(i) => i.id}>
                                  {(i) => <FlatRow i={i} closed={closed} toggle={toggle} fold={fold} />}
                                </Presence>
                              ) : (
                                <Presence items={projects} keyOf={(p) => p.id}>
                                  {(p) => <ProjectBlock b={p} closed={closed} toggle={toggle} fold={fold} />}
                                </Presence>
                              )}
                            </SendTo>
                          </ul>
                        </Card>
                      </DragDropProvider>
                    ) : (
                      <>
                        <p className="mb-2 text-sm text-muted-foreground" role="status">
                          Connecting to T3…
                        </p>
                        <Card
                          className="gap-0 rounded-[12px] py-0 shadow-none"
                          aria-busy="true"
                          aria-label="Loading threads"
                        >
                          <CardContent className="flex flex-col gap-0.5 p-1.5">
                            {[0, 1, 2].map((i) => (
                              <Skeleton key={i} className="h-9 rounded-[8px] motion-reduce:animate-none" />
                            ))}
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </div>
                </Now>
              </Lists>
            </Linear>
          </NeedsOnly>
        </Details>
      </div>
      {settingsOpen && (
        <SettingsPanel
          close={closeSettings}
          linear={linear}
          setLinear={setLinear}
          settled={settled}
          setSettled={setSettled}
          canReset={Object.keys(orders).length > 0}
          resetOrder={resetOrder}
          theme={theme}
          setTheme={setTheme}
          update={update}
          conn={tree?.conn}
          tokenOpen={tokenOpen}
        />
      )}
      <SendDialog
        fixed
        open={sendTo.open}
        threadIds={[sendTo.id]}
        live={live}
        message=""
        onOpenChange={(open) => setSendTo((s) => ({ ...s, open }))}
      />
    </TooltipProvider>
  );
}

/** Hot reload re-runs this module; reuse the root so two roots never share one container. */
const container = document.getElementById("root")!;
const root = import.meta.hot ? (import.meta.hot.data.root ??= createRoot(container)) : createRoot(container);
root.render(<App />);
