"use client";

import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";

export function LandingHeader() {
  const { config, user, authReady } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {config.mode === "connected" && authReady && !user && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link href="/auth/sign-up">Create account</Link>
              </Button>
            </>
          )}
          <Button asChild size="sm">
            <Link href="/dashboard">{user || config.mode === "demo" ? "Open dashboard" : "Try the demo"}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
