"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "flex items-center gap-2 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "text-sm leading-none font-medium",
        choice: "text-[13px] font-normal",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Label({
  className,
  variant = "default",
  ...props
}: ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return <LabelPrimitive.Root data-slot="label" className={cn(labelVariants({ variant, className }))} {...props} />;
}

/** The dev bundler renames the function; the Retouche overlay matches components by this name. */
Label.displayName = "Label";

export { Label, labelVariants };
