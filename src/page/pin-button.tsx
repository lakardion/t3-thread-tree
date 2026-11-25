import { Pin } from "lucide-react";
import { createContext, useContext } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The pinned ids and the toggle. Null outside the main list: no Pin button shows. */
export const Pins = createContext<{ pins: ReadonlySet<string>; toggle: (id: string) => void } | null>(null);

/**
 * Pins or unpins the item `id`. `stop` is the `data-stop` of the row or header, so that the `p` key finds the button.
 * An unpinned button shows on hover and focus of its row, and always on touch; a pinned one always shows.
 */
export function PinButton({
  id,
  stop,
  name,
  className,
}: {
  id: string;
  stop: string;
  name: string;
  className?: string;
}) {
  const ctx = useContext(Pins);
  if (!ctx) return null;
  const pinned = ctx.pins.has(id);
  const label = `${pinned ? "Unpin" : "Pin"} ${name}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            className,
            pinned
              ? "text-foreground"
              : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
          )}
          aria-label={label}
          aria-pressed={pinned}
          data-pin-for={stop}
          onClick={(e) => {
            e.stopPropagation();
            ctx.toggle(id);
          }}
        >
          <Pin className="size-3.5" fill={pinned ? "currentColor" : "none"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
