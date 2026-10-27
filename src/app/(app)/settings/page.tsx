"use client";

import { Download, KeyRound, Loader2, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Notice } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { localStore } from "@/lib/data/local-store";
import { api, AppError } from "@/lib/data/repository";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { activity, repo, refreshActivity, config, user, online, signOut, dataScope } = useApp();
  const router = useRouter();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleteText, setDeleteText] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const prefs = activity?.preferences;

  const savePrivacy = async (patch: { leaderboardOptIn?: boolean; shareActivityWithFriends?: boolean }) => {
    try {
      await repo.savePreferences(patch);
      await refreshActivity();
      toast.success("Privacy setting saved");
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "Couldn't save that setting.");
    }
  };

  const exportData = () => {
    if (!activity) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...activity }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "studyduel-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!online) return;
    if (password.length < 8) return toast.error("Use at least 8 characters.");
    setBusy("password");
    try {
      await api("/api/auth/password", { method: "PUT", json: { password } });
      setPassword("");
      toast.success("Password updated. Other devices were signed out.");
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "Couldn't update your password.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Appearance, privacy, notifications, and account." />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          {mounted && (
            <Segmented
              label="Theme"
              value={(theme as "light" | "dark" | "system") ?? "system"}
              onValueChange={setTheme}
              options={[
                { value: "light", label: <span className="flex items-center gap-1.5"><Sun className="size-4" aria-hidden /> Light</span> },
                { value: "dark", label: <span className="flex items-center gap-1.5"><Moon className="size-4" aria-hidden /> Dark</span> },
                { value: "system", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" aria-hidden /> System</span> },
              ]}
            />
          )}
          <p className="mt-3 text-sm text-muted-foreground">Animations follow your device&apos;s reduced-motion setting.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>Your study data is private by default. Leaderboards only ever show your display name and aggregate totals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {config.mode === "demo" || !user || user.isGuest ? (
            <Notice tone="info">
              {config.mode === "demo"
                ? "In demo mode nothing leaves this browser, so there is nothing to share."
                : "Guests and signed-out students never appear on leaderboards. Create an account to control these settings."}
            </Notice>
          ) : (
            prefs && (
              <>
                <ToggleRow id="lb" label="Appear on global and weekly leaderboards" description="Off hides you from global rankings. Friends leaderboards only include accepted friends." checked={prefs.leaderboardOptIn} onChange={(v) => savePrivacy({ leaderboardOptIn: v })} />
                <ToggleRow id="share" label="Share activity with friends" description="Lets accepted friends see your weekly XP, last active day, and streak. Never individual answers." checked={prefs.shareActivityWithFriends} onChange={(v) => savePrivacy({ shareActivityWithFriends: v })} />
              </>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>In-app notifications (timer warnings, achievements, and match updates) are always on while you use the app.</p>
          <p>Email and push study reminders are not available yet, so there&apos;s nothing to turn on here.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account and data</CardTitle>
          <CardDescription>{dataScope === "device" ? "Your progress lives in this browser." : user?.isGuest ? "You're using a guest account." : `Signed in as ${user?.email ?? "your account"}.`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportData} disabled={!activity}>
              <Download /> Export my data (JSON)
            </Button>
            {user && (
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                  toast.success("Signed out");
                  router.push("/");
                }}
              >
                <LogOut /> Sign out
              </Button>
            )}
            {config.mode === "connected" && (!user || user.isGuest) && (
              <Button asChild>
                <Link href="/auth/sign-up">{user?.isGuest ? "Save progress with an account" : "Create an account"}</Link>
              </Button>
            )}
          </div>

          {user && !user.isGuest && (
            <form onSubmit={changePassword} className="space-y-2">
              <Label htmlFor="new-password">Change password</Label>
              <div className="flex max-w-md gap-2">
                <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} placeholder="New password (8+ characters)" />
                <Button type="submit" variant="secondary" disabled={busy === "password"}>
                  {busy === "password" ? <Loader2 className="animate-spin" /> : <KeyRound />} Update
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-xl border border-destructive/30 p-4">
            <p className="font-medium">Danger zone</p>
            <p className="mb-3 text-sm text-muted-foreground">
              {dataScope === "device" ? "Remove all StudyDuel data stored in this browser." : "Permanently delete your account and all study history, XP, and match records."}
            </p>
            {dataScope === "device" ? (
              <Button variant="destructive" onClick={() => setConfirmClear(true)}>
                <Trash2 /> Clear data on this device
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete account
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all data on this device?"
        description="This deletes your sessions, XP, achievements, and preferences stored in this browser. It can't be undone."
        confirmLabel="Clear data"
        destructive
        onConfirm={async () => {
          localStore.clearAll();
          await refreshActivity();
          toast.success("Local data cleared");
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          setDeleteText("");
        }}
        title="Delete your account?"
        description="This permanently deletes your account and everything linked to it. Type DELETE to confirm."
        confirmLabel="Delete forever"
        destructive
        onConfirm={async () => {
          if (deleteText !== "DELETE") return toast.error("Type DELETE to confirm.");
          try {
            await api("/api/me/account", { method: "DELETE", json: { confirm: "DELETE" } });
            await signOut();
            toast.success("Your account was deleted");
            router.push("/");
          } catch (err) {
            toast.error(err instanceof AppError ? err.message : "Couldn't delete your account.");
          }
        }}
      >
        <Input aria-label="Type DELETE to confirm" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" />
      </ConfirmDialog>
    </div>
  );
}

function ToggleRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-d`} className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-d`} />
    </div>
  );
}
