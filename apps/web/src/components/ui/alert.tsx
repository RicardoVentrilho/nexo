import * as React from "react";
import { cn } from "../../lib/utils";

export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border bg-muted px-4 py-3 text-sm", className)} role="status" {...props} />;
}
