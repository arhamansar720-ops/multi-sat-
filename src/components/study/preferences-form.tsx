"use client";

import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { outlineForTrack } from "@/lib/content/bank";
import { TRACKS } from "@/lib/content/catalog";
import { AppError } from "@/lib/data/repository";
import type { Preferences } from "@/lib/engine/types";
import { displayNameSchema } from "@/lib/multiplayer/rules";
import { cn } from "@/lib/utils";

const MINUTES = ["10", "20", "30", "45", "60"];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Exam, goal, and skill preferences. Used by onboarding and the profile page. Only asks for what the app needs. */
export function PreferencesForm({ submitLabel, onSaved, markOnboarded }: { submitLabel: string; onSaved?: () => void; markOnboarded?: boolean }) {
  const { activity, repo, refreshActivity } = useApp();
  const prefs = activity?.preferences;
  const [form, setForm] = React.useState<Preferences | null>(prefs ?? null);
  const [classesText, setClassesText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (prefs && !form) {
      setForm({ ...prefs, timezone: prefs.timezone === "UTC" ? browserTimeZone() : prefs.timezone });
      setClassesText(prefs.classes.join(", "));
    }
  }, [prefs, form]);

  if (!form) return <p className="text-sm text-muted-foreground">Loading your preferences…</p>;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggleTrack = (slug: string) => set("tracks", form.tracks.includes(slug) ? form.tracks.filter((t) => t !== slug) : [...form.tracks, slug]);
  const skills = [...new Set(form.tracks.flatMap((t) => outlineForTrack(t).flatMap((s) => s.topics.flatMap((tp) => tp.skills.map((sk) => sk.skill)))))];
  const showScore = form.tracks.some((t) => t.startsWith("sat") || t.startsWith("psat"));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayNameSchema.safeParse(form.displayName);
    if (!name.success) {
      setNameError(name.error.issues[0]?.message ?? "Invalid display name.");
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      const next: Preferences = {
        ...form,
        displayName: name.data,
        tracks: form.tracks.length ? form.tracks : ["sat"],
        classes: classesText.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 20),
        focusSkills: form.focusSkills.filter((s) => skills.includes(s)),
        onboarded: markOnboarded ? true : form.onboarded,
      };
      await repo.savePreferences({
        displayName: next.displayName,
        tracks: next.tracks,
        classes: next.classes,
        targetDate: next.targetDate || null,
        targetScore: showScore ? next.targetScore : null,
        dailyMinutes: next.dailyMinutes,
        focusSkills: next.focusSkills,
        timezone: next.timezone,
        onboarded: next.onboarded,
      });
      await refreshActivity();
      toast.success("Preferences saved");
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof AppError ? err.message : "Couldn't save your preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-7" noValidate>
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          value={form.displayName}
          onChange={(e) => set("displayName", e.target.value)}
          maxLength={24}
          aria-invalid={Boolean(nameError)}
          aria-describedby="displayName-help"
          autoComplete="nickname"
          className="max-w-sm"
        />
        <p id="displayName-help" className={cn("text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
          {nameError ?? "Shown to friends, in rooms, and on leaderboards. A nickname is fine; you don't need to use your real name."}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Exams you&apos;re preparing for</legend>
        <div className="flex flex-wrap gap-2">
          {TRACKS.map((t) => {
            const on = form.tracks.includes(t.slug);
            return (
              <button
                key={t.slug}
                type="button"
                aria-pressed={on}
                onClick={() => toggleTrack(t.slug)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  on ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {on && <Check className="size-3.5" aria-hidden />} {t.shortName}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="classes">Current classes (optional)</Label>
          <Input id="classes" value={classesText} onChange={(e) => setClassesText(e.target.value)} placeholder="e.g. AP Stats, Algebra II" />
          <p className="text-xs text-muted-foreground">Separate with commas.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="targetDate">Target exam date (optional)</Label>
          <Input id="targetDate" type="date" value={form.targetDate ?? ""} onChange={(e) => set("targetDate", e.target.value || null)} />
        </div>
        {showScore && (
          <div className="space-y-2">
            <Label htmlFor="targetScore">Approximate SAT/PSAT target score (optional)</Label>
            <Input
              id="targetScore"
              type="number"
              inputMode="numeric"
              min={400}
              max={1600}
              step={10}
              value={form.targetScore ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Math.round(Number(e.target.value)) : null;
                set("targetScore", v !== null && Number.isFinite(v) ? Math.min(1600, Math.max(1, v)) : null);
              }}
              placeholder="e.g. 1400"
            />
            <p className="text-xs text-muted-foreground">Used only for your own goals. We don&apos;t predict official scores.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="timezone">Time zone</Label>
          <Input id="timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          <p className="text-xs text-muted-foreground">Used for streaks and daily goals. Detected: {browserTimeZone()}.</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium" id="minutes-label">
          Daily study goal
        </p>
        <Segmented label="Daily study goal in minutes" value={String(form.dailyMinutes)} onValueChange={(v) => set("dailyMinutes", Number(v))} options={MINUTES.map((m) => ({ value: m, label: `${m} min` }))} />
        <p className="text-xs text-muted-foreground">Your weekly goal is five days of this: {form.dailyMinutes * 5} minutes.</p>
      </div>

      {skills.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Skills you want to improve (optional)</legend>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-xl border p-3">
            {skills.map((s) => {
              const on = form.focusSkills.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("focusSkills", on ? form.focusSkills.filter((x) => x !== s) : [...form.focusSkills, s].slice(0, 20))}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-violet bg-violet-soft text-violet" : "text-muted-foreground hover:text-foreground")}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <Button type="submit" size="lg" disabled={saving}>
        {saving && <Loader2 className="animate-spin" />} {submitLabel}
      </Button>
    </form>
  );
}
