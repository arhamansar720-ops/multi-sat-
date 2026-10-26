"use client";

import { Loader2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/layout/auth-card";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AppError } from "@/lib/data/repository";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

function SignInForm() {
  const { supabase, continueAsGuest, refreshActivity } = useApp();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"password" | "guest" | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy("password");
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(null);
    if (error) {
      setError(/confirm/i.test(error.message) ? "Please confirm your email address first. Check your inbox for the link." : "That email and password don't match an account.");
      return;
    }
    toast.success("Signed in");
    await refreshActivity();
    router.push(next);
    router.refresh();
  };

  const guest = async () => {
    setBusy("guest");
    try {
      await continueAsGuest();
      toast.success("You're in as a guest. Create an account anytime to keep your progress.");
      router.push(next);
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Guest sign-in failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AuthCard title="Welcome back" description="Sign in to sync your progress and play online.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/auth/reset-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy !== null || !email || !password}>
          {busy === "password" && <Loader2 className="animate-spin" />} Sign in
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" /> or <Separator className="flex-1" />
      </div>
      <Button variant="outline" className="w-full" onClick={guest} disabled={busy !== null}>
        {busy === "guest" ? <Loader2 className="animate-spin" /> : <UserRound />} Try a demo account (no email needed)
      </Button>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/auth/sign-up${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <React.Suspense fallback={null}>
      <SignInForm />
    </React.Suspense>
  );
}
