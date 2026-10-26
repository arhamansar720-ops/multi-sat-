"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { PreferencesForm } from "@/components/study/preferences-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, AppError } from "@/lib/data/repository";
import { computeProgress } from "@/lib/progression/stats";

export default function ProfilePage() {
  const { activity, user, supabase, config, dataScope } = useApp();
  const [username, setUsername] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!supabase || !user || user.isGuest) return;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setUsername((data?.username as string) ?? null);
        setDraftName((data?.username as string) ?? "");
      });
  }, [supabase, user]);

  if (!activity) return <Skeleton className="h-96" />;
  const p = computeProgress(activity);

  const saveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/me/preferences", { method: "PUT", json: { username: draftName.trim() } });
      setUsername(draftName.trim());
      toast.success("Username updated");
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "Couldn't update your username.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Profile" description="Your display name, exams, and goals." />
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Study preferences</CardTitle>
            <CardDescription>
              {dataScope === "device" ? "Saved in this browser." : "Saved to your account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm submitLabel="Save changes" markOnboarded />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{activity.preferences.displayName}</CardTitle>
              <CardDescription>
                {config.mode === "demo" ? <Badge variant="outline">Demo · this device</Badge> : user?.isGuest ? <Badge variant="outline">Guest</Badge> : user ? <Badge variant="success">Account</Badge> : <Badge variant="outline">Not signed in</Badge>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Level <strong>{p.level.level}</strong> · {p.totalXp} XP
              </p>
              <Progress value={p.level.progress} label="Level progress" indicatorClassName="bg-violet" />
              <p className="text-muted-foreground">
                {activity.achievements.length} achievement{activity.achievements.length === 1 ? "" : "s"} · best streak {p.streak.best} day{p.streak.best === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
          {user && !user.isGuest && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Username</CardTitle>
                <CardDescription>Friends add you by username. It never includes your email.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveUsername} className="space-y-3">
                  <Label htmlFor="username" className="sr-only">
                    Username
                  </Label>
                  <Input id="username" value={draftName} onChange={(e) => setDraftName(e.target.value)} pattern="[A-Za-z0-9_]{3,20}" maxLength={20} placeholder={username ?? "loading…"} />
                  <Button type="submit" size="sm" disabled={saving || !draftName.trim() || draftName.trim() === username}>
                    {saving && <Loader2 className="animate-spin" />} Update username
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
