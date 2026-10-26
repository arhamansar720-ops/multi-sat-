"use client";

import { ArrowRight, Check, Clock, Loader2, RotateCcw, SearchX, Sparkles, Target, Trophy, X, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { Celebration } from "@/components/dashboard/celebration";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { QuestionReview } from "@/components/exam/question-review";
import { useStartSession } from "@/components/study/use-start-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { getQuestion } from "@/lib/content/bank";
import { AppError } from "@/lib/data/repository";
import { MODE_LABELS, type SessionResult } from "@/lib/engine/types";
import { attemptsFromResults, computeSkillMastery } from "@/lib/progression/mastery";
import { recommendNext } from "@/lib/progression/recommendations";
import { levelInfo } from "@/lib/progression/xp";
import { cn, formatDuration, pct } from "@/lib/utils";

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { repo, authReady, activity } = useApp();
  const [result, setResult] = React.useState<SessionResult | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setResult(await repo.getResult(sessionId));
    } catch (err) {
      setError(err instanceof AppError ? err.message : "Couldn't load these results.");
    }
  }, [repo, sessionId]);
  React.useEffect(() => {
    if (authReady) void load();
  }, [authReady, load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (result === undefined) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading results">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (result === null) {
    return (
      <EmptyState
        icon={SearchX}
        title="No results yet"
        description="This session hasn't been submitted, or it belongs to a different account or device."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link href={`/practice/${sessionId}`}>Resume session</Link></Button>
            <Button asChild><Link href="/study">Study</Link></Button>
          </div>
        }
      />
    );
  }
  return <ResultsView result={result} totalXp={activity?.xpLedger.reduce((s, e) => s + e.amount, 0) ?? null} />;
}

function ResultsView({ result, totalXp }: { result: SessionResult; totalXp: number | null }) {
  const { activity } = useApp();
  const { start, starting } = useStartSession();
  const questions = result.items.map((i) => ({ item: i, q: getQuestion(i.questionId) })).filter((x): x is { item: typeof x.item; q: NonNullable<typeof x.q> } => Boolean(x.q));
  const incorrect = questions.filter((x) => !x.item.correct);
  const ledgerHasThis = activity?.xpLedger.some((e) => e.sourceId === result.sessionId);
  const after = totalXp !== null && ledgerHasThis ? totalXp : null;
  const levelUp = after !== null && result.xpTotal > 0 && levelInfo(after).level > levelInfo(after - result.xpTotal).level ? levelInfo(after).level : null;

  // Topic breakdown, and section breakdown for simulations.
  const group = (key: (q: (typeof questions)[number]["q"]) => string) => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const { item, q } of questions) {
      const k = key(q);
      const v = map.get(k) ?? { correct: 0, total: 0 };
      v.total++;
      if (item.correct) v.correct++;
      map.set(k, v);
    }
    return [...map.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => a.correct / a.total - b.correct / b.total);
  };
  const topics = group((q) => `${q.topic} · ${q.skill}`);
  const sections = group((q) => q.section);

  const recommendation = recommendNext(computeSkillMastery(attemptsFromResults(activity?.results ?? [result])), [result.config.track, ...(activity?.preferences.tracks ?? [])]);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <Badge variant="outline">{MODE_LABELS[result.config.mode]}</Badge>
            {new Date(result.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        }
        title={result.title}
        description={
          result.config.mode === "simulation"
            ? "Independent practice simulation. This report shows your raw practice results and is not an official or predicted score."
            : "Practice results. Short quizzes do not produce an official or predicted exam score."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => start({ ...result.config, questionIds: undefined })} disabled={starting || result.config.mode === "review" || result.config.mode === "daily"}>
              <RotateCcw /> Similar session
            </Button>
            <Button asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {result.late && (
          <Notice tone="warning">
            This session was submitted after its time limit, so it was graded from the answers saved before time ran out, and correct-answer XP wasn&apos;t awarded.
          </Notice>
        )}
        <Celebration levelUp={levelUp} achievements={result.newAchievements} />

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile icon={Target} label="Score" value={`${result.correctCount} / ${result.total}`} sub={`${result.total - result.correctCount} incorrect or skipped`} tone="primary" />
          <SummaryTile icon={Check} label="Accuracy" value={pct(result.accuracy)} sub={`${result.answeredCount} answered`} tone="success" />
          <SummaryTile icon={Zap} label="XP earned" value={`+${result.xpTotal}`} sub={result.xp.length ? result.xp.map((x) => x.label).slice(0, 2).join(", ") : "No XP this time"} tone="violet" />
          <SummaryTile icon={Clock} label="Time spent" value={formatDuration(result.durationSec)} sub={result.config.timeLimitSec ? `of ${formatDuration(result.config.timeLimitSec)}` : "Untimed"} tone="muted" />
        </section>

        {result.challengeScore !== undefined && (
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:pt-6">
              <Trophy className="size-8 text-warning" aria-hidden />
              <div className="flex-1">
                <p className="text-lg font-semibold">Challenge score: {result.challengeScore}</p>
                <p className="text-sm text-muted-foreground">
                  100 per correct answer + up to 20 per correct answer for unused time.{" "}
                  {result.isPersonalBest ? "New personal best!" : result.previousBest !== null && result.previousBest !== undefined ? `Personal best: ${result.previousBest}.` : ""}
                </p>
              </div>
              {result.isPersonalBest && <Badge variant="warning"><Sparkles /> Personal best</Badge>}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {result.config.mode === "simulation" && sections.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Section report</CardTitle>
                  <CardDescription>Raw correct answers by section.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sections.map((s) => (
                    <BreakdownRow key={s.label} {...s} />
                  ))}
                </CardContent>
              </Card>
            )}
            <section aria-labelledby="review-heading" className="space-y-3">
              <div className="flex items-end justify-between">
                <h2 id="review-heading" className="text-lg font-semibold">
                  {incorrect.length ? `Review ${incorrect.length} missed question${incorrect.length === 1 ? "" : "s"}` : "Every question correct"}
                </h2>
              </div>
              <ul className="space-y-3">
                {incorrect.map(({ item, q }, i) => (
                  <QuestionReview key={q.id} question={q} number={result.items.indexOf(item) + 1} response={item.response} correct={item.correct} flagged={item.flagged} defaultOpen={i === 0} />
                ))}
              </ul>
              {questions.length > incorrect.length && (
                <details className="group rounded-2xl border bg-card/50 p-4">
                  <summary className="cursor-pointer text-sm font-medium">Show {questions.length - incorrect.length} correct answer{questions.length - incorrect.length === 1 ? "" : "s"} with explanations</summary>
                  <ul className="mt-3 space-y-3">
                    {questions
                      .filter((x) => x.item.correct)
                      .map(({ item, q }) => (
                        <QuestionReview key={q.id} question={q} number={result.items.indexOf(item) + 1} response={item.response} correct flagged={item.flagged} />
                      ))}
                  </ul>
                </details>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Recommended next</CardTitle>
                <CardDescription>{recommendation.reason}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={() => start(recommendation.config)} disabled={starting}>
                  {starting ? <Loader2 className="animate-spin" /> : <ArrowRight />} {recommendation.title}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By topic</CardTitle>
                <CardDescription>Weakest first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topics.map((t) => (
                  <BreakdownRow key={t.label} {...t} />
                ))}
              </CardContent>
            </Card>
            {result.xp.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>XP breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {result.xp.map((x) => (
                      <li key={x.reason} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{x.label}</span>
                        <span className="font-medium">+{x.amount}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function SummaryTile({ icon: Icon, label, value, sub, tone }: { icon: typeof Target; label: string; value: string; sub: string; tone: "primary" | "success" | "violet" | "muted" }) {
  const tones = { primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success", violet: "bg-violet-soft text-violet", muted: "bg-muted text-muted-foreground" };
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function BreakdownRow({ label, correct, total }: { label: string; correct: number; total: number }) {
  const ratio = total ? correct / total : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
          {ratio === 1 ? <Check className="size-3.5 text-success" aria-hidden /> : ratio === 0 ? <X className="size-3.5 text-destructive" aria-hidden /> : null}
          {correct}/{total}
        </span>
      </div>
      <Progress value={ratio} label={`${label}: ${correct} of ${total} correct`} indicatorClassName={ratio >= 0.8 ? "bg-success" : ratio >= 0.5 ? "bg-primary" : "bg-warning"} />
    </div>
  );
}
