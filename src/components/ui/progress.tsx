import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** A `value` of null is indeterminate: the indicator slides. */
function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full bg-primary transition-transform duration-150 data-[state=indeterminate]:w-1/3 data-[state=indeterminate]:animate-[progress-slide_1.2s_ease-in-out_infinite] motion-reduce:data-[state=indeterminate]:animate-none"
        style={value == null ? undefined : { transform: `translateX(-${100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
