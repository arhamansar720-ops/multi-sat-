"use client";

import { ArrowRight, BookOpen, CalendarCheck, Clock, Flame, GraduationCap, Loader2, Play, RotateCcw, Sparkles, Swords, Target, TrendingDown, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { WeeklyChart } from "@/components/dashboard/weekly-chart";
import { useApp } from "@/components/providers/app-provider";
import { useStartSession } from "@/components/study/use-start-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { primaryTrackForCourse } from "@/lib/content/catalog";
import type { PracticeSession } from "@/lib/engine/types";
import { DAILY_CHALLENGE_SIZE, dailyKeyFor } from "@/lib/engine/selection";
import { BAND_LABEL, type SkillMastery } from "@/lib/progression/mastery";
import { recommendNext } from "@/lib/progression/recommendations";
import { computeProgress } from "@/lib/progression/stats";
import { cn, formatDuration, pct, relativeTime } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { activity, activityError, refreshActivity, repo, dataScope, user, config } = useApp();
  const { start, starting } = useStartSession();
  const [inProgress, setInProgress] = React.useState<PracticeSession[]>([]);

  React.useEffect(() => {
    repo.listInProgress().then(setInProgress).catch(() => setInProgress([]));
  }, [repo]);

  if (activityError) return <ErrorState message={activityError} onRetry={refreshActivity} />;
  if (!activity) return <DashboardSkeleton />;

  const p = computeProgress(activity);
  const rec = recommendNext(p.skills, activity.preferences.tracks);
  const dailyDone = activity.results.some((r) => r.dailyKey === dailyKeyFor(new Date()));
  const reviewCount = new Set(activity.results.flatMap((r) => r.items.filter((i) => !i.correct).map((i) => i.questionId))).size;
  const name = activity.preferences.displayName;
  const resume = inProgress.find((s) => !s.deadline || new Date(s.deadline).getTime() > Date.now());

  return (
    <div className="space-y-8">
      {/* Top section */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="overflow-hidden">
          <CardContent className="space-y-5 pt-5 sm:pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {greeting()}, {name}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {dataScope === "device" ? "Progress on this device." : user?.isGuest ? "Guest account: progress is saved online for this browser." : "Progress synced to your account."}
                </p>
              </div>
              <Button size="lg" onClick={() => start(rec.config)} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Play />} Quick start
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric icon={Target} label="Today's goal" value={`${Math.round(p.today.minutes)} / ${p.today.goalMinutes} min`}>
                <Progress value={p.today.progress} label="Daily goal progress" indicatorClassName="bg-success" />
              </Metric>
              <Metric icon={Zap} label={`Level ${p.level.level}`} value={`${p.totalXp} XP`}>
                <Progress value={p.level.progress} label={`Level progress: ${p.level.intoLevel} of ${p.level.needed} XP`} indicatorClassName="bg-violet" />
                <p className="mt-1 text-xs text-muted-foreground">{p.level.needed - p.level.intoLevel} XP to level {p.level.level + 1}</p>
              </Metric>
              <Metric icon={Flame} label="Streak" value={`${p.streak.current} day${p.streak.current === 1 ? "" : "s"}`}>
                <p className="text-xs text-muted-foreground">{p.streak.activeToday ? "You've studied today." : p.streak.current ? "Study today to keep it going." : "Finish a session to start a streak."}</p>
              </Metric>
            </div>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-violet" aria-hidden /> Recommended next
            </CardDescription>
            <CardTitle className="text-lg">{rec.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-4">
            <p className="text-sm text-muted-foreground">{rec.reason}</p>
            <Button variant="outline" onClick={() => start(rec.config)} disabled={starting} className="self-start">
              Start this session <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      </section>

      {!activity.preferences.onboarded && (
        <Notice tone="violet" icon={GraduationCap}>
          <span className="font-medium">Personalize your plan.</span> Tell us your exams, goals, and daily study time to get better recommendations.{" "}
          <Link href="/onboarding" className="font-medium text-primary underline-offset-4 hover:underline">
            Set up in 1 minute
          </Link>
        </Notice>
      )}

      {/* Action cards */}
      <section aria-label="Study options" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resume ? (
          <ActionCard href={`/practice/${resume.id}`} icon={BookOpen} title="Continue studying" body={`${resume.title} · started ${relativeTime(resume.startedAt)}`} tone="primary" />
        ) : (
          <ActionCard onClick={() => start(rec.config)} icon={BookOpen} title="Continue studying" body="Pick up with your recommended session." tone="primary" />
        )}
        <ActionCard href="/play" icon={Swords} title="Play with friends" body={config.mode === "connected" ? "Create a room or join with a code." : "Try a local demo match against practice bots."} tone="violet" />
        <ActionCard href="/study/sat" icon={GraduationCap} title="SAT practice" body="Reading and Writing plus Math." />
        <ActionCard href="/study/psat-nmsqt" icon={BookOpen} title="PSAT practice" body="Easy and medium SAT Suite questions." />
        <ActionCard href="/courses" icon={GraduationCap} title="Find a course" body="Search every SAT and AP course, with practice tests and official links." />
        <ActionCard href="/review" icon={RotateCcw} title="Review incorrect answers" body={reviewCount ? `${reviewCount} question${reviewCount === 1 ? "" : "s"} to revisit.` : "Nothing to review yet."} />
        <ActionCard
          onClick={() => start({ mode: "daily", track: "sat", difficulty: "mixed", count: DAILY_CHALLENGE_SIZE, timeLimitSec: null, feedback: "end", hints: false })}
          icon={CalendarCheck}
          title="Daily challenge"
          body={dailyDone ? "Completed today. Come back tomorrow for a new set." : `${DAILY_CHALLENGE_SIZE} shared questions · bonus XP`}
          badge={dailyDone ? "Done" : "New"}
        />
        <ActionCard href="/progress" icon={TrendingUp} title="Progress analytics" body="Mastery by skill, difficulty, and exam." />
      </section>

      {/* Progress */}
      {p.isEmpty ? (
        <EmptyState
          icon={Play}
          title="Your progress will appear here"
          description="Answer a few questions and we'll start tracking accuracy, study time, streaks, and skill mastery. Five questions takes about five minutes."
          action={
            <Button onClick={() => start({ mode: "quick", track: activity.preferences.tracks[0] ?? "sat", difficulty: "mixed", count: 5, timeLimitSec: null, feedback: "immediate", hints: true })} disabled={starting}>
              {starting ? <Loader2 className="animate-spin" /> : <Play />} Start your first session
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="progress-heading" className="space-y-4">
          <h2 id="progress-heading" className="text-lg font-semibold">
            Your progress
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Questions answered" value={String(p.questionsAnswered)} />
            <StatTile label="Accuracy" value={pct(p.accuracy)} />
            <StatTile label="Study time" value={formatDuration(p.studySeconds)} />
            <StatTile label="Sessions" value={String(p.sessionsCompleted)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>This week</CardTitle>
                <CardDescription>
                  {Math.round(p.week.minutes)} of {p.week.goalMinutes} minutes toward your weekly goal · {p.week.xp} XP
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={p.week.progress} label="Weekly goal progress" indicatorClassName="bg-success" />
                <WeeklyChart days={p.week.days} />
              </CardContent>
            </Card>
            <div className="grid gap-4">
              <SkillList title="Strongest skills" icon={TrendingUp} skills={p.strongest} empty="Answer at least 3 questions in a skill to rate it." />
              <SkillList title="Needs more practice" icon={TrendingDown} skills={p.weakest} empty="No weak spots detected yet." onPractice={(s) => start({ mode: "focus", track: primaryTrackForCourse(s.course)?.slug ?? rec.config.track, skills: [s.skill], difficulty: "mixed", count: 5, timeLimitSec: null, feedback: "immediate", hints: true })} />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {p.recent.map((r) => (
                  <li key={r.sessionId}>
                    <Link href={`/results/${r.sessionId}`} className="flex items-center gap-3 rounded-lg py-3 hover:bg-muted/50 sm:px-2">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">{Math.round(r.accuracy * 100)}%</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.correctCount}/{r.total} correct · {formatDuration(r.durationSec)} · {relativeTime(r.completedAt)}
                        </span>
                      </span>
                      <Badge variant="violet">+{r.xpTotal} XP</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, children }: { icon: typeof Clock; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function ActionCard({ href, onClick, icon: Icon, title, body, tone, badge }: { href?: string; onClick?: () => void; icon: typeof Clock; title: string; body: string; tone?: "primary" | "violet"; badge?: string }) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn("flex size-9 items-center justify-center rounded-xl", tone === "violet" ? "bg-violet-soft text-violet" : "bg-primary-soft text-primary")}>
          <Icon className="size-4" aria-hidden />
        </span>
        {badge && <Badge variant={badge === "Done" ? "success" : "default"}>{badge}</Badge>}
      </div>
      <span className="mt-3 block font-semibold">{title}</span>
      <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
    </>
  );
  const cls = "block h-full rounded-2xl border bg-card p-4 text-left shadow-card transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(cls, "w-full")}>
      {inner}
    </button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SkillList({ title, icon: Icon, skills, empty, onPractice }: { title: string; icon: typeof Clock; skills: SkillMastery[]; empty: string; onPractice?: (s: SkillMastery) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {skills.map((s) => (
              <li key={s.key} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.skill}</p>
                  <p className="text-xs text-muted-foreground">
                    {BAND_LABEL[s.band]} · {pct(s.score)} · {s.attempts} attempts
                  </p>
                </div>
                {onPractice && (
                  <Button size="sm" variant="outline" onClick={() => onPractice(s)}>
                    Practice
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
