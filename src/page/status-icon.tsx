import {
  Ban,
  Check,
  Circle,
  CircleDashed,
  CirclePause,
  CircleStop,
  CircleX,
  Clock,
  Diamond,
  KeyRound,
  ListChecks,
  LoaderCircle,
  MessageCircleQuestion,
  MessageSquareDot,
  MessageSquareText,
  Moon,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Status, ThreadNode } from "../shared/tree.ts";
import { phraseWith } from "./format.ts";
import { Swap } from "./swap.tsx";

export const STATUS: Record<Status, { icon: LucideIcon; shape: string }> = {
  "needs-input": { icon: Diamond, shape: "text-status-needs-input" },
  working: { icon: LoaderCircle, shape: "text-status-working" },
  starting: { icon: CircleDashed, shape: "text-status-working" },
  waiting: { icon: CirclePause, shape: "text-status-working" },
  "plan-ready": { icon: ListChecks, shape: "text-status-plan" },
  "your-turn": { icon: MessageSquareDot, shape: "text-status-done" },
  done: { icon: Check, shape: "text-status-done" },
  failed: { icon: CircleX, shape: "text-status-failed" },
  interrupted: { icon: CircleStop, shape: "text-status-failed" },
  snoozed: { icon: Moon, shape: "text-status-idle" },
  idle: { icon: Circle, shape: "text-status-idle" },
};

/** Phrases that refine the icon of their status. */
const PHRASE_ICON: Record<string, LucideIcon> = {
  Approval: ShieldAlert,
  Question: MessageCircleQuestion,
  "Sign in": KeyRound,
  "Guest message": MessageSquareText,
  Queued: Clock,
  Cancelled: Ban,
};

const iconOf = (status: Status, phrase: string): LucideIcon => PHRASE_ICON[phrase] ?? STATUS[status].icon;

/** Each icon with its meaning, in legend order. */
export const LEGEND: [Status, string, string][] = [
  ["needs-input", "Approval", "The agent asks to run a command or change a file"],
  ["needs-input", "Question", "The agent asks you a question"],
  ["needs-input", "Sign in", "The agent needs you to sign in again"],
  ["needs-input", "Guest message", "Someone else wrote in the thread"],
  ["needs-input", "Input", "The agent waits for other input"],
  ["plan-ready", "Plan ready", "A plan waits for your review"],
  ["your-turn", "Your turn", "The agent finished and you did not open the result yet"],
  ["done", "Done", "Finished and seen"],
  ["working", "Working", "The agent runs now"],
  ["starting", "Starting", "The run starts"],
  ["starting", "Queued", "The run waits in the queue"],
  ["waiting", "Waiting", "The agent waits for another thread"],
  ["failed", "Failed", "The run failed"],
  ["interrupted", "Interrupted", "The run stopped before the end"],
  ["interrupted", "Cancelled", "The run was cancelled"],
  ["snoozed", "Snoozed", "Hidden until the snooze ends"],
  ["idle", "Idle", "No run yet"],
];

export const LegendIcon = ({ status, phrase }: { status: Status; phrase: string }) => {
  return createElement(iconOf(status, phrase), {
    className: cn(STATUS[status].shape, "size-3.5 flex-none"),
    fill: phrase === "Input" ? "currentColor" : "none",
    "aria-hidden": true,
  });
};

/** `now` adds the time in the status to the tooltip. */
export const StatusIcon = ({ t, now }: { t: ThreadNode; now?: number }) => {
  const icon = iconOf(t.status, t.phrase);
  const { shape } = STATUS[t.status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-none" role="img" aria-label={t.phrase}>
          <Swap
            k={`${t.status}|${t.phrase}`}
            enter="swap-scale"
            className={cn(shape, "transition-colors duration-300 motion-reduce:transition-none")}
          >
            {createElement(icon, {
              className: "status-icon size-3",
              fill: icon === Diamond ? "currentColor" : "none",
            })}
          </Swap>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {now === undefined ? t.phrase : phraseWith(t, now)} · {t.raw}
      </TooltipContent>
    </Tooltip>
  );
};
