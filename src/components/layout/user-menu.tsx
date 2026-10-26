"use client";

import { LogIn, LogOut, Settings, Trophy, User, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";

export function UserMenu() {
  const { user, config, activity, signOut } = useApp();
  const router = useRouter();
  const name = activity?.preferences.displayName ?? "Student";
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Account menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-violet-soft text-xs font-semibold text-violet">{initials || "S"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-medium text-foreground">{name}</span>
          {config.mode === "demo" ? "Demo mode · this device" : user ? (user.isGuest ? "Guest account" : user.email) : "Not signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/profile"><User /> Profile & goals</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="md:hidden"><Link href="/leaderboard"><Trophy /> Leaderboard</Link></DropdownMenuItem>
        <DropdownMenuItem asChild className="md:hidden"><Link href="/friends"><Users /> Friends</Link></DropdownMenuItem>
        {config.mode === "connected" && (
          <>
            <DropdownMenuSeparator />
            {user ? (
              <DropdownMenuItem
                onSelect={async () => {
                  await signOut();
                  toast.success("Signed out");
                  router.push("/");
                }}
              >
                <LogOut /> Sign out
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem asChild><Link href="/auth/sign-in"><LogIn /> Sign in</Link></DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
