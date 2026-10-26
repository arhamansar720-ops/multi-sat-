import { AlertTriangle, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <div className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, className }: { title?: string; message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive-soft px-6 py-8 text-center", className)}>
      <AlertTriangle className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", icon: Icon, children, className }: { tone?: "info" | "warning" | "success" | "violet"; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "bg-primary-soft text-foreground border-primary/20",
    warning: "bg-warning-soft text-foreground border-warning/30",
    success: "bg-success-soft text-foreground border-success/30",
    violet: "bg-violet-soft text-foreground border-violet/20",
  } as const;
  const iconTone = { info: "text-primary", warning: "text-warning", success: "text-success", violet: "text-violet" } as const;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>
      {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", iconTone[tone])} aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
