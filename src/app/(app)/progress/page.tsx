"use client";

import { BarChart3, Flame, Info, Lock } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AchievementIcon } from "@/components/dashboard/celebration";
import { WeeklyChart } from "@/components/dashboard/weekly-chart";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { ACHIEVEMENTS } from "@/lib/progression/achievements";
import { BAND_LABEL, MASTERY_MIN_ATTEMPTS, type MasteryBand } from "@/lib/progression/mastery";
import { computeProgress, type BreakdownRow } from "@/lib/progression/stats";
import { XP_RULES, xpForLevel } from "@/lib/progression/xp";
import { cn, formatDuration, pct } from "@/lib/utils";

const BAND_STYLE: Record<MasteryBand, string> = {
  strong: "bg-success",
  developing: "bg-primary",
  "needs-practice": "bg-warning",
  insufficient: "bg-muted-foreground/40",
};

export default function ProgressPage() {
  const { activity, activityError, refreshActivity } = useApp();
  const [metric, setMetric] = React.useState<"questions" | "minutes" | "xp">("questions");

  if (activityError) return <ErrorState message={activityError} onRetry={refreshActivity} />;
  if (!activity) return <Skeleton className="h-96" />;
  const p = computeProgress(activity);
  const earned = new Map(activity.achievements.map((a) => [a.id, a.earnedAt]));

  return (
    <>
      <PageHeader title="Progress" description="Everything here is calculated from your own answers. Nothing is estimated or predicted." />
      {p.isEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="No activity yet"
          description="Complete a practice session to see accuracy by topic, skill mastery, and your weekly activity."
          action={
            <Button asChild>
              <Link href="/study">Start practicing</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Level" value={String(p.level.level)} sub={`${p.totalXp} XP total`} />
            <Tile label="Current streak" value={`${p.streak.current}d`} sub={`Best ${p.streak.best}d`} />
            <Tile label="Accuracy" value={pct(p.accuracy)} sub={`${p.correct} of ${p.questionsAnswered}`} />
            <Tile label="Study time" value={formatDuration(p.studySeconds)} sub={`${p.sessionsCompleted} sessions`} />
            <Tile label="Matches" value={String(p.matches.played)} sub={`${p.matches.wins} online wins`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Last 7 days</CardTitle>
                  <CardDescription>Daily activity in your time zone ({activity.preferences.timezone}).</CardDescription>
                </div>
                <Segmented
                  label="Chart metric"
                  value={metric}
                  onValueChange={setMetric}
                  options={[
                    { value: "questions", label: "Questions" },
                    { value: "minutes", label: "Minutes" },
                    { value: "xp", label: "XP" },
                  ]}
                />
              </CardHeader>
              <CardContent>
                <WeeklyChart days={p.last7} metric={metric} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Goals</CardTitle>
                <CardDescription>Change your daily target in your profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Goal label="Today" value={`${Math.round(p.today.minutes)} / ${p.today.goalMinutes} min`} progress={p.today.progress} />
                <Goal label="This week (Mon–Sun)" value={`${Math.round(p.week.minutes)} / ${p.week.goalMinutes} min`} progress={p.week.progress} />
                <Goal label={`Level ${p.level.level} → ${p.level.level + 1}`} value={`${p.level.intoLevel} / ${p.level.needed} XP`} progress={p.level.progress} tone="bg-violet" />
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Flame className="size-4 text-warning" aria-hidden /> Active on {p.activeDays.length} day{p.activeDays.length === 1 ? "" : "s"} total
                </p>
              </CardContent>
            </Card>
          </div>

          {p.readiness.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Exam readiness indicators</CardTitle>
                <CardDescription>Share of each exam&apos;s skills where your mastery is Strong. A practice indicator, not a score prediction.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {p.readiness.map((r) => (
                  <Goal key={r.track} label={r.name} value={`${r.skillsStrong} strong · ${r.skillsPracticed}/${r.skillsTotal} practiced`} progress={r.indicator} tone="bg-success" />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Skill mastery</CardTitle>
              <CardDescription>
                Weighted accuracy over your last 20 attempts per skill (harder questions count more, recent ones slightly more). Rated after {MASTERY_MIN_ATTEMPTS} attempts. Based on solo practice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {p.skills.map((s) => (
                  <li key={s.key} className="grid gap-2 py-3 sm:grid-cols-[1fr_200px_120px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.skill}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.courseName} · {s.topic}
                      </p>
                    </div>
                    <Progress value={s.score ?? s.accuracy} label={`${s.skill} mastery`} indicatorClassName={BAND_STYLE[s.band]} />
                    <div className="flex items-center gap-2 text-xs sm:justify-end">
                      <Badge variant={s.band === "strong" ? "success" : s.band === "needs-practice" ? "warning" : s.band === "developing" ? "default" : "outline"}>{BAND_LABEL[s.band]}</Badge>
                      <span className="tabular-nums text-muted-foreground">
                        {s.correct}/{s.attempts}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <Breakdown title="By exam or course" rows={p.byCourse} />
            <Breakdown title="By difficulty" rows={p.byDifficulty} />
            <Breakdown title="By question type" rows={p.byType} />
          </div>
        </div>
      )}

      <section aria-labelledby="ach-heading" className="mt-10 space-y-4">
        <h2 id="ach-heading" className="text-lg font-semibold">
          Achievements
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const when = earned.get(a.id);
            return (
              <li key={a.id} className={cn("flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card", !when && "opacity-70")}>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", when ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
                  {when ? <AchievementIcon icon={a.icon} className="size-5" /> : <Lock className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {a.name}
                    <span className="sr-only">{when ? " (earned)" : " (locked)"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{when ? `Earned ${new Date(when).toLocaleDateString()}` : a.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="rules-heading" className="mt-10">
        <Notice tone="info" icon={Info}>
          <p id="rules-heading" className="mb-1 font-medium">How XP and levels work</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>
              Correct answers: {XP_RULES.correct.easy} / {XP_RULES.correct.medium} / {XP_RULES.correct.hard} XP for easy / medium / hard, paid once per question every {XP_RULES.freshWindowDays} days, up to {XP_RULES.dailySoloCorrectCap} XP a day.
            </li>
            <li>
              Finishing a session (3+ answers): {XP_RULES.sessionComplete} XP. First session of the day: +{XP_RULES.streakBonus}. Daily Challenge: +{XP_RULES.dailyChallenge} once per day.
            </li>
            <li>
              Online matches: {XP_RULES.match.correct} per correct answer, {XP_RULES.match.participation} for finishing, +{XP_RULES.match.win} for winning against at least one other person.
            </li>
            <li>Level L needs 50 × L × (L − 1) total XP: level 2 at 100, level 3 at 300, level 4 at {xpForLevel(4)}, level 5 at {xpForLevel(5)}.</li>
            <li>Streaks count calendar days in your saved time zone with at least one answered question.</li>
          </ul>
        </Notice>
      </section>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Goal({ label, value, progress, tone = "bg-success" }: { label: string; value: string; progress: number; tone?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}</span>
      </div>
      <Progress value={progress} label={label} indicatorClassName={tone} />
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.filter((r) => r.answered > 0).length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
        {rows
          .filter((r) => r.answered > 0)
          .map((r) => (
            <div key={r.key} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {pct(r.accuracy)} · {r.answered}
                </span>
              </div>
              <Progress value={r.accuracy ?? 0} label={`${r.label} accuracy`} />
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
