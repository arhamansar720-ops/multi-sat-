"use client";

import { Lock, WifiOff } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/states";

/** Renders children only for registered (non-guest) users on a connected deployment; otherwise explains why. */
export function RequiresAccount({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { config, authReady, user } = useApp();
  if (config.mode !== "connected") {
    return (
      <EmptyState
        icon={WifiOff}
        title={`${feature} needs a connected backend`}
        description={`This deployment is running in demo mode, where data stays in your browser. ${feature} requires the Supabase setup described in the README.`}
        action={
          <Button asChild variant="outline">
            <Link href="/play/local">Try a local practice match</Link>
          </Button>
        }
      />
    );
  }
  if (!authReady) return <Skeleton className="h-64" />;
  if (!user || user.isGuest) {
    return (
      <EmptyState
        icon={Lock}
        title={`Create a free account to use ${feature.toLowerCase()}`}
        description={user?.isGuest ? "Guest accounts can play in rooms, but friends and leaderboards need a full account. Your guest progress carries over when you sign up." : "Sign in or create an account to connect with friends and compare progress."}
        action={
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/auth/sign-up">Create account</Link>
            </Button>
            {!user && (
              <Button asChild variant="outline">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
            )}
          </div>
        }
      />
    );
  }
  return <>{children}</>;
}
