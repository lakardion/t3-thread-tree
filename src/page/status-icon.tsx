import {
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Diamond,
  ListChecks,
  LoaderCircle,
  Moon,
  Square,
  type LucideIcon,
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Status, ThreadNode } from "../shared/tree.ts";
import { Swap } from "./swap.tsx";

export const STATUS: Record<Status, { icon: LucideIcon; shape: string; text: string }> = {
  "needs-input": { icon: Diamond, shape: "text-status-needs-input", text: "text-status-needs-input-fg" },
  working: { icon: LoaderCircle, shape: "text-status-working", text: "text-status-working-fg" },
  starting: { icon: CircleDashed, shape: "text-status-working", text: "text-status-working-fg" },
  waiting: { icon: CirclePause, shape: "text-status-working", text: "text-status-working-fg" },
  "plan-ready": { icon: ListChecks, shape: "text-status-plan", text: "text-status-plan-fg" },
  "your-turn": { icon: CircleCheck, shape: "text-status-done", text: "text-status-done-fg" },
  done: { icon: Check, shape: "text-status-done", text: "text-status-done-fg" },
  failed: { icon: CircleX, shape: "text-status-failed", text: "text-status-failed-fg" },
  interrupted: { icon: Square, shape: "text-status-failed", text: "text-status-failed-fg" },
  snoozed: { icon: Moon, shape: "text-status-idle", text: "text-muted-foreground" },
  idle: { icon: Circle, shape: "text-status-idle", text: "text-muted-foreground" },
};

export const StatusIcon = ({ t }: { t: ThreadNode }) => {
  const { icon: Icon, shape } = STATUS[t.status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-none" role="img" aria-label={t.phrase}>
          <Swap
            k={t.status}
            enter="swap-scale"
            className={cn(shape, "transition-colors duration-300 motion-reduce:transition-none")}
          >
            <Icon className="status-icon size-3" fill={t.status === "needs-input" ? "currentColor" : "none"} />
          </Swap>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t.phrase} · {t.raw}
      </TooltipContent>
    </Tooltip>
  );
};
