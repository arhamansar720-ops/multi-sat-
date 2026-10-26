"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const { supabase } = useApp();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setBusy(false);
    // Same message whether or not the account exists, to avoid revealing who has an account.
    if (error && !/not found/i.test(error.message)) setError("We couldn't send the email right now. Please try again in a minute.");
    else setSent(true);
  };

  return (
    <AuthCard title="Reset your password" description="We'll email you a link to choose a new password.">
      {sent ? (
        <p className="text-center text-sm text-muted-foreground" role="status">
          If an account exists for <strong className="text-foreground">{email}</strong>, a reset link is on its way.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email}>
            {busy && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link href="/auth/sign-in" className="text-primary hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
