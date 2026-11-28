import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const kbdVariants = cva(
  [
    "pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1 font-mono font-medium text-muted-foreground select-none",
    "[&_svg:not([class*='size-'])]:size-3",
    "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
  ],
  {
    variants: {
      size: {
        default: "h-5 min-w-5 text-xs",
        sm: "h-4 min-w-4 px-1 text-[10px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function Kbd({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" data-size={size} className={cn(kbdVariants({ size }), className)} {...props} />;
}

/** The dev bundler renames the function; the Retouche overlay matches components by this name. */
Kbd.displayName = "Kbd";

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup, kbdVariants };
