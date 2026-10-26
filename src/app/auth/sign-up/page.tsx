"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/layout/auth-card";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayNameSchema } from "@/lib/multiplayer/rules";

function SignUpForm() {
  const { supabase, user, refreshActivity } = useApp();
  const router = useRouter();
  const nextParam = useSearchParams().get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/onboarding";
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const parsedName = displayNameSchema.safeParse(name);
    if (!parsedName.success) return setError(parsedName.error.issues[0]?.message ?? "Choose a display name.");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    setError(null);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    if (user?.isGuest) {
      // Upgrade the guest account in place so existing progress is kept.
      const { data, error } = await supabase.auth.updateUser({ email: email.trim(), password, data: { display_name: parsedName.data } }, { emailRedirectTo: redirect });
      setBusy(false);
      if (error) return setError(/registered|already/i.test(error.message) ? "An account with that email already exists. Try signing in." : error.message);
      await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: parsedName.data }) });
      if (data.user?.email === email.trim().toLowerCase()) {
        toast.success("Account created. Your guest progress is saved.");
        await refreshActivity();
        router.push(next);
      } else {
        setSentTo(email.trim());
      }
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: parsedName.data }, emailRedirectTo: redirect },
    });
    setBusy(false);
    if (error) return setError(/registered/i.test(error.message) ? "An account with that email already exists. Try signing in." : error.message);
    if (data.session) {
      toast.success("Account created");
      await refreshActivity();
      router.push(next);
    } else {
      setSentTo(email.trim());
    }
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto size-10 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>. Open it on this device to finish setting up your account.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Keep practicing meanwhile</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={user?.isGuest ? "Save your guest progress" : "Create your account"} description="Free. We only ask for what we need to save your progress.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-describedby="name-help" />
          <p id="name-help" className="text-xs text-muted-foreground">
            Shown on leaderboards and in rooms. A nickname is fine.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="email-help" />
          <p id="email-help" className="text-xs text-muted-foreground">
            Used for sign-in and password resets only. Never shown to other students.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !email || !password || !name}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function SignUpPage() {
  return (
    <React.Suspense fallback={null}>
      <SignUpForm />
    </React.Suspense>
  );
}
