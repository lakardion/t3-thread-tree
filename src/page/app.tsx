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
import { ChevronsDownUp, ChevronsUpDown, Ellipsis, X as XGlyph } from "lucide";
import {
  ArrowDownUp,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleArrowUp,
  CircleCheckBig,
  Contrast,
  ExternalLink,
  Eye,
  Rows3,
  GripVertical,
  Inbox,
  Info,
  Layers,
  List,
  ListTree,
  LoaderCircle,
  Map as MapIcon,
  Moon,
  Send,
  Settings,
  Sun,
  Tag,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { MorphIcon } from "morphicons/react";
import { Popover } from "radix-ui";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import appIcon from "../../assets/icon.svg" with { type: "text" };
import type { UpdateState } from "../shared/desktop.ts";
import { hits } from "../shared/find.ts";
import type { LocalConfig, LocalState, ModelPick, Offered } from "../shared/model.ts";
import { isRun, type RunItem } from "../shared/runs.ts";
import type { CliStatus } from "../shared/send.ts";
import { CATCH_UP, isIn } from "../shared/status.ts";
import {
  allThreads,
  isThread,
  parseLabels,
  parseLinear,
  type Group,
  type LinearKeyState,
  type PrNode,
  type Status,
  type ThreadNode,
  type Tree,
} from "../shared/tree.ts";
import { effectivePick, foldValue, switchBody } from "./catch-up-fold.ts";
import { CatchUpTitle } from "./catch-up-line.tsx";
import { CopyPrompt } from "./copy-prompt.tsx";
import { useDesktopSync } from "./desktop-sync.ts";
import { FindDialog, FIND_KEY, MAC } from "./find.tsx";
import {
  ago,
  agoAt,
  folded,
  foldIds,
  initials,
  ink,
  isKeyGroup,
  isMergedRow,
  isMergedStop,
  labelPill,
  linearHref,
  prTone,
  railRows,
  railView,
  shortDate,
  stackRuns,
  stopLabel,
  stripKey,
} from "./format.ts";
import { GroupingSection } from "./grouping.tsx";
import { IconState } from "./icon-state.tsx";
import { useKeyHints } from "./key-hints.tsx";
import { pageKey } from "./keys.ts";
import { liveStream, type LiveState } from "./live.ts";
import { SetupDialog } from "./local-setup-dialog.tsx";
import { looksDone, parseSkip, pruneSkip, SKIP_KEY, type Skip } from "./looks-done.ts";
import { LooksDoneButton, LooksDoneDialog, UndoToast } from "./looks-done.tsx";
import { MapGroup } from "./map-group.tsx";
import {
  countHeader,
  emptyKind,
  type EmptyKind,
  favicon,
  needsYou,
  needsYouThreads,
  needsYouTip,
  nextTarget,
  onlyNeedsYou,
  openNextQueue,
  remember,
  tabTitle,
  waits,
  withoutSnoozed,
} from "./needs-you.ts";
import {
  PROJECTS,
  arrange,
  isLinear,
  applyOrder,
  parseOrders,
  prune,
  baseList,
  groupsKey,
  pinFirst,
  pinIdOf,
  pinnedList,
  reorder,
  runUnitId,
  threadUnitId,
  threadsKey,
  type Arranged,
  type Freeze,
  type Orders,
} from "./order.ts";
import { PinButton, Pins } from "./pin-button.tsx";
import { OpenGraph, PrGraphDialog } from "./pr-graph.tsx";
import {
  flag,
  forget,
  idSet,
  load,
  oneOf,
  ruleList,
  rulesParam,
  save,
  usePref,
  type Codec,
  type Rule,
} from "./prefs.ts";
import { Presence, useMotion } from "./presence.tsx";
import { ProjectIcon, projectHex } from "./project-icon.tsx";
import { ProviderIcon } from "./provider-icon.tsx";
import { Reveal, revealRow } from "./reveal.tsx";
import { RunRow } from "./run-row.tsx";
import { CliGate, LastMessage, SendDialog, useLastMessage } from "./send-dialog.tsx";
import { postMapThread, postSettle } from "./send.ts";
import { LEGEND, LegendIcon, STATUS, StatusIcon } from "./status-icon.tsx";
import { nextStop, refocusIndex, stopsIn } from "./stops.ts";
import { Swap, useChanges } from "./swap.tsx";
import { TriageButton, TriageCard } from "./triage.tsx";
import {
  closedCounts,
  ageTip,
  blockTime,
  FLAT,
  flatLists,
  flatPinId,
  flatten,
  folds,
  groupTime,
  headerTip,
  isContext,
  itemIds,
  lastRunOf,
  pathFolds,
  sectionHolding,
  sectionOf,
  sequence,
  sortFlat,
  sortTree,
  vtName,
  type FlatItem,
  type GroupBy,
  type Layout,
  type SortBy,
} from "./view.ts";
import { prChoices, stackPoint } from "./workflow-start.ts";
import { WorkflowStarter, StartDialog, StartedToast, StartMenu, type StartRequest } from "./workflow-start.tsx";

/** The tab icon; its href follows the needs-you count. */
const iconLink = document.head.appendChild(
  Object.assign(document.createElement("link"), { rel: "icon", type: "image/svg+xml", href: "data:," }),
);

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --scope orchestration:operate --scope filesystem:read --label thread-tree --ttl 52w --token-only | pbcopy";
const CLOSED_KEY = "thread-tree:closed";
const PINS_KEY = "thread-tree:pins";
const SETTLED_KEY = "thread-tree:settled";
const SNOOZED_KEY = "thread-tree:snoozed";
const SECTIONS_KEY = "thread-tree:sections";
const NEST_KEY = "thread-tree:nest";
const RULES_KEY = "thread-tree:rules";
const PROJECT_NAMES_KEY = "thread-tree:project-names";
const STATUS_TEXT_KEY = "thread-tree:status-text";
const KEY_HINTS_KEY = "thread-tree:key-hints";
const FILTER_KEY = "thread-tree:filter";
const THEME_KEY = "thread-tree:theme";
const CLI_KEY = "thread-tree:cli";
const ORDER_KEY = "thread-tree:order";
const LINEAR_KEY = "thread-tree:linear";
const LABELS_KEY = "thread-tree:labels";
const SORT_KEY = "thread-tree:sort";
const LAYOUT_KEY = "thread-tree:layout";
const GROUP_KEY = "thread-tree:group";
const TREE_GROUP_KEY = "thread-tree:tree-group";
const ORDER_LINEAR_KEY = "thread-tree:order-linear";
const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** Sends the token to the server, which saves it and reconnects to T3. */
function TokenForm() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const submit = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      const res = await fetch("/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      /** Any answer but 400 means the server saved the token. */
      if (res.status !== 400) setValue("");
      if (!res.ok) throw new Error((await res.text()) || `Save failed (${res.status})`);
      setMessage({ text: "Connected to T3.", error: false });
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
      <ButtonGroup className="mt-1.5 w-full">
        <Input
          type="password"
          aria-label="T3 token"
          placeholder="Paste a token"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={!value || saving}>
          Save
        </Button>
      </ButtonGroup>
      <p aria-live="polite" className={cn("mt-2 text-xs", message?.error && "text-destructive")}>
        {saving ? (
          <span className="inline-flex items-center gap-1.5">
            <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> Saving and connecting to T3…
          </span>
        ) : (
          message?.text
        )}
      </p>
      <ProgressReveal show={saving} value={null} label="Connection progress" className="pt-1.5" />
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

/** Sends the Linear API key to the server. The page never reads the key back. */
function LinearKeyForm() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const submit = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      const res = await fetch("/linear-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: value }),
      });
      /** Clears the field only when the server saved the key. */
      if (res.ok) setValue("");
      if (!res.ok) throw new Error((await res.text()) || `Save failed (${res.status})`);
      setMessage({ text: "Saved.", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    setSaving(false);
  };
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Label htmlFor="linear-api-key">API key</Label>
      <ButtonGroup className="w-full">
        <Input
          id="linear-api-key"
          type="password"
          placeholder="Paste a key"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={!value || saving}>
          Save
        </Button>
      </ButtonGroup>
      <p className={HINT}>
        Make a personal API key at <code>linear.app/settings/account/security</code>. The app uses it to read the
        project and milestone of each issue. Paste a new one at any time to replace it.
      </p>
      <p aria-live="polite" className={cn(HINT, message?.error && "text-destructive")}>
        {message?.text}
      </p>
    </form>
  );
}

const LOCAL_BASE_URL = "http://localhost:11434/v1";

const LOCAL_FOLD: Record<LocalState, [string, Tone]> = {
  ok: ["Ready", "ok"],
  down: ["Not reachable", "warn"],
  missing: ["Model not found", "warn"],
  unset: ["Not set", "warn"],
};

type LocalInfo = { config: LocalConfig | null; state: LocalState };

/** Mounts after the first load, so the fields start from the saved config and the message survives a Save. */
function LocalModelForm({
  config,
  t3cli,
  onSaved,
}: {
  config: LocalConfig | null;
  t3cli: CliStatus | null;
  onSaved: (l: LocalInfo) => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? LOCAL_BASE_URL);
  const [model, setModel] = useState(config?.model ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const submit = async () => {
    setSaving(true);
    setMessage(undefined);
    try {
      const res = await fetch("/local-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, model }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Save failed (${res.status})`);
      onSaved((await res.json()) as LocalInfo);
      setMessage({ text: "Saved.", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    }
    setSaving(false);
  };
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className={HINT}>
        Runs the Catch-up on a model on this machine. An agent thread can install and set it up for you.
      </p>
      <div>
        <CliGate t3cli={t3cli}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={t3cli?.available === false}
            onClick={() => setSetupOpen(true)}
          >
            Set up with an agent
          </Button>
        </CliGate>
        <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="local-base-url">Base URL</Label>
        <Input
          id="local-base-url"
          placeholder={LOCAL_BASE_URL}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="local-model-name">Model</Label>
        <Input
          id="local-model-name"
          placeholder="qwen3.5:4b-nvfp4"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <span aria-live="polite" className={cn(HINT, message?.error && "text-destructive")}>
          {message?.text}
        </span>
        <Button type="submit" size="sm" disabled={!baseUrl || !model || saving}>
          Save
        </Button>
      </div>
    </form>
  );
}

type LabelsProps = { labels: string[]; setLabels: (s: string) => void };

/** Mounts with the panel, so the field starts from the current setting each time it opens. */
function LabelsForm({ labels, setLabels }: LabelsProps) {
  const [value, setValue] = useState(labels.join(", "));
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setLabels(value);
        setSaved(true);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="watched-labels">Label names</Label>
        <Input
          id="watched-labels"
          placeholder="ready-for-review"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className={HINT}>
          Separate names with commas. A row shows a pill when one of its PRs has one of these labels. Empty: no pills.
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
const SettingsGroup = ({ title, children, accent }: { title: string; children: ReactNode; accent?: boolean }) => (
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

type Tone = "ok" | "warn" | "info" | "none";
const TONE: Record<Tone, { cls: string; Icon: typeof Info | null }> = {
  ok: { cls: "text-status-done-fg", Icon: null },
  warn: { cls: "text-status-needs-input-fg", Icon: TriangleAlert },
  info: { cls: "text-status-working-fg", Icon: Info },
  none: { cls: "text-muted-foreground", Icon: null },
};

/** A row that folds open, with its current value at the right. */
const Fold = ({
  label,
  value,
  tone,
  defaultOpen,
  open,
  onOpenChange,
  action,
  children,
}: {
  label: string;
  value: ReactNode;
  tone: Tone;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  action?: ReactNode;
  children: ReactNode;
}) => {
  const { cls, Icon } = TONE[tone];
  const trigger = (
    <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
      <span className="text-[13px]">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={cn("inline-flex items-center gap-1 text-xs", cls)}>
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {value}
        </span>
        {action && <span aria-hidden className="w-8 shrink-0" />}
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </span>
    </CollapsibleTrigger>
  );
  return (
    <Collapsible defaultOpen={defaultOpen} open={open} onOpenChange={onOpenChange}>
      {action ? (
        <div className="relative">
          {trigger}
          {/** The `right-[34px]` offset is the trigger padding (px-3, 12px) + the chevron (size-4, 16px) + the gap (gap-1.5, 6px); the `w-8` spacer in the trigger holds this room. */}
          <div className="absolute top-1/2 right-[34px] flex -translate-y-1/2">{action}</div>
        </div>
      ) : (
        trigger
      )}
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

/**
 * Controlled props for a tooltip around a menu trigger, and the menu's `onCloseAutoFocus`. The focus that returns to
 * the trigger when the menu closes does not open the tooltip. It relies on Radix focusing the trigger synchronously
 * after `onCloseAutoFocus`.
 */
function useQuietTip() {
  const [open, setOpen] = useState(false);
  const quiet = useRef(false);
  return {
    tip: { open, onOpenChange: (o: boolean) => setOpen(o && !quiet.current) },
    onCloseAutoFocus: () => {
      quiet.current = true;
      queueMicrotask(() => (quiet.current = false));
    },
  };
}

const SORTS: [SortBy, string][] = [
  ["manual", "Manual"],
  ["updated", "Last updated"],
];
const SortMenu = ({ sortBy, setSortBy }: { sortBy: SortBy; setSortBy: (s: SortBy) => void }) => {
  const { tip, onCloseAutoFocus } = useQuietTip();
  return (
    <DropdownMenu modal={false}>
      <Tooltip {...tip}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Sort">
              <ArrowDownUp />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Sort: {SORTS.find(([s]) => s === sortBy)?.[1]}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40" onCloseAutoFocus={onCloseAutoFocus}>
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
};

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
  ["linear", "Linear project"],
];
type TreeGroup = "t3" | "linear";
const TREE_GROUPS: [TreeGroup, string][] = [
  ["t3", "T3 project"],
  ["linear", "Linear project"],
];

/** The Group by choices of the layout. "Linear project" stays disabled until the server holds a working Linear key. */
function GroupItems({
  flat,
  value,
  set,
  linearKey,
}: {
  flat: boolean;
  value: string;
  set: (v: string) => void;
  linearKey: LinearKeyState | undefined;
}) {
  const options: [string, string][] = flat ? GROUPS : TREE_GROUPS;
  return (
    <DropdownMenuRadioGroup value={value} onValueChange={set}>
      {options.map(([g, name]) => (
        <DropdownMenuRadioItem key={g} value={g} disabled={g === "linear" && linearKey !== "ok"}>
          {name}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** The Group by menu: None, Status or Linear project in the flat view, T3 project or Linear project in the tree. */
function GroupMenu(p: {
  flat: boolean;
  value: string;
  set: (v: string) => void;
  linearKey: LinearKeyState | undefined;
}) {
  const { tip, onCloseAutoFocus } = useQuietTip();
  const name = (p.flat ? GROUPS : TREE_GROUPS).find(([g]) => g === p.value)?.[1];
  return (
    <DropdownMenu modal={false}>
      <Tooltip {...tip}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Group by">
              <Rows3 />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Group by: {name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40" onCloseAutoFocus={onCloseAutoFocus}>
        <GroupItems {...p} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone-width header menu: Sort, Layout, Group by, then fold all in the tree. */
function ViewMenu({
  sortBy,
  setSortBy,
  layout,
  setLayout,
  group,
  setGroup,
  linearKey,
  inner,
  closed,
  fold,
}: {
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
  group: string;
  setGroup: (g: string) => void;
  linearKey: LinearKeyState | undefined;
  inner: string[];
} & Omit<Fold, "toggle">) {
  const { tip, onCloseAutoFocus } = useQuietTip();
  const flat = layout === "flat";
  const shut = inner.every((id) => !closed.has(id));
  return (
    <DropdownMenu modal={false}>
      <Tooltip {...tip}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Sort and layout">
              <ArrowDownUp />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Sort and layout</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40" onCloseAutoFocus={onCloseAutoFocus}>
        <DropdownMenuLabel>Sort</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          {SORTS.map(([s, name]) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout} onValueChange={(v) => setLayout(v as Layout)}>
          {LAYOUTS.map(([l, name, Icon]) => (
            <DropdownMenuRadioItem key={l} value={l}>
              <Icon />
              {name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <GroupItems flat={flat} value={group} set={setGroup} linearKey={linearKey} />
        {!flat && inner.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => fold(inner, shut)}>{shut ? "Collapse" : "Expand"} all</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

/** An update shows as a dot, and a running install as a progress ring in place of the cog. */
function SettingsButton({
  buttonRef,
  update,
  open,
  toggle,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  update: UpdateState | undefined;
  open: boolean;
  toggle: () => void;
}) {
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
      ref={buttonRef}
      variant={open ? "secondary" : "ghost"}
      size="icon-sm"
      aria-expanded={open}
      aria-label={note ? `Settings, ${note}` : "Settings"}
      title="Settings"
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
          <Settings aria-hidden />
          {dot && (
            <span className={cn("absolute -top-0.5 -right-0.5 size-1.5 rounded-full ring-2 ring-background", dot)} />
          )}
        </span>
      )}
    </Button>
  );
}

/** A bar that collapses away when `show` is false. A `value` of null is indeterminate. */
function ProgressReveal({
  show,
  value,
  label,
  className,
}: {
  show: boolean;
  value: number | null;
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden={!show}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-250 ease-in-out motion-reduce:transition-none",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={className}>
          <Progress value={value} aria-label={label} />
        </div>
      </div>
    </div>
  );
}

/** The version row, with the update state as its hint, and a bar while an install runs. */
function UpdateRow({ update }: { update: UpdateState }) {
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
  const showProgress = bar !== undefined;
  return (
    <div>
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
      <ProgressReveal
        show={showProgress}
        value={bar === undefined ? 100 : bar}
        label="Update progress"
        className="px-3 pb-3"
      />
    </div>
  );
}

const tokenSummary = (conn: Tree["conn"] | undefined) =>
  conn === "no-token" ? "Not set" : conn === "unauthorized" ? "Rejected" : "Connected";
const linearSummary = (l: Tree["linear"]) =>
  l ? [l.workspace, l.teams.join(", ")].filter(Boolean).join(" · ") : "Not set";
const linearFoldValue = (l: Tree["linear"], key: Tree["linearKey"] | undefined) =>
  [l && linearSummary(l), key === "rejected" ? "Key rejected" : key === "ok" ? "Key set" : "Key not set"]
    .filter(Boolean)
    .join(" · ");

/** The Catch-up switch and the Model pick that it runs on. */
function CatchUpFold(p: {
  clis: Offered | null;
  pick: ModelPick | undefined;
  on: boolean | undefined;
  setPick: (c: ModelPick) => void;
  setOn: (on: boolean) => void;
  openLocal: () => void;
}) {
  const { text, tone } = foldValue(p.clis, p.pick, p.on);
  return (
    <Fold
      label="Catch-up"
      value={text}
      tone={tone}
      action={
        p.clis && p.clis.length > 0 ? (
          <Switch aria-label="Catch-up" checked={p.on === true} onCheckedChange={p.setOn} />
        ) : undefined
      }
    >
      {p.clis?.length === 0 && (
        <div className="grid justify-items-start gap-1">
          <p className={cn(HINT, "m-0")}>
            No logged-in claude or codex CLI and no Local model. The Catch-up has no model to run.
          </p>
          <Button variant="link" size="xs" className="px-0" onClick={p.openLocal}>
            Set up a Local model
          </Button>
        </div>
      )}
      {p.clis && p.clis.length > 0 && (
        <div className="grid gap-3">
          <RadioGroup
            aria-label="Model"
            value={p.pick ?? ""}
            onValueChange={(v) => p.setPick(v as ModelPick)}
            disabled={p.on !== true}
            className="gap-2"
          >
            {p.clis.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <RadioGroupItem id={`catch-up-${c.id}`} value={c.id} />
                <Label htmlFor={`catch-up-${c.id}`} className="gap-2 text-[13px] font-normal">
                  <ProviderIcon cli={c.id} className="size-3.5" />
                  {c.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      )}
    </Fold>
  );
}

type PanelProps = LinearProps &
  LabelsProps & {
    close: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
    settled: boolean;
    setSettled: (v: boolean) => void;
    snoozed: boolean;
    setSnoozed: (v: boolean) => void;
    rules: Rule[];
    setRules: Dispatch<SetStateAction<Rule[]>>;
    linearOn: boolean;
    statusText: boolean;
    setStatusText: (v: boolean) => void;
    keyHints: boolean;
    setKeyHints: (v: boolean) => void;
    projectNames: boolean;
    setProjectNames: (v: boolean) => void;
    canReset: boolean;
    resetOrder: () => void;
    theme: Theme;
    setTheme: (t: Theme) => void;
    update: UpdateState | undefined;
    conn: Tree["conn"] | undefined;
    linearKey: Tree["linearKey"] | undefined;
    workflowScan: Tree["workflowScan"] | undefined;
    /** Opens the T3 token fold. */
    tokenOpen: boolean;
    /** Opens the Linear links fold. */
    linearOpen: boolean;
    /** Reloads the offered Model picks. */
    reloadModels: () => void;
    clis: Offered | null;
    t3cli: CliStatus | null;
    pick: ModelPick | undefined;
    catchUpOn: boolean | undefined;
    setPick: (c: ModelPick) => void;
    setCatchUp: (on: boolean) => void;
  };

/** View options and settings, beside the list so a change shows at once. */
function SettingsPanel(p: PanelProps) {
  const { close, buttonRef } = p;
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    /** Skips the Escape that cancels a keyboard drag. */
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close();
      }
    };
    addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    return () => {
      removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
    };
  }, [close, buttonRef]);
  useEffect(() => window.desktopBridge?.checkUpdates(false), []);
  const [local, setLocal] = useState<LocalInfo | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  useEffect(() => {
    fetch("/local-model")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<LocalInfo>;
      })
      .then(setLocal, () => setLocal({ config: null, state: "unset" }));
  }, []);
  const [localText, localTone]: [ReactNode, Tone] = local ? LOCAL_FOLD[local.state] : ["Checking…", "none"];
  const token = tokenSummary(p.conn);
  return (
    <aside
      ref={panelRef}
      aria-label="Settings"
      className="fixed top-0 right-0 z-40 flex h-full w-[380px] max-w-full [scrollbar-gutter:stable] flex-col overflow-y-auto border-l bg-card shadow-xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
        <h2 className="m-0 text-[15px] font-semibold">Settings</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={close}>
          <X />
        </Button>
      </div>
      <div className="grid content-start gap-4 p-4">
        {p.update && (
          <SettingsGroup title="Updates" accent={p.update.release !== null && p.update.install === null}>
            <UpdateRow update={p.update} />
          </SettingsGroup>
        )}
        <SettingsGroup title="View">
          <Row label="Show settled threads" htmlFor="settled">
            <Switch id="settled" checked={p.settled} onCheckedChange={p.setSettled} />
          </Row>
          <Row label="Show snoozed threads" htmlFor="snoozed">
            <Switch id="snoozed" checked={p.snoozed} onCheckedChange={p.setSnoozed} />
          </Row>
          <Row label="Show status text in rows" htmlFor="status-text">
            <Switch id="status-text" checked={p.statusText} onCheckedChange={p.setStatusText} />
          </Row>
          <Row label="Show key hints" htmlFor="key-hints">
            <Switch id="key-hints" checked={p.keyHints} onCheckedChange={p.setKeyHints} />
          </Row>
          <Row label="Show project names in rows" htmlFor="project-names">
            <Switch id="project-names" checked={p.projectNames} onCheckedChange={p.setProjectNames} />
          </Row>
          <Row label="Drag-and-drop order">
            <Button variant="outline" size="sm" disabled={!p.canReset} onClick={p.resetOrder}>
              Reset
            </Button>
          </Row>
          <Row label="Theme">
            <ThemeToggle theme={p.theme} setTheme={p.setTheme} />
          </Row>
        </SettingsGroup>
        <GroupingSection rules={p.rules} setRules={p.setRules} linear={p.linearOn} />
        <SettingsGroup title="Setup">
          <Fold label="T3 token" value={token} tone={token === "Connected" ? "ok" : "warn"} defaultOpen={p.tokenOpen}>
            <div className="grid gap-2">
              <p className={cn(HINT, "m-0")}>
                The app reads your threads from T3 with this token. Run this command in a terminal. It issues a token
                and copies it to the clipboard. Then paste it below. Paste a new one at any time to replace it.
              </p>
              <div className="flex items-start gap-1">
                <code className="flex-1 rounded-[6px] bg-muted p-2 text-xs break-all select-all">{TOKEN_CMD}</code>
                <CopyPrompt prompt={TOKEN_CMD} label="Copy command" />
              </div>
              <TokenForm />
              {p.workflowScan && (
                <p className={cn(HINT, "m-0")}>
                  Row menus show no workflows: the app cannot read the workflow files ({p.workflowScan}).
                  {SCOPE_ERROR.test(p.workflowScan) && " Give the token the filesystem:read scope."}
                </p>
              )}
            </div>
          </Fold>
          <Fold
            label="Linear links"
            value={linearFoldValue(p.linear, p.linearKey)}
            tone={p.linearKey === "ok" ? "ok" : "warn"}
            defaultOpen={p.linearOpen}
          >
            <div className="grid gap-3">
              <LinearForm linear={p.linear} setLinear={p.setLinear} />
              <LinearKeyForm />
            </div>
          </Fold>
          <CatchUpFold
            clis={p.clis}
            pick={p.pick}
            on={p.catchUpOn}
            setPick={p.setPick}
            setOn={p.setCatchUp}
            openLocal={() => setLocalOpen(true)}
          />
          <Fold label="Local model" value={localText} tone={localTone} open={localOpen} onOpenChange={setLocalOpen}>
            {local && (
              <LocalModelForm
                config={local.config}
                t3cli={p.t3cli}
                onSaved={(l) => {
                  setLocal(l);
                  p.reloadModels();
                }}
              />
            )}
          </Fold>
          <Fold
            label="Watched labels"
            value={p.labels.length ? p.labels.join(", ") : "None"}
            tone={p.labels.length ? "ok" : "none"}
          >
            <LabelsForm labels={p.labels} setLabels={p.setLabels} />
          </Fold>
          <Fold label="Status icons" value={<span className="sr-only">Legend</span>} tone="info">
            <Legend />
          </Fold>
          <Fold label="Keys" value={<span className="sr-only">Shortcuts</span>} tone="info">
            <Keys />
          </Fold>
        </SettingsGroup>
      </div>
    </aside>
  );
}

/** A failure text that names a missing scope or authorization. */
const SCOPE_ERROR = /scope|authoriz|forbidden|permission/i;

/** The "All / Needs you" filter, stored as "needs" or "all". */
const NEEDS_ONLY: Codec<boolean> = { parse: (raw) => raw === "needs", format: (v) => (v ? "needs" : "all") };
const SKIP: Codec<Skip[]> = { parse: parseSkip, format: (v) => JSON.stringify(v) };

/** Saves the settings with `PUT /model-pick`. Gives the saved Catch-up switch, or `null` when the server did not save them. */
const putPick = (body: { pick?: ModelPick; catchUp?: boolean }) =>
  fetch("/model-pick", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(
    (res) => (res.ok ? (res.json() as Promise<{ catchUp: boolean }>).then((s) => s.catchUp) : null),
    () => null,
  );

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
/** The workspace root of the project block that holds the row. */
const RowProject = createContext<string | undefined>(undefined);
const NeedsOnly = createContext(false);
/** Whether snoozed threads count in the time of a row. */
const ShowSnoozed = createContext(true);
/** Whether rows show the project name next to its icon. */
const ProjectNames = createContext(true);
/** The statuses of the status section that holds the row. Null outside one. */
const Section = createContext<Status[] | null>(null);
const Linear = createContext<Tree["linear"]>(null);
/** The fold state of the tree, for a Map group deep in a row. */
const Folds = createContext<Fold>({ closed: new Set(), toggle: () => {}, fold: () => {} });
/** The label names that rows show as pills, in pill order. */
const Watched = createContext<string[]>([]);
/** The rendered ids of each list, by list key. */
const Lists = createContext(new Map<string, string[]>());
/** No list, so no row is sortable. */
const NO_LISTS = new Map<string, string[]>();

/** One pill for the row's Watched labels: the first name's initials on its color, "+N" for the other names. */
function LabelPill({ t }: { t: ThreadNode }) {
  const pill = labelPill(t, useContext(Watched));
  if (!pill) return null;
  const { label, more, tip } = pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={label.color ? "outline" : "secondary"}
          className={cn(
            "min-w-0 gap-0.5 rounded-full px-1 py-0 font-mono text-[11px] font-medium",
            label.color && "border-transparent",
          )}
          style={label.color ? { background: `#${label.color}`, color: ink(label.color) } : undefined}
          tabIndex={0}
          role="img"
          aria-label={tip}
        >
          <Tag className="size-3" />
          <span className="truncate">{initials(label.name)}</span>
          {more > 0 && <span className="flex-none opacity-70">{`+${more}`}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

const CHIP = "gap-1 rounded-[6px] px-1.5 py-0 text-[11px] font-normal text-muted-foreground";
const ROW_BUTTON =
  "size-5 rounded-[6px] text-muted-foreground motion-reduce:transition-none pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FILTER_ITEM =
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const RowPin = (p: Omit<ComponentProps<typeof PinButton>, "className">) => <PinButton {...p} className={ROW_BUTTON} />;

const Mark = ({ title, children }: { title: string; children: ReactNode }) => (
  <span title={title} className="flex [&>svg]:size-3">
    {children}
  </span>
);

type RefFn = (el: Element | null) => void;
type Sort = { id: string; list: string; index: number; name: string };

/** A unit gets sort props only when its list has two or more units and it is in the list. */
const sortOf = (lists: Map<string, string[]>, list: string, id: string, name: string): Sort | undefined => {
  const part = pinnedList(list);
  const own = lists.get(part)?.includes(id) ? part : list;
  const ids = lists.get(own);
  const index = ids?.indexOf(id) ?? -1;
  return ids && ids.length > 1 && index >= 0 ? { id, list: own, index, name } : undefined;
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

const DragHandle = ({ handleRef, name }: { handleRef?: RefFn; name: string }) =>
  handleRef && (
    <Button
      ref={handleRef}
      variant="ghost"
      size="icon"
      aria-label={`Move ${name}`}
      className={cn(
        ROW_BUTTON,
        "absolute top-1/2 left-0 z-10 w-3 -translate-x-1/2 -translate-y-1/2 pointer-coarse:relative pointer-coarse:inset-auto pointer-coarse:translate-none",
        "pointer-fine:border pointer-fine:bg-card pointer-fine:shadow-sm",
        "cursor-grab opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      <GripVertical className="size-3" />
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
        p.state === "open" && !p.draft && "border-status-working-fg text-status-working-fg",
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

/** Marks the thread as a map thread, or unmarks it. An error shows in the tooltip, like the settle button. */
function MapThreadButton({ t }: { t: ThreadNode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const marked = !!t.detail.mapMarked;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/** A disabled button gets no hover, so the wrapper keeps the tooltip. */}
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="xs"
            className={cn("gap-1.5 text-muted-foreground", err && "text-destructive")}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(undefined);
              const r = await postMapThread(t.id, !marked);
              setBusy(false);
              if (!r.ok) setErr(r.err.error);
            }}
          >
            <MapIcon className={cn("size-3.5", !err && "text-amber-600 dark:text-amber-400")} aria-hidden />
            {marked ? "Unmark map thread" : "Mark as map thread"}
          </Button>
        </span>
      </TooltipTrigger>
      {err && <TooltipContent>{err}</TooltipContent>}
    </Tooltip>
  );
}

function DetailBlock({ t }: { t: ThreadNode }) {
  const now = useContext(Now);
  const d = t.detail;
  const lastRun = lastRunOf(t);
  const limit = [d.limitResetAt && `resets ${hhmm(d.limitResetAt)}`, d.autoResume && "auto-resume"]
    .filter(Boolean)
    .join(" · ");
  const tags = [d.tags.join(", "), d.pinned && "Pinned in T3"].filter(Boolean).join(" · ");
  const last = useLastMessage(t.id, t.updatedAt);
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-1 pl-[156px] text-xs max-[720px]:pl-7">
      {d.request && <Line label="Request">{d.request}</Line>}
      {d.error && (
        <Line label="Error">
          {[[d.error.class, d.error.code].filter(Boolean).join(" · "), d.error.text].filter(Boolean).join(" ")}
        </Line>
      )}
      {last && (
        <Line label="Last message">
          <LastMessage text={last} />
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
        <Line label="Group">
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
      <Line label="Updated">{ago(t.updatedAt, now)}</Line>
      {lastRun > -Infinity && <Line label="Last run">{agoAt(lastRun, now)}</Line>}
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
      {isThread(t) && !t.step && (
        <div className="col-span-2 pt-2">
          <MapThreadButton t={t} />
        </div>
      )}
    </dl>
  );
}

/** The status icon. With status text hidden, a fixed width keeps every row aligned and the Wait sits under the icon. */
function StatusCell({ t, now }: { t: ThreadNode; now: number }) {
  const time = needsYou(t.status) && t.since ? ago(t.since, now) : null;
  return (
    <span className="flex flex-none flex-col items-center justify-center gap-px in-data-[status-text=off]:w-[30px]">
      <StatusIcon t={t} now={now} />
      {time && (
        <span
          className={cn(
            STATUS[t.status].shape,
            "hidden font-mono text-[10px] leading-[11px] font-semibold whitespace-nowrap tabular-nums in-data-[status-text=off]:inline",
          )}
        >
          {time}
        </span>
      )}
    </span>
  );
}

/** The phrase beside the icon on rows that wait on the user, with the Wait; failed rows show the phrase only. Hidden by the status text setting. */
function PhraseCell({ t, now }: { t: ThreadNode; now: number }) {
  if (!isIn(CATCH_UP, t.status)) return null;
  return (
    <span
      className={cn(
        STATUS[t.status].shape,
        "flex-none text-[12px] font-medium whitespace-nowrap in-data-[status-text=off]:hidden",
      )}
    >
      {t.phrase}
      {needsYou(t.status) && t.since && <span className="font-mono tabular-nums"> {ago(t.since, now)}</span>}
    </span>
  );
}

function SettleButton({ t }: { t: ThreadNode }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const label = t.settled ? "Unsettle thread" : "Settle thread";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/** A disabled button gets no hover, so the wrapper keeps the tooltip. */}
        <span className="inline-flex" data-err={err ? "" : undefined} data-busy={busy ? "" : undefined}>
          <Button
            variant="ghost"
            size="icon"
            className={cn(ROW_BUTTON, err && "text-destructive")}
            aria-label={label}
            disabled={busy}
            onClick={async (e) => {
              e.stopPropagation();
              setBusy(true);
              setErr(undefined);
              const r = await postSettle(t.id, !t.settled);
              setBusy(false);
              if (!r.ok) setErr(r.err.error);
            }}
          >
            {t.settled ? <Undo2 className="size-3.5" /> : <CircleCheckBig className="size-3.5" />}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{err ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** The one open row toolbar's close; opening another toolbar shuts it first. */
let openBar: (() => void) | null = null;

/** Grace for the pointer to cross the gap between the `⋯` button and its toolbar. */
const BAR_GRACE_MS = 180;

/**
 * The row's actions in a toolbar that the `⋯` button opens, so hover never changes the row layout.
 * A mouse hover or a click opens it, a tap opens it on touch. The toolbar renders in a portal, outside the row's stacking context.
 */
function RowActions({ t, projectPath }: { t: ThreadNode; projectPath?: string }) {
  const sendTo = useContext(SendTo);
  const [open, setOpen] = useState(false);
  const byKey = useRef(false);
  const timer = useRef<number>(undefined);
  const bar = useRef<HTMLDivElement>(null);
  const [close] = useState(() => {
    const fn = () => {
      clearTimeout(timer.current);
      setOpen(false);
      if (openBar === fn) openBar = null;
    };
    return fn;
  });
  useEffect(() => () => close(), [close]);
  const show = () => {
    clearTimeout(timer.current);
    if (openBar && openBar !== close) openBar();
    openBar = close;
    setOpen(true);
  };
  const openOnHover = (e: { pointerType: string }) => {
    if (e.pointerType !== "mouse") return;
    byKey.current = false;
    show();
  };
  /** A nested menu, a settle in flight or a settle error keeps the toolbar open. */
  const closeSoon = (e: { pointerType: string }) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!bar.current?.querySelector("[data-state=open], [data-busy], [data-err]")) close();
    }, BAR_GRACE_MS);
  };
  return (
    <Popover.Root open={open} onOpenChange={(o) => (o ? show() : close())}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={ROW_BUTTON}
          aria-label="Row actions"
          onPointerEnter={openOnHover}
          onPointerLeave={closeSoon}
          onClick={(e) => {
            byKey.current = e.detail === 0;
          }}
        >
          <MorphIcon icon={open ? XGlyph : Ellipsis} size={14} reducedMotion="user" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={bar}
          side="left"
          align="center"
          sideOffset={2}
          collisionPadding={8}
          onOpenAutoFocus={(e) => {
            if (!byKey.current) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => {
            if (!byKey.current) e.preventDefault();
          }}
          onPointerEnter={openOnHover}
          onPointerLeave={closeSoon}
          /** The toolbar sits in a portal, so Tab out of either end closes it and returns focus to `⋯`. */
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)")];
            if (e.target !== items[e.shiftKey ? 0 : items.length - 1]) return;
            e.preventDefault();
            byKey.current = true;
            close();
          }}
          className="z-50 flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          <SettleButton key={String(t.settled)} t={t} />
          {sendTo && (
            <CliGate t3cli={sendTo.t3cli}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={ROW_BUTTON}
                    aria-label="Send message"
                    disabled={sendTo.t3cli?.available === false}
                    onClick={(e) => {
                      e.stopPropagation();
                      sendTo.open(t.id);
                    }}
                  >
                    <Send className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </CliGate>
          )}
          <StartMenu
            point={{ kind: "row", threadId: t.id, prs: prChoices(t.prs) }}
            project={projectPath}
            forTitle={t.title || t.id}
            className={ROW_BUTTON}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * `inStack`: the row sits on a stack rail, which holds no drag handles and shows the stack itself.
 * `project` adds the Project column and project edge of the flat list, `corners` holds the classes of the row edge, `review` the eye.
 */
function ThreadRow({
  t,
  chip,
  block,
  sort,
  inStack,
  project,
  corners,
  review,
  nested,
  end,
  handle,
  pin,
}: {
  t: ThreadNode;
  /** The node whose block gives the row time. Defaults to the row. */
  block?: ThreadNode;
  chip?: string;
  sort?: Sort;
  /** Replaces the details fold. A Map group puts its member count and fold here. */
  end?: ReactNode;
  /** Replaces the drag handle: the Map group owns the drag. */
  handle?: ReactNode;
  /** Replaces the Pin button: the Map group or a key group of one thread owns the pin. */
  pin?: ReactNode;
  inStack?: boolean;
  /** The row sits on a run rail: no drag handle, but the stack badge stays. */
  nested?: boolean;
  project?: Group;
  corners?: string;
  review?: boolean;
}) {
  const now = useContext(Now);
  const time = blockTime(block ?? t, useContext(ShowSnoozed));
  const { open, toggle, show } = useContext(Details);
  const section = useContext(Section);
  const projectNames = useContext(ProjectNames);
  const dim = (useContext(NeedsOnly) && !needsYou(t.status)) || (section !== null && isContext(t, section));
  const linear = useContext(Linear);
  const sendTo = useContext(SendTo);
  const rowProject = useContext(RowProject);
  const projectPath = project?.path ?? rowProject;
  const chipHref = chip ? linearHref(chip, linear) : null;
  const pulse = useChanges(t.status);
  const noPrLabel = t.stack ? `PR stack · ${t.stack.total} PRs · no PR from this thread` : undefined;
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={!end && open.has(t.id)} onOpenChange={() => toggle(t.id)}>
      <li
        ref={ref}
        className={cn("my-px", project && "border-l-[3px] pl-1", corners)}
        style={{ viewTransitionName: vtName("t", t.id), borderLeftColor: project && projectHex(project.label) }}
      >
        <div
          className="thread-row group/row flex min-h-9 min-w-0 items-center gap-x-2 rounded-[8px] px-2 py-1 text-[13px] leading-5 max-[720px]:flex-wrap"
          data-status={t.status}
          data-thread={t.id}
        >
          {handle ?? (!inStack && !nested && <DragHandle handleRef={handleRef} name={t.title || t.id} />)}
          <StatusCell t={t} now={now} />
          <PhraseCell t={t} now={now} />
          <span
            aria-hidden
            data-hint="row"
            className="key-hint -top-3 right-8 items-center gap-2 rounded-md border bg-popover px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm"
          >
            <span className="flex items-center gap-1">
              <Kbd>o</Kbd> Details
            </span>
            {sendTo && sendTo.t3cli?.available !== false && (
              <span className="flex items-center gap-1">
                <Kbd>s</Kbd> Send
              </span>
            )}
            {block?.map?.key && (
              <span className="flex items-center gap-1">
                <Kbd>g</Kbd> Graph
              </span>
            )}
          </span>
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
          {t.t3Project && (
            <Badge
              variant={projectNames ? "outline" : "ghost"}
              className={cn(CHIP, "flex-none max-[720px]:border-transparent")}
              title={projectNames ? t.t3Project.label : undefined}
            >
              <ProjectTip name={t.t3Project.label} />
              {projectNames && <span className="max-[720px]:hidden">{t.t3Project.label}</span>}
            </Badge>
          )}
          {review && <Eye className="size-3.5 flex-none text-review" aria-label="Review" />}
          <CatchUpTitle t={t}>
            <a
              className={cn(
                "min-w-0 flex-1 break-words hover:underline",
                t.status === "your-turn" ? "font-[650]" : "font-medium",
                (t.status === "snoozed" || t.settled || dim) && "text-muted-foreground",
                "max-[720px]:basis-full max-[720px]:pl-5",
              )}
              href={t.href}
              data-stop={t.id}
            >
              {(chip ? stripKey(t.title, chip) : t.title) || t.id}
            </a>
          </CatchUpTitle>
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
            {t.stack &&
              !inStack &&
              (t.stack.pos ? (
                <Badge variant="outline" className={cn(CHIP, "chip-stack")} title="PR stack">
                  <Layers />
                  {`${t.stack.pos}/${t.stack.total}`}
                </Badge>
              ) : (
                <Badge variant="outline" className={cn(CHIP, "chip-stack")} title={noPrLabel}>
                  <Layers role="img" aria-label={noPrLabel} />
                </Badge>
              ))}
            <LabelPill t={t} />
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
            {time.by && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {agoAt(time.at, now)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{ageTip(t, time)}</TooltipContent>
              </Tooltip>
            )}
            {pin ?? (!inStack && !nested && <RowPin id={pinIdOf(t)} stop={t.id} name={t.title || t.id} />)}
            <RowActions t={t} projectPath={projectPath} />
            {end ?? (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className={cn(ROW_BUTTON, "group")} aria-label="Details">
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                </Button>
              </CollapsibleTrigger>
            )}
          </span>
        </div>
        <CollapsibleContent>
          <DetailBlock t={t} />
        </CollapsibleContent>
        {t.children.length > 0 && (
          <ul className="m-0 list-none pl-2.5">
            <Presence items={t.children} keyOf={(c) => c.id}>
              {(c) => <NodeRow t={c} inStack={inStack} pin={false} />}
            </Presence>
          </ul>
        )}
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** The PR stack rail of consecutive members in a Map group: it folds through its dots and piles, with no drag. */
function MapRail({ run }: { run: Group[] }) {
  const { closed, toggle, fold } = useContext(Folds);
  return <StackRail run={run} flat closed={closed} toggle={toggle} fold={fold} />;
}

/** A Map group renders as a map rail, a run node as a run row, any other node as a thread row. */
function NodeRow(p: ComponentProps<typeof ThreadRow>) {
  const now = useContext(Now);
  const section = useContext(Section);
  const { closed, toggle } = useContext(Folds);
  const { t, sort, inStack, nested, project, corners } = p;
  const snoozed = useContext(ShowSnoozed);
  if (t.map)
    return (
      <Sortable sort={sort}>
        {(ref, handleRef) => (
          <MapGroup
            t={t}
            chip={p.chip}
            tip={headerTip(blockTime(t, snoozed))}
            project={project}
            open={!closed.has(t.id)}
            toggle={() => toggle(t.id)}
            section={section}
            Row={NodeRow}
            Rail={MapRail}
            liRef={ref}
            liClass={cn(project && "border-l-[3px] pl-1", corners)}
            liStyle={{
              /** A map thread row names its own transition; two elements with one name abort it. */
              viewTransitionName: t.map!.header ? vtName("t", t.id) : undefined,
              borderLeftColor: project && projectHex(project.label),
            }}
            handle={!inStack && !nested && <DragHandle handleRef={handleRef} name={t.map!.name} />}
            pin={p.pin ?? (!inStack && !nested && <RowPin id={pinIdOf(t)} stop={t.id} name={t.map!.name} />)}
          />
        )}
      </Sortable>
    );
  if (!t.run) return <ThreadRow {...p} />;
  return (
    <Sortable sort={sort}>
      {(ref, handleRef) => (
        <RunRow
          t={t}
          now={now}
          at={blockTime(t, snoozed).at}
          Row={NodeRow}
          liRef={ref}
          liClass={cn(project && "border-l-[3px] pl-1", corners)}
          liStyle={{ viewTransitionName: vtName("t", t.id), borderLeftColor: project && projectHex(project.label) }}
          handle={!inStack && !nested && <DragHandle handleRef={handleRef} name={t.title || t.id} />}
          pin={p.pin ?? (!inStack && !nested && <RowPin id={pinIdOf(t)} stop={t.id} name={t.title || t.id} />)}
        />
      )}
    </Sortable>
  );
}

/** The project icon, with the name as a tooltip while rows hide project names. */
const ProjectTip = ({ name }: { name: string }) =>
  useContext(ProjectNames) ? (
    <ProjectIcon name={name} />
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex flex-none">
          <ProjectIcon name={name} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );

/** The project icon and name of a flat row. Phone widths show the icon only. */
const ProjectColumn = ({ b }: { b: Group }) => {
  const names = useContext(ProjectNames);
  return (
    <span
      className={cn("flex min-w-0 flex-none items-center gap-1.5", names && "max-w-32")}
      title={names ? (b.repo ?? b.label) : undefined}
    >
      <ProjectTip name={b.label} />
      {names && <span className="truncate text-xs text-muted-foreground max-[720px]:hidden">{b.label}</span>}
    </span>
  );
};

const Chevron = ({ open }: { open: boolean }) => (
  <ChevronRight
    className={cn(
      "size-3.5 flex-none text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
      open && "rotate-90",
    )}
  />
);

/** One status icon for each thread of a closed branch, in tree order. */
const Icons = ({ b }: { b: Group }) => (
  <span className="relative z-10 inline-flex flex-wrap items-center gap-[3px]">
    {allThreads(b).map((t) => (
      <StatusIcon key={t.id} t={t} />
    ))}
  </span>
);

/** A status icon and a number for each status group of a closed branch. */
function Counts({ groups }: { groups: ReturnType<typeof closedCounts> }) {
  const tip = groups.map((g) => `${g.n} ${g.label}`).join(", ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={tip}
          className="relative z-10 inline-flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums"
        >
          {groups.map((g) => (
            <span key={g.label} className="inline-flex items-center gap-0.5">
              <LegendIcon status={g.status} phrase="" />
              {g.n}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Counts for large closed groups, or one icon per thread for smaller groups. */
function ClosedSummary({ b }: { b: Group }) {
  const counts = closedCounts(allThreads(b));
  return counts.length > 0 ? <Counts groups={counts} /> : <Icons b={b} />;
}

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

/** The subgroups of a branch: a PR stack run shows as a rail, any other group as a row. */
function Groups({ b, closed, toggle, fold }: { b: Group } & Fold) {
  const lists = useContext(Lists);
  return (
    <Presence items={stackRuns(b.groups)} keyOf={(run) => (run[0].stack ? `rail:${run[0].id}` : run[0].id)}>
      {(run) => {
        const sort = sortOf(
          lists,
          groupsKey(b.id),
          runUnitId(b.id, run),
          run[0].stack
            ? `PR stack of ${run[0].label}`
            : run[0].kind === "loose"
              ? run[0].threads[0].title || run[0].threads[0].id
              : run[0].label,
        );
        return run[0].stack ? (
          <StackRail run={run} closed={closed} toggle={toggle} fold={fold} sort={sort} pinId={runUnitId(b.id, run)} />
        ) : (
          <GroupRow b={run[0]} closed={closed} toggle={toggle} fold={fold} sort={sort} />
        );
      }}
    </Presence>
  );
}

function GroupRow({ b, closed, toggle, fold, sort }: { b: Group; sort?: Sort } & Fold) {
  const open = !closed.has(b.id);
  const one = folded(b);
  const linear = useContext(Linear);
  const lists = useContext(Lists);
  const groupHref = isKeyGroup(b) ? linearHref(b.label, linear) : null;
  const snoozed = useContext(ShowSnoozed);
  const tip = b.linear ? undefined : headerTip(groupTime([b], snoozed));
  if (one)
    return (
      <NodeRow
        t={one}
        chip={b.label}
        sort={sort}
        pin={b.kind === "loose" ? undefined : <RowPin id={b.id} stop={one.id} name={one.title || one.id} />}
      />
    );
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
      <li ref={ref} className="my-px">
        <div
          className="group/row relative flex h-7 min-w-0 items-center gap-2 rounded-[8px] px-2 hover:bg-accent max-[720px]:h-auto max-[720px]:min-h-7 max-[720px]:flex-wrap"
          title={tip}
          data-waiting={!open && waits(b) ? "" : undefined}
        >
          <DragHandle handleRef={handleRef} name={b.label} />
          <CollapsibleTrigger
            data-stop={b.id}
            className="flex min-w-0 items-center gap-2 select-none after:absolute after:inset-0 max-[720px]:min-h-11"
          >
            <Chevron open={open} />
            {b.kind === "review" && <Eye className="size-3.5 flex-none text-review" aria-hidden />}
            <span
              className={cn(
                "truncate text-xs font-semibold",
                b.kind === "review" ? "text-review" : isKeyGroup(b) ? "font-mono" : "text-muted-foreground",
              )}
            >
              {b.label}
            </span>
            {b.linear && (
              <span className="flex-none text-[11px] font-normal text-muted-foreground tabular-nums">
                {b.linear.date && `${shortDate(b.linear.date)} · `}
                {allThreads(b).length}
              </span>
            )}
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
          {!open && <ClosedSummary b={b} />}
          {b.kind !== "milestone" && <RowPin id={b.id} stop={b.id} name={b.label} />}
          <FoldAll inner={foldIds(b)} self={b.id} name={b.label} closed={closed} fold={fold} className={ROW_FOLD} />
        </div>
        <CollapsibleContent asChild>
          <ul className={cn("m-0 list-none", b.kind === "review" ? "pl-6" : "pl-2.5")}>
            <Groups b={b} closed={closed} toggle={toggle} fold={fold} />
            <Presence items={b.threads} keyOf={(t) => t.id}>
              {(t) => (
                <NodeRow
                  t={t}
                  chip={b.linear ? (t.key ?? undefined) : undefined}
                  sort={sortOf(lists, threadsKey(b.id), threadUnitId(t), t.title || t.id)}
                />
              )}
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
  merged,
  bare,
  onClick,
  label,
}: {
  y: number;
  color: string;
  above: boolean;
  below: boolean;
  n?: number;
  /** An unnumbered stop whose PR is merged: a filled merge-colored dot. */
  merged?: boolean;
  /** Line segments only, with no dot. */
  bare?: boolean;
  /** Makes the dot a button named `label`. The line segments stay inert. */
  onClick?: () => void;
  label?: string;
}) {
  const line = `color-mix(in oklch, ${color} 45%, transparent)`;
  const dotProps = {
    className: cn(
      "absolute flex -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-background",
      n
        ? "left-px size-[18px]"
        : merged
          ? "left-1 size-3 bg-pr-merged"
          : "left-1 size-3 border-2 border-muted-foreground bg-card",
      onClick &&
        "pointer-events-auto cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    ),
    style: { top: y, background: n ? color : undefined },
  };
  return (
    <span className="pointer-events-none absolute inset-y-0 left-0 w-5">
      {above && (
        <span aria-hidden className="absolute left-[9px] w-0.5" style={{ top: 0, height: y, background: line }} />
      )}
      {below && (
        <span aria-hidden className="absolute bottom-0 left-[9px] w-0.5" style={{ top: y, background: line }} />
      )}
      {!bare &&
        (onClick ? (
          <button type="button" aria-label={label} onClick={onClick} {...dotProps}>
            {n}
          </button>
        ) : (
          <span aria-hidden {...dotProps}>
            {n}
          </span>
        ))}
    </span>
  );
}

/** Up to 4 overlapping dots, one per PR in `tones`, and a caption with the count. */
function PileButton({
  tones,
  caption,
  label,
  expanded,
  merged,
  rail,
  onClick,
}: {
  tones: string[];
  caption: string;
  label: string;
  expanded?: boolean;
  merged?: boolean;
  /** In a rail body: the dots stack on the rail line, inside the gutter. */
  rail?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full text-muted-foreground hover:text-foreground max-[720px]:min-h-11",
        rail && "relative -ml-6 self-stretch pl-6",
      )}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span
        aria-hidden
        className={cn("inline-flex items-center", rail && "absolute top-1/2 left-1 -translate-y-1/2 flex-col")}
      >
        {tones.slice(0, 4).map((tone, i) => (
          <span
            key={i}
            className={cn(
              "size-3 rounded-full border-2 border-card",
              rail ? "-mt-1.5 first:mt-0" : "-ml-1.5 first:ml-0",
            )}
            style={{ background: tone }}
          />
        ))}
      </span>
      <span
        className={cn(
          "rounded-full border px-1.5 text-[10px] font-semibold",
          merged ? "border-pr-merged/50 text-pr-merged" : "border-border",
        )}
      >
        {caption}
      </span>
    </button>
  );
}

/** "Copied stack #N" for 2 s. */
function CopiedToast({ number, onClose }: { number: number; onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => closeRef.current(), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-md"
    >
      Copied stack #{number}
    </div>
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
  fold,
  sort,
  flat,
  project,
  className,
  pinId,
}: { run: Group[]; sort?: Sort; flat?: boolean; project?: Group; className?: string; pinId?: string } & Fold) {
  const { id, total, base, number } = run[0].stack!;
  const [copies, setCopies] = useState(0);
  const lastCopy = useRef(0);
  const copy = () => {
    if (Date.now() - lastCopy.current < 1000) return;
    lastCopy.current = Date.now();
    navigator.clipboard.writeText(String(number)).then(
      () => setCopies((c) => c + 1),
      () => {},
    );
  };
  const open = !closed.has(`rail:${id}`);
  const { stops, rows: allRows } = railRows(run);
  const section = useContext(Section);
  const [showOther, setShowOther] = useState(false);
  const hidden = section ? allRows.filter((r) => folds(r.t, section)) : [];
  const rows = showOther ? allRows : allRows.filter((r) => !hidden.includes(r));
  const numbered = stops.filter((s) => s.n).length;
  const partial = numbered < total;
  const mergedOpen = !closed.has(`merged:${id}`);
  const mergedRows = rows.filter(isMergedRow);
  const prCount = total + mergedRows.length;
  const openStops = stops.filter((s) => !isMergedStop(s));
  const view = railView(rows, { open, mergedOpen });
  const showAll = () => fold([`rail:${id}`, `merged:${id}`], false);
  /**
   * ponytail: fixed threshold; measure fit with a ResizeObserver if a fixed count proves too coarse.
   */
  const overlap = openStops.length > 3;
  const tip = headerTip(groupTime(run, useContext(ShowSnoozed)));
  const rowProject = useContext(RowProject);
  const projectPath = project?.path ?? rowProject;
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <Collapsible asChild open={open} onOpenChange={() => toggle(`rail:${id}`)}>
      <li
        ref={ref}
        className={cn(
          "relative my-1 rounded-[10px] border border-dashed border-border",
          project && "border-l-[3px]",
          className,
        )}
        style={{
          viewTransitionName: vtName("s", run[0].id),
          borderLeftColor: project && projectHex(project.label),
          borderLeftStyle: project && "solid",
        }}
      >
        <div
          className="group/row relative flex min-h-7 flex-wrap items-center gap-2 rounded-[10px] px-2 text-xs"
          title={tip}
          data-waiting={!open && run.some(waits) ? "" : undefined}
        >
          <DragHandle handleRef={handleRef} name={`PR stack of ${run[0].label}`} />
          {flat ? (
            <span className="flex items-center text-muted-foreground" title={`PR stack · ${prCount} PRs`}>
              <Layers className="size-3.5" aria-label={`PR stack · ${prCount} PRs`} />
            </span>
          ) : (
            <CollapsibleTrigger
              data-stop={`rail:${id}`}
              className="flex items-center gap-1 text-muted-foreground select-none after:absolute after:inset-0 max-[720px]:min-h-11"
              aria-label={`PR stack · ${prCount} PRs`}
              title={`PR stack · ${prCount} PRs`}
            >
              <Chevron open={open} />
              <Layers className="size-3.5" aria-hidden />
            </CollapsibleTrigger>
          )}
          {project && <ProjectColumn b={project} />}
          <span className="group/stops relative z-10 inline-flex flex-wrap items-center gap-y-1">
            {base && (
              <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {base}
              </code>
            )}
            {mergedRows.length > 0 && (
              <PileButton
                merged
                tones={mergedRows.map(() => "var(--pr-merged)")}
                caption={`${mergedRows.length} merged`}
                label={`${open && mergedOpen ? "Hide" : "Show"} ${mergedRows.length} merged PRs`}
                expanded={open && mergedOpen}
                onClick={open ? () => toggle(`merged:${id}`) : showAll}
              />
            )}
            {openStops.map(({ id: stopId, label, p, n }, i) => (
              <span key={stopId} className="inline-flex items-center">
                {(i > 0 || base || mergedRows.length > 0) && (
                  <span
                    className={cn(
                      "h-0.5 w-4 transition-[margin,width] motion-reduce:transition-none",
                      overlap && i > 0 && "w-0 group-focus-within/stops:w-4 group-hover/stops:w-4",
                    )}
                    style={{ background: prTone(p) }}
                  />
                )}
                <a
                  href={p?.url}
                  target="_blank"
                  rel="noreferrer"
                  title={n ? `${n} of ${total} · ${label}` : label}
                  className={cn(
                    "relative z-10 inline-flex items-center gap-1 rounded-full border bg-card px-1.5 py-px font-mono text-[11px] transition-[margin,width] hover:underline motion-reduce:transition-none",
                    overlap && i > 0 && "-ml-2.5 group-focus-within/stops:ml-0 group-hover/stops:ml-0",
                    p?.draft && "border-dashed",
                  )}
                  style={{ borderColor: prTone(p) }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: prTone(p) }} />
                  {stopLabel(n, p?.n)}
                </a>
              </span>
            ))}
            {partial && (
              <span
                className="ml-1.5 text-[11px] text-muted-foreground"
                title={`${total - numbered} PRs of this stack are not shown`}
              >
                +{total - numbered}
              </span>
            )}
          </span>
          <StartMenu
            point={stackPoint(stops.flatMap((s) => s.p ?? []))}
            project={projectPath}
            className="relative z-10 size-6 text-muted-foreground"
          />
          {(pinId || hidden.length > 0 || number) && (
            <span className="relative z-10 ml-auto flex items-center gap-2">
              {pinId && <RowPin id={pinId} stop={`rail:${id}`} name={`PR stack of ${run[0].label}`} />}
              {hidden.length > 0 && (
                <button
                  type="button"
                  className="rounded-full border border-dashed px-2 py-px text-[11px] text-muted-foreground hover:text-foreground max-[720px]:min-h-11"
                  aria-expanded={showOther}
                  onClick={() => setShowOther(!showOther)}
                >
                  {showOther ? "Hide " : "+"}
                  {hidden.length} other {hidden.length === 1 ? "thread" : "threads"}
                </button>
              )}
              {number && (
                <button
                  type="button"
                  className="rounded-full border px-2 py-px font-mono text-[11px] text-muted-foreground hover:text-foreground max-[720px]:min-h-11"
                  title="Copy stack number"
                  onClick={copy}
                >
                  #{number}
                </button>
              )}
            </span>
          )}
          {copies > 0 && <CopiedToast key={copies} number={number!} onClose={() => setCopies(0)} />}
        </div>
        {view.length > 0 && (
          <ul className="m-0 list-none p-0 pb-1 pl-1">
            <Presence items={view} keyOf={(it) => (it.kind === "pile" ? `pile:${it.what}` : it.row.t.id)}>
              {(item) => {
                const line = { y: 18, above: item !== view[0], below: item !== view.at(-1) };
                if (item.kind === "pile") {
                  const merged = item.what === "merged";
                  const count = item.rows.length;
                  return (
                    <li className="relative flex min-h-9 items-center pl-6">
                      <RailNode {...line} color="var(--muted-foreground)" bare />
                      <PileButton
                        rail
                        merged={merged}
                        tones={item.rows.map((r) => (merged ? "var(--pr-merged)" : prTone(r.stop.p)))}
                        caption={`${count} ${item.what}`}
                        label={`Show ${count} ${merged ? "merged" : "more"} PRs`}
                        onClick={showAll}
                      />
                    </li>
                  );
                }
                const r = item.row;
                return (
                  <li className="relative pl-6">
                    <RailNode
                      {...line}
                      color={prTone(r.stop.p)}
                      n={r.n}
                      merged={isMergedRow(r)}
                      {...(isMergedRow(r)
                        ? { onClick: () => toggle(`merged:${id}`), label: "Collapse merged PRs" }
                        : {
                            onClick: () => toggle(`rail:${id}`),
                            label: open ? "Collapse PR stack" : "Expand PR stack",
                          })}
                    />
                    <ul className="m-0 list-none p-0">
                      <ThreadRow t={r.t} chip={r.chip} inStack />
                    </ul>
                  </li>
                );
              }}
            </Presence>
          </ul>
        )}
      </li>
    </Collapsible>
  );
  return <Sortable sort={sort}>{render}</Sortable>;
}

/** Rounds the ends of a flat thread row's project edge, except where the row next to it continues that edge. */
const edgeCorners = (items: FlatItem[], i: FlatItem) => {
  const at = items.findIndex((x) => x.id === i.id);
  const joins = (o?: FlatItem) =>
    at >= 0 && i.kind === "thread" && o?.kind === "thread" && o.project.id === i.project.id;
  return cn(!joins(items[at - 1]) && "rounded-tl-[8px]", !joins(items[at + 1]) && "rounded-bl-[8px]");
};

/** A flat-list item: a status section header, a thread row or a PR stack. */
function FlatRow({
  i,
  corners,
  linear,
  section,
  closed,
  toggle,
  fold,
  toggleSection,
}: {
  i: FlatItem;
  corners: string;
  linear: boolean;
  section: Status[] | null;
  toggleSection: (key: string) => void;
} & Fold) {
  const lists = useContext(Lists);
  /** The section list that holds the unit, or the whole flat list when ungrouped. */
  const list =
    [...lists.keys()].find((k) => k !== FLAT && k !== pinnedList(FLAT) && lists.get(k)?.includes(i.id)) ?? FLAT;
  /** Rows under a Linear section header sit one chevron to the right of it. */
  const indent = linear && i.kind !== "section" && i.project.kind !== "loose" ? "ml-6" : undefined;
  if (i.kind === "thread")
    return (
      <Section value={section}>
        <NodeRow
          t={i.t}
          chip={i.t.key ?? undefined}
          project={i.project.kind === "project" ? i.project : undefined}
          corners={indent ?? corners}
          review={i.review}
          sort={sortOf(lists, list, i.id, i.t.title || i.t.id)}
        />
      </Section>
    );
  if (i.kind === "stack")
    return (
      <Section value={section}>
        <StackRail
          run={i.run}
          project={i.project.kind === "project" ? i.project : undefined}
          flat
          className={indent}
          closed={closed}
          toggle={toggle}
          fold={fold}
          sort={sortOf(lists, list, i.id, `PR stack of ${i.run[0].label}`)}
          pinId={i.id}
        />
      </Section>
    );
  if (i.loose) return <li aria-hidden className="mx-2 my-1 border-t" />;
  return (
    <MotionHook>
      {(ref) => (
        <li ref={ref} style={{ viewTransitionName: vtName("sec", i.key) }}>
          <button
            type="button"
            aria-expanded={i.open}
            data-stop={`sec:${i.key}`}
            onClick={() => toggleSection(i.key)}
            className="flex h-7 w-full items-center gap-2 rounded-[8px] px-2 text-xs font-semibold text-muted-foreground select-none hover:bg-accent max-[720px]:min-h-11"
          >
            <Chevron open={i.open} />
            {i.label}
            {i.date && <span className="font-normal">· {shortDate(i.date)}</span>}
            <span className="font-normal tabular-nums">{i.count}</span>
          </button>
        </li>
      )}
    </MotionHook>
  );
}

/** A project as one block of the shared list: a one-line header, then its groups. */
function ProjectBlock({ b, closed, toggle, fold }: { b: Group } & Fold) {
  const open = !closed.has(b.id);
  const lists = useContext(Lists);
  const snoozed = useContext(ShowSnoozed);
  const reviewsTip = b.kind === "review" ? headerTip(groupTime([b], snoozed)) : undefined;
  const fallback = b.kind === "review" || b.kind === "no-project";
  const color = fallback || b.kind === "loose" ? "var(--border)" : projectHex(b.label);
  if (b.kind === "loose") {
    const one = folded(b);
    const sort = sortOf(lists, PROJECTS, b.id, one ? one.title || one.id : `PR stack of ${b.groups[0].label}`);
    return (
      <li className="border-l-[3px] px-1 py-1" style={{ borderLeftColor: color }}>
        <ul className="m-0 list-none p-0">
          {one ? (
            <NodeRow t={one} chip={one.key ?? undefined} sort={sort} />
          ) : (
            <StackRail run={b.groups} closed={closed} toggle={toggle} fold={fold} sort={sort} pinId={b.id} />
          )}
        </ul>
      </li>
    );
  }
  const render = (ref: RefFn, handleRef?: RefFn) => (
    <li ref={ref} className="border-l-[3px] not-last:border-b" style={{ borderLeftColor: color }}>
      <Collapsible asChild open={open} onOpenChange={() => toggle(b.id)}>
        <div>
          <div
            className="group/row sticky top-0 z-20 flex h-8 min-w-0 items-center gap-1.5 bg-card px-2 max-[720px]:h-auto max-[720px]:min-h-8"
            title={reviewsTip}
            data-waiting={!open && waits(b) ? "" : undefined}
          >
            <DragHandle handleRef={handleRef} name={b.label} />
            <CollapsibleTrigger
              data-stop={b.id}
              className="flex min-w-0 items-center gap-1.5 select-none after:absolute after:inset-0"
            >
              <Chevron open={open} />
              {b.kind === "review" && <Eye className="size-3.5 flex-none text-review" aria-hidden />}
              {!fallback && <ProjectIcon name={b.label} />}
              <span className="min-w-0 truncate text-[13px] font-semibold" title={b.repo ?? b.label}>
                {b.label}
              </span>
              {b.linear && (
                <span className="flex-none text-[11px] font-normal text-muted-foreground tabular-nums">
                  {allThreads(b).length}
                </span>
              )}
            </CollapsibleTrigger>
            {b.linear?.url && (
              <a
                href={b.linear.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${b.label} in Linear`}
                title="Open in Linear"
                className="relative z-10 flex-none text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {!open && <ClosedSummary b={b} />}
            <RowPin id={b.id} stop={b.id} name={b.label} />
            <FoldAll inner={foldIds(b)} self={b.id} name={b.label} closed={closed} fold={fold} className={ROW_FOLD} />
          </div>
          <div className="min-w-0 px-1 pb-1">
            <CollapsibleContent asChild>
              <ul className="m-0 list-none p-0">
                <Groups b={b} closed={closed} toggle={toggle} fold={fold} />
              </ul>
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </li>
  );
  return (
    <RowProject value={b.path}>
      <Sortable sort={sortOf(lists, PROJECTS, b.id, b.label)}>{render}</Sortable>
    </RowProject>
  );
}

/** The map head with this id in the raw tree, so the filters never drop a member from its graph. */
const mapHead = (groups: Group[], id: string): ThreadNode | undefined => {
  const down = (t: ThreadNode): ThreadNode | undefined =>
    t.id === id && t.map?.key ? t : t.children.map(down).find(Boolean);
  const inGroup = (g: Group): ThreadNode | undefined =>
    g.threads.map(down).find(Boolean) ?? g.groups.map(inGroup).find(Boolean);
  return groups.map(inGroup).find(Boolean);
};

const KEYS: [keys: string, action: string][] = [
  ["j k ↑ ↓", "Move"],
  ["Enter", "Open"],
  ["o", "Details or fold"],
  ["l h", "Expand, collapse"],
  ["s", "Send"],
  ["p", "Pin"],
  ["g", "PR graph"],
  ["n", "Open next"],
  ["t", "Triage"],
  [FIND_KEY, "Find"],
];

/** The page keys. */
const Keys = () => (
  <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
    {KEYS.map(([keys, action]) => (
      <Fragment key={action}>
        <dt>
          <Kbd className="font-mono">{keys}</Kbd>
        </dt>
        <dd className="m-0 text-muted-foreground">{action}</dd>
      </Fragment>
    ))}
  </dl>
);

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

type Cfg = {
  orders: Orders;
  needsOnly: boolean;
  snoozed: boolean;
  shutSections: ReadonlySet<string>;
  sortBy: SortBy;
  layout: Layout;
  groupBy: GroupBy;
  pins: ReadonlySet<string>;
  freeze?: Freeze;
};

const ResetButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button variant="outline" size="sm" onClick={onClick}>
    {label}
  </Button>
);

/** The empty main list: the text says why, and a button undoes the filter that caused it. */
const EmptyList = ({
  kind,
  showAll,
  showSnoozed,
}: {
  kind: EmptyKind;
  showAll: () => void;
  showSnoozed: () => void;
}) => {
  const Glyph = kind === "needs" ? CheckCheck : kind === "snoozed" ? Moon : Inbox;
  const text = { needs: "Nothing needs you", snoozed: "All threads are snoozed", none: "No active threads" }[kind];
  return (
    <IconState
      icon={<Glyph className="size-6" aria-hidden />}
      action={
        kind === "needs" ? (
          <ResetButton label="Show all threads" onClick={showAll} />
        ) : kind === "snoozed" ? (
          <ResetButton label="Show snoozed" onClick={showSnoozed} />
        ) : undefined
      }
      className="min-h-[60vh] flex-1 justify-center"
    >
      <span className="font-medium text-foreground">{text}</span>
      {kind === "none" && <span>Threads you start in T3 show here</span>}
    </IconState>
  );
};

/**
 * The user order on the whole tree, then the filter, then the drag freeze. In the tree, `view.projects` is also sorted.
 * In the flat layout, `view.flat` is also set: the sorted units, with section headers when grouped.
 */
const pipeline = (ps: Group[], c: Cfg): { full: Arranged; view: Arranged & { flat?: FlatItem[] } } => {
  const tree = arrange(ps, c.orders);
  const flatIds = applyOrder(flatten(tree.projects), (u) => u.id, c.orders[FLAT]).map((u) => u.id);
  const full = { ...tree, lists: new Map(tree.lists).set(FLAT, flatIds) };
  const shown = c.snoozed ? full.projects : withoutSnoozed(full.projects);
  const view = arrange(
    c.needsOnly ? onlyNeedsYou(shown) : shown,
    {},
    c.freeze,
    c.layout === "tree" ? c.pins : undefined,
  );
  if (c.layout === "flat") {
    const own = c.freeze?.list === FLAT ? c.freeze.ids : c.orders[FLAT];
    const units = pinFirst(
      c.sortBy === "updated"
        ? sortFlat(flatten(view.projects), c.snoozed)
        : applyOrder(flatten(view.projects), (u) => u.id, own),
      flatPinId,
      c.pins,
    );
    /** The payload can still have the T3 shape just after the choice changes: it groups as None until the Linear tree arrives. */
    const groupBy = c.groupBy === "linear" && !isLinear(ps) ? "none" : c.groupBy;
    const flat = sequence(units, groupBy, c.shutSections, c.snoozed, view.projects, c.pins);
    return { full, view: { ...view, lists: flatLists(flat, c.pins), flat } };
  }
  return {
    full,
    view: { ...view, projects: c.sortBy === "updated" ? sortTree(view.projects, c.snoozed, c.pins) : view.projects },
  };
};

type SettledItem = { project: Group; t: ThreadNode };
type SettledPage = { items: SettledItem[]; next: string | null; total: number };
const SETTLED_PAGE = 50;

/**
 * The settled threads, newest settle first, loaded a page at a time as the sentinel nears the view.
 * A new `signature` refetches the loaded rows in one request.
 */
function SettledList({ signature, scrollRoot }: { signature: string; scrollRoot: RefObject<HTMLDivElement | null> }) {
  const [items, setItems] = useState<SettledItem[]>([]);
  /** Undefined until the first page lands; null on the last page. */
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  /** Tags each request; a response that is not the latest is dropped. */
  const seq = useRef(0);
  const loaded = useRef(0);
  const sentinel = useRef<HTMLLIElement>(null);
  const fetchInto = useCallback((url: string, mode: "append" | "replace") => {
    const id = ++seq.current;
    setLoading(true);
    fetch(url)
      .then((r) => r.json() as Promise<SettledPage>)
      .then(
        (p) => {
          if (id !== seq.current) return;
          setItems((cur) =>
            mode === "replace" ? p.items : [...cur, ...p.items.filter((i) => !cur.some((c) => c.t.id === i.t.id))],
          );
          setNext(p.next);
          setTotal(p.total);
          setLoading(false);
        },
        () => {
          if (id !== seq.current) return;
          if (mode === "append") setNext(undefined);
          setLoading(false);
        },
      );
  }, []);
  useEffect(() => {
    loaded.current = items.length;
  });
  useEffect(() => {
    fetchInto(`/settled?limit=${Math.max(SETTLED_PAGE, loaded.current)}`, "replace");
    /* oxlint-disable-next-line react/exhaustive-effect-dependencies -- a new signature is the trigger, though the body does not read it */
  }, [signature, fetchInto]);
  /** Each change of `next` or `loading` makes a new observer, which reports at once, so a sentinel still in view loads the next page. */
  useEffect(() => {
    if (typeof next !== "string" || loading || !sentinel.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) fetchInto(`/settled?after=${encodeURIComponent(next)}&limit=${SETTLED_PAGE}`, "append");
      },
      { root: scrollRoot.current, rootMargin: "600px" },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, loading, fetchInto, scrollRoot]);
  return (
    <Card className="mt-3 gap-0 overflow-clip rounded-[12px] px-2 py-0 shadow-none">
      <h2 className="flex h-7 items-center gap-2 px-2 text-xs font-semibold text-muted-foreground">
        Settled
        <span className="font-normal tabular-nums">{total}</span>
      </h2>
      {next !== undefined && total === 0 && (
        <p className="px-2 pb-2 text-sm text-muted-foreground">No settled threads.</p>
      )}
      <ul aria-busy={loading} className="m-0 list-none p-1">
        {items.map(({ project, t }) => (
          <ThreadRow key={t.id} t={t} chip={t.key ?? undefined} project={project} />
        ))}
        {typeof next === "string" && <li ref={sentinel} aria-hidden className="h-px" />}
        {loading &&
          [0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="my-px">
              <Skeleton className="h-9 rounded-[8px] motion-reduce:animate-none" />
            </li>
          ))}
      </ul>
    </Card>
  );
}

function App() {
  const [tree, setTree] = useState<Tree | null>(null);
  /** Set while the stream is down: the time of the last push, null before the first. */
  const [lost, setLost] = useState<{ last: string | null } | null>(null);
  const lastPush = useRef<string | null>(null);
  const reconnect = useRef(() => {});
  const [settled, setSettled] = usePref(SETTLED_KEY, flag(false));
  const [snoozed, setSnoozed] = usePref(SNOOZED_KEY, flag(true));
  const [rules, setRules] = usePref(RULES_KEY, ruleList(load(NEST_KEY) === "1"));
  const rulesQuery = rulesParam(rules);
  const [projectNames, setProjectNames] = usePref(PROJECT_NAMES_KEY, flag(true));
  const [statusText, setStatusText] = usePref(STATUS_TEXT_KEY, flag(true));
  const [keyHints, setKeyHints] = usePref(KEY_HINTS_KEY, flag(true));
  const [needsOnly, setNeedsOnly] = usePref(FILTER_KEY, NEEDS_ONLY);
  const [theme, setTheme] = usePref(THEME_KEY, oneOf(THEMES, "system"));
  const [sortBy, setSortBy] = usePref(SORT_KEY, oneOf<SortBy>(["manual", "updated"], "manual"));
  const [layout, setLayout] = usePref(LAYOUT_KEY, oneOf<Layout>(["tree", "flat"], "tree"));
  const [groupBy, setGroupBy] = usePref(GROUP_KEY, oneOf<GroupBy>(["none", "status", "linear"], "none"));
  const [treeGroup, setTreeGroup] = usePref(TREE_GROUP_KEY, oneOf<TreeGroup>(["t3", "linear"], "t3"));
  const [now, setNow] = useState(Date.now);
  const [shown, setShown] = useState(() => new Set<string>());
  const [closed, setClosed] = usePref(CLOSED_KEY, idSet());
  const [pins, setPins] = usePref(PINS_KEY, idSet());
  const [shutSections, setShutSections] = usePref(SECTIONS_KEY, idSet(["idle", "done"]));
  const [clis, setClis] = useState<Offered | null>(null);
  const [cli, setCli] = useState<ModelPick | null | undefined>(undefined);
  const [catchUpOn, setCatchUpOn] = useState<boolean>();
  const [t3cli, setT3cli] = useState<CliStatus | null>(null);
  const [sendTo, setSendTo] = useState({ id: "", open: false });
  /** The id of the map head whose PR graph is open. */
  const [graphFor, setGraphFor] = useState<string | null>(null);
  const [wfStart, setWfStart] = useState<{ req: StartRequest | null; open: boolean }>({ req: null, open: false });
  const [wfStarted, setWfStarted] = useState<{ name: string; runId: string } | null>(null);
  const [orders, setOrders] = useState(() => parseOrders(load(ORDER_KEY)));
  const [linearOrders, setLinearOrders] = useState(() => parseOrders(load(ORDER_LINEAR_KEY)));
  const [skip, setSkip] = usePref(SKIP_KEY, SKIP);
  const [doneOpen, setDoneOpen] = useState(false);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [triage, setTriage] = useState(false);
  const triageRef = useRef(triage);
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
  const [labels, setLabelsState] = useState(() => parseLabels(load(LABELS_KEY) ?? ""));
  const labelsParam = labels.join(",");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [tokenOpen, setTokenOpen] = useState(false);
  const [linearOpen, setLinearOpen] = useState(false);
  /** Linear grouping is on in the tree, unless the server holds no key. */
  const treeMode: TreeGroup = treeGroup === "linear" && tree?.linearKey !== "no-key" ? "linear" : "t3";
  /** Linear grouping is on in the flat view, unless the server holds no key. */
  const flatMode: GroupBy = groupBy === "linear" && tree?.linearKey === "no-key" ? "none" : groupBy;
  const linearOn = layout === "tree" ? treeMode === "linear" : flatMode === "linear";
  const update = useUpdate();
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setLinearOpen(false);
  }, []);
  const setLinear = (workspace: string, teams: string) => {
    const next = parseLinear(workspace, teams);
    setLinearSet(next);
    if (next) save(LINEAR_KEY, JSON.stringify({ workspace: next.workspace, teams: next.teams.join(",") }));
    else forget(LINEAR_KEY);
  };
  const setLabels = (s: string) => {
    const next = parseLabels(s);
    setLabelsState(next);
    if (next.length) save(LABELS_KEY, next.join(","));
    else forget(LABELS_KEY);
  };
  const [freeze, setFreeze] = useState<Freeze>();
  const runs = tree?.runs ?? [];
  const queue = openNextQueue(tree?.projects ?? [], runs);
  const target = nextTarget(queue, seen);
  const openQueued = (t: ThreadNode | RunItem) => {
    setSeen(remember(queue, seen, t));
    /** The desktop window hands a new-window open to the system browser. */
    if (isRun(t)) window.open(t.href, "_blank", "noopener");
    else location.assign(t.href);
  };
  const openNext = () => target && openQueued(target);
  const openNextRef = useRef(openNext);
  const openThread = (id: string) => {
    const t = queue.find((q) => q.id === id);
    if (t) openQueued(t);
  };
  const openThreadRef = useRef(openThread);
  const settingsOpenRef = useRef(settingsOpen);
  useEffect(() => {
    openNextRef.current = openNext;
    openThreadRef.current = openThread;
    settingsOpenRef.current = settingsOpen;
    triageRef.current = triage;
  });

  useDesktopSync({ tree, queue, target, linear, catchUpOn, openNext, openThread });

  useEffect(() => {
    const n = tree ? needsYouThreads(tree.projects, tree.runs ?? []).length : 0;
    document.title = tabTitle(n);
    iconLink.href = favicon(appIcon, n);
  }, [tree]);

  const loadModels = useCallback(() => {
    fetch("/models")
      .then((r) => r.json() as Promise<Offered>)
      .then(setClis, () => setClis([]));
  }, []);
  /** The pick lives in the server file. A pick that an older page saved in `localStorage` moves there once. */
  useEffect(() => {
    fetch("/model-pick")
      .then((r) => r.json() as Promise<{ pick: ModelPick | null; catchUp: boolean }>)
      .then(
        async (saved) => {
          const old = load(CLI_KEY) as ModelPick | null;
          const savedCatchUp = !saved.pick && old ? await putPick({ pick: old }) : saved.catchUp;
          if (savedCatchUp !== null) forget(CLI_KEY);
          setCli(saved.pick ?? old ?? null);
          setCatchUpOn(savedCatchUp ?? saved.catchUp);
        },
        () => setCatchUpOn(false),
      );
  }, []);
  useEffect(() => {
    loadModels();
    fetch("/t3/cli")
      .then((r) => r.json() as Promise<CliStatus>)
      .then(setT3cli, () => setT3cli(null));
  }, [loadModels]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useKeyHints(keyHints);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    if (theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const listRef = useRef<HTMLDivElement>(null);
  /** The thread or header stop that has focus, and its index in the stop list. */
  const last = useRef<{ id: string; index: number } | null>(null);
  /** Moves focus to the header of fold `id` when focus is inside the fold, before the fold closes. True when it moved. */
  const holdFocus = (id: string) => {
    const root = listRef.current;
    const active = document.activeElement;
    const header = root?.querySelector<HTMLElement>(`[data-stop="${CSS.escape(id)}"]`);
    if (!root || !header || !active || active === header) return false;
    let inside = !!header.closest("[data-slot=collapsible]")?.contains(active);
    if (id.startsWith("sec:")) {
      const next = [...root.querySelectorAll('[data-stop^="sec:"]')].find(
        (h) => header.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      inside =
        !!(header.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !(next && next.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
    }
    if (inside) header.focus({ preventScroll: true });
    return inside;
  };
  const toggle = (id: string) => {
    if (!closed.has(id)) holdFocus(id);
    const n = new Set(closed);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setClosed(n);
  };
  const toggleSection = (key: string) => {
    if (!shutSections.has(key)) holdFocus(`sec:${key}`);
    const n = new Set(shutSections);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setShutSections(n);
  };
  const fold = (ids: string[], shut: boolean) => {
    if (shut) for (const id of ids) if (holdFocus(id)) break;
    const n = new Set(closed);
    for (const id of ids) {
      if (shut) n.add(id);
      else n.delete(id);
    }
    setClosed(n);
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
  const pinApi = {
    pins,
    toggle: (id: string) =>
      setPins((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
  };
  const sendToApi = { t3cli, open: (id: string) => setSendTo({ id, open: true }) };
  const workflowStarter = {
    workflows: tree?.workflows ?? [],
    t3cli,
    open: (req: StartRequest) => setWfStart({ req, open: true }),
  };
  const pick = effectivePick(clis, cli);
  const pickCli = (c: ModelPick) => (
    setCli(c),
    void putPick({ pick: c }).then((on) => on !== null && setCatchUpOn(on))
  );
  const setCatchUp = (on: boolean) => {
    const body = switchBody(on, cli, pick, clis ?? []);
    if (body.pick) setCli(body.pick);
    void putPick(body).then((saved) => saved !== null && setCatchUpOn(saved));
  };
  const graphHead = graphFor ? mapHead(tree?.projects ?? [], graphFor) : undefined;
  /** A head that leaves the tree closes its graph for good, so it does not open again when the head comes back. */
  if (graphFor && !graphHead) setGraphFor(null);
  const live = new Map((tree?.projects ?? []).flatMap(allThreads).map((t) => [t.id, t]));
  /** Threads and run items, for Triage. Skip and Send use `live`, which holds threads only. */
  const triageLive = new Map<string, ThreadNode | RunItem>([...live, ...runs.map((r) => [r.id, r] as const)]);
  const keptSkip = tree ? pruneSkip(skip, live, tree.conn) : skip;
  if (keptSkip !== skip) setSkip(keptSkip);
  const lookDone = looksDone(tree?.projects ?? [], { skip, now });
  const lookDoneButton = <LooksDoneButton count={lookDone.length} onOpen={() => setDoneOpen(true)} />;
  /** Opens the folds on the way to the row of thread `id`, stores them, then scrolls to the row and flashes it. */
  const reveal = (id: string): Promise<boolean> => {
    flushSync(() => {
      if (layout === "tree") fold(pathFolds(full.projects, id), false);
      else {
        const key =
          flatMode === "none" ? null : sectionHolding(flatten(view.projects), snoozed, id, flatMode, view.projects);
        if (key && shutSections.has(key)) toggleSection(key);
      }
    });
    return new Promise((done) => requestAnimationFrame(() => done(revealRow(id))));
  };
  const counts = countHeader(tree?.projects ?? [], runs);
  const needsTip = needsYouTip(counts);
  const connecting = !tree || tree.conn === "connecting";
  const cfg: Cfg = {
    orders: isLinear(tree?.projects ?? []) ? linearOrders : orders,
    needsOnly,
    snoozed,
    shutSections,
    sortBy,
    layout,
    groupBy: flatMode,
    pins,
    freeze,
  };
  const { full, view } = pipeline(tree?.projects ?? [], cfg);
  const inView = new Set(view.projects.flatMap(allThreads).map((t) => t.id));
  /** The ids of the rendered rows and section headers, in order, for a tree. */
  const rows = (ps: Group[]) => {
    const v = pipeline(ps, cfg).view;
    return (
      layout === "flat" ? (v.flat ?? []).flatMap(itemIds) : v.projects.flatMap(allThreads).map((t) => t.id)
    ).join();
  };
  const latest = useRef({ full, view, rows, projects: tree?.projects ?? [], connecting, t3cli });
  useEffect(() => {
    latest.current = { full, view, rows, projects: tree?.projects ?? [], connecting, t3cli };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const active = document.activeElement;
      const action = pageKey(e, {
        stop: active?.matches("[data-stop]") ? (active.closest(".thread-row") ? "thread" : "header") : null,
        mac: MAC,
        field: !!el?.closest("input, textarea, [contenteditable]:not([contenteditable=false])"),
        panel: settingsOpenRef.current,
        overlay: document.querySelector("[data-find]")
          ? "find"
          : document.querySelector("[role=dialog], [role=alertdialog]")
            ? "dialog"
            : document.querySelector("[role=menu], [role=listbox]")
              ? "menu"
              : null,
      });
      if (action === null || (triageRef.current && action !== "find")) return;
      if (action === "find") {
        e.preventDefault();
        setFindOpen((o) => !o);
      } else if (action === "next") openNextRef.current();
      else if (action === "triage") setTriage(true);
      else if (action === "down" || action === "up") {
        const root = listRef.current;
        if (!root) return;
        const stops = stopsIn(root);
        const at = active instanceof HTMLElement ? stops.indexOf(active) : -1;
        const box = root.getBoundingClientRect();
        const to =
          at < 0
            ? stops.find((s) => {
                const r = s.getBoundingClientRect();
                return r.bottom > box.top && r.top < box.bottom;
              })
            : stops[nextStop(stops.length, at, action === "down" ? 1 : -1) ?? -1];
        if (!to) return;
        e.preventDefault();
        to.focus({ preventScroll: true });
        to.scrollIntoView({ block: "nearest" });
      } else if (action === "toggle" || action === "expand" || action === "collapse") {
        const row = active?.closest(".thread-row");
        const btn = row ? row.querySelector<HTMLElement>("[aria-label=Details], [data-fold]") : active;
        const expanded = btn?.getAttribute("aria-expanded") === "true";
        if (btn instanceof HTMLElement && (action === "toggle" || expanded === (action === "collapse"))) btn.click();
      } else if (action === "pin") {
        const stop = active instanceof HTMLElement ? active.dataset.stop : undefined;
        if (stop) listRef.current?.querySelector<HTMLElement>(`[data-pin-for="${CSS.escape(stop)}"]`)?.click();
      } else if (action === "graph") {
        const stop = active instanceof HTMLElement ? active.dataset.stop?.replace(/^fold:/, "") : undefined;
        if (stop && listRef.current?.querySelector(`[data-graph-for="${CSS.escape(stop)}"]`)) setGraphFor(stop);
      } else if (action === "send") {
        const id = active?.closest<HTMLElement>(".thread-row")?.dataset.thread;
        if (id && latest.current.t3cli?.available !== false) setSendTo({ id, open: true });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [listRef]);
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const onIn = (e: FocusEvent) => {
      const t = e.target;
      last.current =
        t instanceof HTMLElement && t.matches("[data-stop]")
          ? { id: t.dataset.stop!, index: stopsIn(root).indexOf(t) }
          : null;
    };
    const clear = () => (last.current = null);
    /** Keeps focus on the same stop, or on the stop at its old index when it left, as the tree updates. */
    const mo = new MutationObserver(() => {
      const l = last.current;
      if (!l) return;
      const stops = stopsIn(root);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("[data-stop]")) {
        /** A leaving row is inert and out of the stops; it keeps its old index. */
        const at = stops.indexOf(active);
        if (at >= 0) l.index = at;
      } else if (active === document.body) {
        const i = refocusIndex(
          stops.map((s) => s.dataset.stop!),
          l,
        );
        if (i < 0) last.current = null;
        else stops[i].focus({ preventScroll: true });
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributeFilter: ["inert"] });
    document.addEventListener("focusin", onIn);
    document.addEventListener("pointerdown", clear, true);
    return () => {
      mo.disconnect();
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("pointerdown", clear, true);
    };
  }, [listRef, last]);
  useEffect(() => {
    const events = liveStream({
      open: () =>
        new EventSource(
          `/events?rules=${encodeURIComponent(rulesQuery)}${labelsParam ? `&labels=${encodeURIComponent(labelsParam)}` : ""}${linearOn ? "&linear=1" : ""}`,
        ),
      onTree: (data) => {
        lastPush.current = new Date().toISOString();
        const next = JSON.parse(data) as Tree;
        const cur = latest.current;
        /** Only a change of the row order plays a transition; a push every second while a thread works does not. */
        if (cur.connecting || cur.rows(next.projects) === cur.rows(cur.projects)) setTree(next);
        else transition(() => setTree(next));
      },
      onState: (s: LiveState) => setLost(s === "live" ? null : { last: lastPush.current }),
    });
    reconnect.current = events.reconnect;
    return () => events.close();
  }, [rulesQuery, labelsParam, linearOn]);

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
            if (!s || canceled) return s && `Move canceled. ${s.name} is back at ${s.at}.`;
            return `${s.name} dropped at ${s.at}.`;
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
    if (list.startsWith(FLAT)) {
      const { lists } = latest.current.view;
      setFreeze({
        list: FLAT,
        ids: [...(lists.get(pinnedList(FLAT)) ?? []), ...(lists.get(FLAT) ?? [])],
        units: new Map(),
      });
    } else if (ids && units) setFreeze({ list, ids, units });
  };
  const dragEnd = ({ operation: { source }, canceled }: DragEndEvent) => {
    drag.on = false;
    setFreeze(undefined);
    if (canceled || !isSortable(source)) return;
    const list = String(source.sortable.group);
    const store = list.startsWith(FLAT) ? FLAT : baseList(list);
    const all = latest.current.full.lists.get(store);
    const visible = latest.current.view.lists.get(list);
    if (!all || !visible) return;
    const moved = reorder(all, visible, source.sortable.initialIndex, source.sortable.index);
    const lists = latest.current.full.lists;
    const [setStore, storeKey] = isLinear(latest.current.full.projects)
      ? ([setLinearOrders, ORDER_LINEAR_KEY] as const)
      : ([setOrders, ORDER_KEY] as const);
    setStore((prev) => {
      const next = prune({ ...prev, [store]: moved }, lists);
      save(storeKey, JSON.stringify(next));
      return next;
    });
  };
  const resetOrder = () => {
    setOrders({});
    setLinearOrders({});
    forget(ORDER_KEY);
    forget(ORDER_LINEAR_KEY);
  };

  const pickSort = (s: SortBy) => {
    transition(() => setSortBy(s));
  };
  const pickLayout = (l: Layout) => {
    transition(() => setLayout(l));
  };
  const pickGroup = (g: GroupBy) => {
    transition(() => setGroupBy(g));
  };
  const pickTreeGroup = (g: TreeGroup) => {
    transition(() => setTreeGroup(g));
  };
  const groupValue = layout === "flat" ? flatMode : treeMode;
  const pickGroupBy = (v: string) => (layout === "flat" ? pickGroup(v as GroupBy) : pickTreeGroup(v as TreeGroup));
  const inner = projects?.flatMap((p) => [p.id, ...foldIds(p)]) ?? [];
  const tabCount = tree ? needsYouThreads(tree.projects, runs).length : 0;

  return (
    /** A tooltip covers the row above, so a hoverable one stays open while the pointer moves up. */
    <TooltipProvider disableHoverableContent>
      <title>{tabTitle(tabCount)}</title>
      <link rel="icon" type="image/svg+xml" href={favicon(appIcon, tabCount)} />
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
          <ToggleGroupItem
            value="needs"
            aria-label={needsTip ? `Needs you, ${needsTip}` : "Needs you"}
            className={cn(FILTER_ITEM, "gap-1.5 px-2.5")}
          >
            {/** One baseline for the label and the numbers: centered, the smaller numbers look raised. */}
            <span className="flex items-baseline gap-1.5">
              Needs you
              {needsTip && (
                /** The tooltip sits inside the item so that the item keeps `data-state`. */
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-baseline gap-1">
                      {counts.needYou > 0 && (
                        <span className="rounded-[4px] bg-status-needs-input px-1 text-[11px] text-white tabular-nums">
                          {counts.needYou}
                        </span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{needsTip}</TooltipContent>
                </Tooltip>
              )}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
        <TriageButton count={queue.length} open={triage} toggle={() => setTriage((o) => !o)} />
        {lookDoneButton}
        <div className="ml-auto flex items-center gap-1">
          <div className="min-[720px]:hidden">
            <ViewMenu
              sortBy={sortBy}
              setSortBy={pickSort}
              layout={layout}
              setLayout={pickLayout}
              group={groupValue}
              setGroup={pickGroupBy}
              linearKey={tree?.linearKey}
              inner={inner}
              closed={closed}
              fold={fold}
            />
          </div>
          <div className="flex items-center gap-1 max-[720px]:hidden">
            {projects && layout === "tree" && <FoldAll inner={inner} closed={closed} fold={fold} />}
            <SortMenu sortBy={sortBy} setSortBy={pickSort} />
            <LayoutToggle layout={layout} setLayout={pickLayout} />
            {projects && (
              <GroupMenu flat={layout === "flat"} value={groupValue} set={pickGroupBy} linearKey={tree?.linearKey} />
            )}
          </div>
          <SettingsButton
            buttonRef={settingsButtonRef}
            update={update}
            open={settingsOpen}
            toggle={() => {
              setTokenOpen(false);
              setLinearOpen(false);
              setSettingsOpen((o) => !o);
            }}
          />
        </div>
      </header>
      <div ref={listRef} className={cn("min-h-0 flex-1 overflow-y-auto", projects?.length === 0 && "flex flex-col")}>
        <Reveal value={reveal}>
          {lost && (
            <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
              <AlertDescription className="flex flex-wrap items-center gap-x-2 text-foreground">
                Live updates stopped: the rows can be out of date. Reconnecting… Last update{" "}
                {lost.last ? hhmm(lost.last) : "never"}.
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => reconnect.current()}>
                  Reconnect now
                </Button>
              </AlertDescription>
            </Alert>
          )}
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
          {linearOn && tree?.linearKey === "rejected" && (
            <Alert className="mb-3 border-l-[3px] border-l-status-needs-input">
              <AlertDescription className="flex flex-wrap items-center gap-x-2 text-foreground">
                Linear rejected the API key.
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setLinearOpen(true);
                    setSettingsOpen(true);
                  }}
                >
                  Set the key
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <DragDropProvider plugins={plugins} onDragStart={dragStart} onDragEnd={dragEnd}>
            {triage && (
              <TriageCard
                queue={queue}
                live={triageLive}
                now={now}
                t3cli={t3cli}
                close={() => setTriage(false)}
                endExtra={lookDoneButton}
              />
            )}
            <Details value={details}>
              <NeedsOnly value={needsOnly}>
                <ProjectNames value={projectNames}>
                  <Linear value={linear}>
                    <Watched value={labels}>
                      <Lists value={sortBy === "updated" ? NO_LISTS : view.lists}>
                        <Now value={now}>
                          <div
                            className={cn(
                              !connecting && tree.conn !== "up" && "grayscale",
                              projects?.length === 0 && "flex flex-1 flex-col",
                            )}
                            data-conn={!connecting && tree.conn !== "up" ? "down" : undefined}
                            data-status-text={statusText ? undefined : "off"}
                          >
                            {projects?.length === 0 && (
                              <EmptyList
                                kind={emptyKind(full.projects, snoozed, needsOnly)}
                                showAll={() => setNeedsOnly(false)}
                                showSnoozed={() => setSnoozed(true)}
                              />
                            )}
                            {projects && projects.length > 0 ? (
                              <Card className="gap-0 overflow-clip rounded-[12px] px-2 py-0 shadow-none">
                                <ul className={cn("m-0 list-none p-0", layout === "flat" && "p-1")}>
                                  <SendTo value={sendToApi}>
                                    <OpenGraph value={setGraphFor}>
                                      <WorkflowStarter value={workflowStarter}>
                                        <Folds value={{ closed, toggle, fold }}>
                                          <ShowSnoozed value={snoozed}>
                                            <Pins value={pinApi}>
                                              {layout === "flat" ? (
                                                <Presence key="flat" items={view.flat ?? []} keyOf={(i) => i.id}>
                                                  {(i) => (
                                                    <FlatRow
                                                      i={i}
                                                      corners={edgeCorners(view.flat ?? [], i)}
                                                      linear={flatMode === "linear"}
                                                      section={sectionOf(view.flat ?? [], i)}
                                                      closed={closed}
                                                      toggle={toggle}
                                                      fold={fold}
                                                      toggleSection={toggleSection}
                                                    />
                                                  )}
                                                </Presence>
                                              ) : (
                                                <Presence key="tree" items={projects} keyOf={(p) => p.id}>
                                                  {(p) => (
                                                    <ProjectBlock b={p} closed={closed} toggle={toggle} fold={fold} />
                                                  )}
                                                </Presence>
                                              )}
                                            </Pins>
                                          </ShowSnoozed>
                                        </Folds>
                                      </WorkflowStarter>
                                    </OpenGraph>
                                  </SendTo>
                                </ul>
                              </Card>
                            ) : projects === undefined ? (
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
                            ) : null}
                            {settled && projects && (
                              <SendTo value={sendToApi}>
                                <WorkflowStarter value={workflowStarter}>
                                  <SettledList signature={tree?.settled ?? ""} scrollRoot={listRef} />
                                </WorkflowStarter>
                              </SendTo>
                            )}
                          </div>
                        </Now>
                      </Lists>
                    </Watched>
                  </Linear>
                </ProjectNames>
              </NeedsOnly>
            </Details>
          </DragDropProvider>
        </Reveal>
      </div>
      {settingsOpen && (
        <SettingsPanel
          close={closeSettings}
          buttonRef={settingsButtonRef}
          linear={linear}
          setLinear={setLinear}
          labels={labels}
          setLabels={setLabels}
          settled={settled}
          setSettled={setSettled}
          snoozed={snoozed}
          setSnoozed={setSnoozed}
          rules={rules}
          setRules={setRules}
          linearOn={linearOn}
          statusText={statusText}
          setStatusText={setStatusText}
          keyHints={keyHints}
          setKeyHints={setKeyHints}
          projectNames={projectNames}
          setProjectNames={setProjectNames}
          canReset={Object.keys(orders).length + Object.keys(linearOrders).length > 0}
          resetOrder={resetOrder}
          theme={theme}
          setTheme={setTheme}
          update={update}
          conn={tree?.conn}
          linearKey={tree?.linearKey}
          workflowScan={tree?.workflowScan}
          tokenOpen={tokenOpen}
          linearOpen={linearOpen}
          reloadModels={loadModels}
          clis={clis}
          t3cli={t3cli}
          pick={pick}
          catchUpOn={catchUpOn}
          setPick={pickCli}
          setCatchUp={setCatchUp}
        />
      )}
      <FindDialog
        open={findOpen}
        setOpen={setFindOpen}
        list={hits(full.projects)}
        canShow={(id) => inView.has(id)}
        reveal={reveal}
        now={now}
        workflows={tree?.workflows ?? null}
        start={(workflow) => workflowStarter.open({ workflow, point: { kind: "none" } })}
      />
      <WorkflowStarter value={workflowStarter}>
        <LooksDoneDialog
          open={doneOpen}
          items={lookDone}
          onOpenChange={setDoneOpen}
          onDone={(settledIds, skipped) => {
            setSkip((s) => [...s.filter((e) => !skipped.some((k) => k.id === e.id)), ...skipped]);
            if (settledIds.length > 0) setUndoIds((u) => [...(u ?? []), ...settledIds]);
          }}
        />
      </WorkflowStarter>
      <StartDialog
        req={wfStart.req}
        open={wfStart.open}
        onOpenChange={(open) => setWfStart((s) => ({ ...s, open }))}
        onStarted={(name, runId) => setWfStarted({ name, runId })}
      />
      {wfStarted && (
        <StartedToast
          key={wfStarted.runId}
          {...wfStarted}
          origin={tree?.t3Origin ?? null}
          reveal={reveal}
          onClose={() => setWfStarted(null)}
        />
      )}
      {undoIds && <UndoToast key={undoIds.join()} ids={undoIds} onClose={() => setUndoIds(null)} />}
      {graphHead && <PrGraphDialog key={graphHead.id} head={graphHead} onOpenChange={() => setGraphFor(null)} />}
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
