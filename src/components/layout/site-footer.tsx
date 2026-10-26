import Link from "next/link";
import { PRODUCT } from "@/lib/config";
import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t", className)}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl space-y-1">
          <p className="font-medium text-foreground">{PRODUCT.name}</p>
          <p className="text-xs leading-relaxed">{PRODUCT.disclaimer}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/help" className="hover:text-foreground">Help</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
