"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { levelInfo } from "@/lib/progression/xp";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ModeBanner } from "./mode-banner";
import { NAV_ITEMS } from "./nav-items";
import { SiteFooter } from "./site-footer";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activity, config } = useApp();
  const xp = activity?.xpLedger.reduce((s, e) => s + e.amount, 0) ?? 0;
  const level = levelInfo(xp).level;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <ModeBanner />
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Logo href="/dashboard" />
          <nav aria-label="Main" className="ml-4 hidden items-center gap-0.5 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive(item.href) && "bg-muted text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Badge variant={config.mode === "demo" ? "outline" : "success"} className="hidden sm:inline-flex">
              {config.mode === "demo" ? "Demo" : "Online"}
            </Badge>
            <Badge variant="violet" aria-label={`Level ${level}, ${xp} XP`}>
              Lv {level} · {xp} XP
            </Badge>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12 md:pt-8">
        {children}
      </main>
      <SiteFooter className="hidden md:block" />
      <nav aria-label="Main mobile" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV_ITEMS.filter((i) => i.mobile).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground", isActive(item.href) && "text-primary")}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
