"use client";

import { CalendarCheck, ClipboardList, Crosshair, Loader2, RotateCcw, Search, Timer, Zap } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { TrackIcon } from "@/components/study/track-icon";
import { useStartSession } from "@/components/study/use-start-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trackCounts } from "@/lib/content/bank";
import { TRACKS } from "@/lib/content/catalog";
import { directoryCourseForTrack } from "@/lib/content/course-directory";
import { PRACTICE_TESTS, testQuestionCount } from "@/lib/content/tests";
import { Input } from "@/components/ui/input";
import { DAILY_CHALLENGE_SIZE, dailyKeyFor } from "@/lib/engine/selection";

const MODES = [
  { mode: "quick", icon: Zap, title: "Quick Practice", body: "5, 10, or 20 questions from any exam or topic, with optional timer and instant feedback." },
  { mode: "focus", icon: Crosshair, title: "Focus Mode", body: "Drill one skill with hints and detailed explanations after every question." },
  { mode: "timed", icon: Timer, title: "Timed Challenge", body: "A fixed set against the clock. Correctness first, with a small bonus for time left." },
  { mode: "simulation", icon: ClipboardList, title: "Exam Simulation", body: "Section-by-section practice with a configurable time limit. Independent practice, not an official test." },
] as const;

export default function StudyPage() {
  const { activity } = useApp();
  const { start, starting } = useStartSession();
  const counts = trackCounts();
  const todayKey = dailyKeyFor(new Date());
  const dailyDone = activity?.results.some((r) => r.dailyKey === todayKey);
  const preferred = activity?.preferences.tracks ?? [];
  const tracks = [...TRACKS].sort((a, b) => Number(preferred.includes(b.slug)) - Number(preferred.includes(a.slug)));

  return (
    <>
      <PageHeader title="Study" description="Take a full practice test, or choose a study mode and an exam. Every question is original and includes an explanation." />

      <form action="/courses" className="relative mb-6" role="search">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" placeholder="Find your course: SAT, PSAT, APUSH, AP Calc, AP Bio…" aria-label="Search courses" className="h-12 rounded-2xl pl-12 text-base" />
      </form>

      <section aria-labelledby="tests-heading" className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 id="tests-heading" className="text-lg font-semibold">Practice tests</h2>
          <Link href="/courses" className="text-sm font-medium text-primary hover:underline">All courses →</Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRACTICE_TESTS.map((t) => (
            <li key={t.id}>
              <Link href={`/courses/${directoryCourseForTrack(t.track)?.slug ?? ""}`} className="flex h-full flex-col rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40">
                <ClipboardList className="mb-2 size-5 text-primary" aria-hidden />
                <span className="font-semibold leading-snug">{t.title}</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {t.modules.length} module{t.modules.length === 1 ? "" : "s"} · {testQuestionCount(t)} questions · {t.modules.reduce((m, x) => m + x.minutes, 0)} min
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="daily-heading" className="mb-8 flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-primary-soft to-violet-soft p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-card">
          <CalendarCheck className="size-5" aria-hidden />
        </span>
        <div className="flex-1">
          <h2 id="daily-heading" className="font-semibold">Daily Challenge</h2>
          <p className="text-sm text-muted-foreground">
            The same {DAILY_CHALLENGE_SIZE} mixed SAT and AP questions for everyone today (resets at 00:00 UTC). Completing it earns a once-a-day bonus.
          </p>
        </div>
        <Button
          onClick={() => start({ mode: "daily", track: "sat", difficulty: "mixed", count: DAILY_CHALLENGE_SIZE, timeLimitSec: null, feedback: "end", hints: false })}
          disabled={starting}
          variant={dailyDone ? "outline" : "default"}
        >
          {starting && <Loader2 className="animate-spin" />}
          {dailyDone ? "Play again (no bonus)" : "Start today's challenge"}
        </Button>
      </section>

      <section aria-labelledby="modes-heading" className="mb-10">
        <h2 id="modes-heading" className="mb-3 text-lg font-semibold">Study modes</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MODES.map((m) => (
            <li key={m.mode} className="flex flex-col rounded-2xl border bg-card p-4 shadow-card">
              <m.icon className="mb-3 size-5 text-primary" aria-hidden />
              <p className="font-semibold">{m.title}</p>
              <p className="mb-3 mt-1 flex-1 text-sm text-muted-foreground">{m.body}</p>
              <p className="text-xs text-muted-foreground">Pick an exam below ↓</p>
            </li>
          ))}
          <li className="flex flex-col rounded-2xl border bg-card p-4 shadow-card">
            <RotateCcw className="mb-3 size-5 text-violet" aria-hidden />
            <p className="font-semibold">Review</p>
            <p className="mb-3 mt-1 flex-1 text-sm text-muted-foreground">Retry incorrect, flagged, and saved questions.</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/review">Open review</Link>
            </Button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="exams-heading">
        <h2 id="exams-heading" className="mb-3 text-lg font-semibold">Exams and courses</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <li key={t.slug} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <TrackIcon slug={t.slug} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold leading-snug">{t.name}</p>
                    {preferred.includes(t.slug) && <Badge variant="violet">Your exam</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {counts[t.slug]?.total} questions · {t.coverage === "core" ? "Core set" : "Starter set"}
                  </p>
                </div>
              </div>
              <p className="flex-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/courses/${directoryCourseForTrack(t.slug)?.slug ?? t.slug}`}>Practice test</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/study/${t.slug}?mode=quick`}>Practice</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/study/${t.slug}?mode=focus`}>Focus</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/study/${t.slug}?mode=timed`}>Timed</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/study/${t.slug}?mode=simulation`}>Simulate</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
