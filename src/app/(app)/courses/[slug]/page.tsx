"use client";

import { ChevronRight, ClipboardList, Clock, Crosshair, ExternalLink, Info, Loader2, Play, RotateCcw, SearchX, Timer, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { TrackIcon } from "@/components/study/track-icon";
import { useStartSession } from "@/components/study/use-start-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/states";
import { outlineForTrack, poolForTrack } from "@/lib/content/bank";
import { getTrack } from "@/lib/content/catalog";
import { getDirectoryCourse } from "@/lib/content/course-directory";
import { BREAK_MINUTES, testQuestionCount, testsForTrack, type PracticeTest } from "@/lib/content/tests";
import type { PracticeSession } from "@/lib/engine/types";
import { relativeTime } from "@/lib/utils";

export default function CourseHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const course = getDirectoryCourse(slug);
  const { activity, repo } = useApp();
  const { start, starting } = useStartSession();
  const [inProgress, setInProgress] = React.useState<PracticeSession[]>([]);

  React.useEffect(() => {
    repo.listInProgress().then(setInProgress).catch(() => setInProgress([]));
  }, [repo]);

  if (!course) {
    return (
      <EmptyState
        icon={SearchX}
        title="Course not found"
        description="Search the course list to find what you're studying."
        action={
          <Button asChild>
            <Link href="/courses">Find a course</Link>
          </Button>
        }
      />
    );
  }

  const track = course.track ? getTrack(course.track) : undefined;
  const tests = course.track ? testsForTrack(course.track) : [];
  const outline = course.track ? outlineForTrack(course.track) : [];
  const questionCount = course.track ? poolForTrack(course.track).length : 0;

  const startTest = (t: PracticeTest) =>
    start({ mode: "test", track: t.track, testId: t.id, difficulty: "mixed", count: testQuestionCount(t), timeLimitSec: null, feedback: "end", hints: false });

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/courses" className="hover:text-foreground">Courses</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{course.name}</span>
      </nav>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            <TrackIcon slug={course.track ?? course.slug} className="size-4" /> {course.program === course.subject ? course.program : `${course.program} · ${course.subject}`}
          </span>
        }
        title={course.name}
        description={track?.description ?? (course.format === "portfolio" ? "This course is assessed mainly through a portfolio or performance tasks rather than a timed multiple-choice exam." : undefined)}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section aria-labelledby="tests-heading" className="space-y-3">
            <h2 id="tests-heading" className="flex items-center gap-2 text-lg font-semibold">
              <ClipboardList className="size-5 text-primary" aria-hidden /> Practice tests
            </h2>
            {tests.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No StudyDuel practice tests for this course yet"
                description="Use College Board's official materials linked on this page. We only publish original questions, and we'd rather show nothing than pad a course with filler."
              />
            ) : (
              <ul className="space-y-3">
                {tests.map((t) => {
                  const resume = inProgress.find((s) => s.config.testId === t.id && (!s.deadline || new Date(s.deadline).getTime() > Date.now()));
                  const past = (activity?.results ?? []).filter((r) => r.config.testId === t.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
                  const best = past.reduce<number | null>((m, r) => Math.max(m ?? 0, r.correctCount), null);
                  const minutes = t.modules.reduce((s, m) => s + m.minutes, 0);
                  return (
                    <li key={t.id}>
                      <Card>
                        <CardHeader>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <CardTitle className="text-lg">{t.title}</CardTitle>
                            {past.length > 0 && (
                              <Badge variant="success">
                                Best {best}/{testQuestionCount(t)} · taken {past.length}×
                              </Badge>
                            )}
                          </div>
                          <CardDescription>{t.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ol className="grid gap-2 sm:grid-cols-2">
                            {t.modules.map((m, i) => (
                              <li key={m.id} className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
                                <p className="font-medium">{m.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {m.questionIds.length} questions · {m.minutes} min{t.breakAfter.includes(i) ? ` · then a ${BREAK_MINUTES}-min break` : ""}
                                </p>
                              </li>
                            ))}
                          </ol>
                          <div className="flex flex-wrap items-center gap-3">
                            {resume ? (
                              <Button asChild>
                                <Link href={`/practice/${resume.id}`}>
                                  <RotateCcw /> Resume test (started {relativeTime(resume.startedAt)})
                                </Link>
                              </Button>
                            ) : (
                              <Button onClick={() => startTest(t)} disabled={starting}>
                                {starting ? <Loader2 className="animate-spin" /> : <Play />} {past.length ? "Retake test" : "Start test"}
                              </Button>
                            )}
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Clock className="size-4" aria-hidden /> {minutes} min · {testQuestionCount(t)} questions
                            </span>
                          </div>
                          {past[0] && (
                            <p className="text-sm">
                              <Link href={`/results/${past[0].sessionId}`} className="text-primary underline-offset-4 hover:underline">
                                Last score report ({past[0].correctCount}/{past[0].total}, {relativeTime(past[0].completedAt)})
                              </Link>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
            {tests.length > 0 && (
              <Notice tone="info" icon={Info}>
                Tests use the digital testing format: each module has its own timer, you can move freely within a module, and you can&apos;t return to a module once it ends.
                Questions are original StudyDuel questions, and results are raw scores, not scaled or predicted scores. Retaking a test repeats the same questions, so XP for them is only paid once a week.
              </Notice>
            )}
          </section>

          {track && (
            <section aria-labelledby="skills-heading" className="space-y-3">
              <h2 id="skills-heading" className="text-lg font-semibold">
                Skill practice
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <ModeLink href={`/study/${track.slug}?mode=quick`} icon={Zap} title="Quick Practice" body="5–20 mixed questions" />
                <ModeLink href={`/study/${track.slug}?mode=focus`} icon={Crosshair} title="Focus Mode" body="One skill with hints" />
                <ModeLink href={`/study/${track.slug}?mode=timed`} icon={Timer} title="Timed Challenge" body="Beat your best score" />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">What&apos;s covered</CardTitle>
                  <CardDescription>
                    {questionCount} original questions · {track.coverage === "core" ? "core set" : "starter set"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {outline.map((s) => (
                      <li key={s.section}>
                        <span className="font-medium">{s.section}</span>
                        <span className="text-muted-foreground"> · {s.topics.map((t) => t.topic).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">{track.formatNote}</p>
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="size-4" aria-hidden /> Official College Board resources
              </CardTitle>
              <CardDescription>
                Released practice tests and past exam questions are College Board&apos;s, so we link to them instead of copying them. Links open collegeboard.org (or Khan Academy) in a new tab.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {course.officialLinks.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="group block rounded-xl border p-3 transition-colors hover:border-primary/40">
                      <span className="flex items-center justify-between gap-2 text-sm font-medium group-hover:text-primary">
                        {l.label} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">(opens in a new tab)</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{l.description}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">StudyDuel is not affiliated with or endorsed by College Board.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function ModeLink({ href, icon: Icon, title, body }: { href: string; icon: typeof Zap; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40">
      <Icon className="mb-2 size-5 text-primary" aria-hidden />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
