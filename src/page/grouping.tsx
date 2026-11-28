import {
  Accessibility,
  type defaultPreset,
  type Draggable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { GripVertical, Lock } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { RULES } from "../shared/rules.ts";
import { moveRule, ruleChanges } from "./grouping.ts";
import type { Rule } from "./prefs.ts";

const HINT = "text-xs text-muted-foreground";
const info = (id: Rule["id"]) => RULES.find((r) => r.id === id)!;

type Props = { rules: Rule[]; setRules: Dispatch<SetStateAction<Rule[]>>; linear: boolean };

function RuleRow({
  rule,
  setRules,
  lead,
  note,
}: {
  rule: Rule;
  setRules: Props["setRules"];
  lead: ReactNode;
  note?: string;
}) {
  const { id, label, hint } = info(rule.id);
  return (
    <div className="flex items-center gap-2 px-2 py-2.5">
      <span className="flex w-5 justify-center text-muted-foreground">{lead}</span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Label htmlFor={`rule-${id}`} className="text-[13px] font-normal">
          {label}
        </Label>
        <div className={HINT}>
          {hint}
          {note}
        </div>
      </div>
      <Switch
        id={`rule-${id}`}
        checked={rule.on}
        onCheckedChange={(on) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, on } : r)))}
      />
    </div>
  );
}

function SortRow({ rule, index, setRules }: { rule: Rule; index: number; setRules: Props["setRules"] }) {
  const { label } = info(rule.id);
  const { ref, handleRef, isDragging } = useSortable({ id: rule.id, index, group: "rules", data: { name: label } });
  return (
    <div ref={ref} className={cn(isDragging && "opacity-60")}>
      <RuleRow
        rule={rule}
        setRules={setRules}
        lead={
          <button ref={handleRef} type="button" aria-label={`Move ${label}`} className="cursor-grab">
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}

/** The rule name and its place among the three movable rules. */
const spot = (source: Draggable | null) =>
  isSortable(source) ? { name: String(source.data.name), at: `position ${source.sortable.index + 1} of 3` } : undefined;

const ANNOUNCEMENTS = Accessibility.configure({
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
});

const PLUGINS = (defaults: typeof defaultPreset.plugins) => [
  ...defaults.filter((p) => p !== Accessibility),
  ANNOUNCEMENTS,
];

/** The placement rules: a switch for each, and drag handles to reorder the last three. */
export function GroupingSection({ rules, setRules, linear }: Props) {
  const changes = ruleChanges(rules, linear);
  const first = rules[0];
  return (
    <section className="grid gap-1.5">
      <h3 className="m-0 px-1 text-xs font-semibold text-muted-foreground">Grouping</h3>
      <div className="divide-y rounded-lg border bg-background">
        <RuleRow rule={first} setRules={setRules} lead={<Lock className="size-3.5" />} note=" Always first." />
        <DragDropProvider
          plugins={PLUGINS}
          onDragEnd={({ operation: { source }, canceled }) => {
            if (canceled || !isSortable(source)) return;
            const { initialIndex, index } = source.sortable;
            setRules((rs) => moveRule(rs, initialIndex, index));
          }}
        >
          {rules.slice(1).map((r, i) => (
            <SortRow key={r.id} rule={r} index={i} setRules={setRules} />
          ))}
        </DragDropProvider>
      </div>
      <div className="grid gap-1.5 px-1">
        <p className={cn(HINT, "m-0")}>A thread goes to the first rule that fits it, top to bottom.</p>
        {changes.length ? (
          <ul className={cn(HINT, "m-0 grid gap-0.5 pl-4")}>
            {changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className={cn(HINT, "m-0")}>Default placement.</p>
        )}
        {linear && !rules.find((r) => r.id === "key")!.on && (
          <p className="m-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs">
            The Linear tree groups by issue key. With Issue key off, most threads show as loose threads.
          </p>
        )}
      </div>
    </section>
  );
}
