"use client";

import { HardDrive, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";

/** Always tells the student where their data is stored. Never silent. */
export function ModeBanner() {
  const { config, authReady, user, storageAvailable } = useApp();
  if (config.misconfigured) {
    return (
      <div role="status" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs sm:text-sm">
        <TriangleAlert className="mr-1.5 inline size-4 text-warning" aria-hidden />
        <strong>Configuration problem:</strong> {config.problems.join(" ")} Running a local preview: progress stays in this browser and online features are off.
      </div>
    );
  }
  if (config.mode === "demo") {
    return (
      <div role="status" className="border-b bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground sm:text-sm">
        <HardDrive className="mr-1.5 inline size-3.5" aria-hidden />
        <strong className="text-foreground">Demo mode.</strong> Progress is saved in this browser only{storageAvailable ? "" : " (storage is blocked, so it will reset when you close the tab)"}. Online multiplayer, friends, and leaderboards need a connected backend.
      </div>
    );
  }
  if (authReady && !user) {
    return (
      <div role="status" className="border-b bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground sm:text-sm">
        You&apos;re practicing without an account. Progress is saved on this device.{" "}
        <Link href="/auth/sign-in" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in to sync
        </Link>
      </div>
    );
  }
  return null;
}
