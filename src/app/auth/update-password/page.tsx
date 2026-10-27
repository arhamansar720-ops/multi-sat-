"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { AuthCard } from "@/components/layout/auth-card";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, AppError } from "@/lib/data/repository";

function UpdatePasswordForm() {
  const { online, user, authReady, refreshUser } = useApp();
  const router = useRouter();
  // Present when arriving from a reset email; otherwise the signed-in user changes their own password.
  const token = useSearchParams().get("token");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!online) return;
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      if (token) await api("/api/auth/reset", { method: "PUT", json: { token, password } });
      else await api("/api/auth/password", { method: "PUT", json: { password } });
    } catch (err) {
      setBusy(false);
      return setError(err instanceof AppError ? err.message : "Couldn't update your password.");
    }
    await refreshUser();
    setBusy(false);
    toast.success("Password updated");
    router.push("/dashboard");
  };

  return (
    <AuthCard title="Choose a new password">
      {!token && authReady && (!user || user.isGuest) ? (
        <p className="text-center text-sm text-muted-foreground">This reset link has expired or was already used. Request a new one from the sign-in page.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !password}>
            {busy && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function UpdatePasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <UpdatePasswordForm />
    </React.Suspense>
  );
}
