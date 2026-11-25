import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const IconState = ({
  icon,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground", className)}
  >
    {icon}
    {children}
    {action}
  </div>
);
