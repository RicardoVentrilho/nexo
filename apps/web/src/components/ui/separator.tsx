import * as React from "react";
import { cn } from "../../lib/utils";

export function Separator({ className, decorative = true, ...props }: React.HTMLAttributes<HTMLDivElement> & { decorative?: boolean }) {
  return (
    <div
      aria-orientation="horizontal"
      className={cn("h-px w-full shrink-0 bg-border", className)}
      role={decorative ? "none" : "separator"}
      {...props}
    />
  );
}
