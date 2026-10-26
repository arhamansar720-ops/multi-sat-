import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentProps<"div"> {
  value: number; // 0..1
  label: string;
  indicatorClassName?: string;
}

export function Progress({ value, label, className, indicatorClassName, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div className={cn("h-full rounded-full bg-primary transition-[width] duration-500 ease-out", indicatorClassName)} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
