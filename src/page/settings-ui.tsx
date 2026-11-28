import { ChevronDown, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const HINT = "text-xs text-muted-foreground";

/** One labelled group: a title outside a card of rows. */
export const SettingsGroup = ({
  title,
  children,
  accent,
}: {
  title: string;
  children: ReactNode;
  accent?: boolean;
}) => (
  <section className="grid gap-1.5">
    <h3 className="m-0 px-1 text-xs font-semibold text-muted-foreground">{title}</h3>
    <div className={cn("divide-y rounded-lg border bg-background", accent && "border-l-[3px] border-l-primary")}>
      {children}
    </div>
  </section>
);

/** Label and hint at the left, control at the right. */
export const Row = ({
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

export type Tone = "ok" | "warn" | "info" | "none";
const TONE: Record<Tone, { cls: string; Icon: typeof Info | null }> = {
  ok: { cls: "text-status-done-fg", Icon: null },
  warn: { cls: "text-status-needs-input-fg", Icon: TriangleAlert },
  info: { cls: "text-status-working-fg", Icon: Info },
  none: { cls: "text-muted-foreground", Icon: null },
};

/** A row that folds open, with its current value at the right. */
export const Fold = ({
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
