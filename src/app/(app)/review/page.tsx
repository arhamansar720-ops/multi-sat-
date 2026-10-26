"use client";

import { Bookmark, CalendarClock, Flag, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { QuestionReview } from "@/components/exam/question-review";
import { useStartSession } from "@/components/study/use-start-session";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getQuestion } from "@/lib/content/bank";
import type { AnswerResponse } from "@/lib/content/types";
import type { UserActivity } from "@/lib/engine/types";

const MAX_REVIEW = 20;
const DAY = 86_400_000;

interface ReviewEntry {
  questionId: string;
  lastResponse: AnswerResponse | null;
  lastCorrect: boolean;
  lastAt: string;
  correctCount: number;
  flagged: boolean;
}

/** Latest attempt per question across all sessions. */
function buildReviewIndex(activity: UserActivity): Map<string, ReviewEntry> {
  const map = new Map<string, ReviewEntry>();
  const results = [...activity.results].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  for (const r of results) {
    for (const item of r.items) {
      const prev = map.get(item.questionId);
      map.set(item.questionId, {
        questionId: item.questionId,
        lastResponse: item.response,
        lastCorrect: item.correct,
        lastAt: r.completedAt,
        correctCount: (prev?.correctCount ?? 0) + (item.correct ? 1 : 0),
        flagged: item.flagged,
      });
    }
  }
  return map;
}

export default function ReviewPage() {
  const { activity, activityLoading, activityError, refreshActivity } = useApp();
  const { start, starting } = useStartSession();

  if (activityError) return <ErrorState message={activityError} onRetry={refreshActivity} />;
  if (!activity || (activityLoading && !activity)) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const index = buildReviewIndex(activity);
  const entries = [...index.values()];
  const now = Date.now();
  const lists = {
    incorrect: entries.filter((e) => !e.lastCorrect).sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    marked: entries.filter((e) => e.flagged).sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    saved: activity.saved.map(
      (id) => index.get(id) ?? { questionId: id, lastResponse: null, lastCorrect: false, lastAt: "", correctCount: 0, flagged: false },
    ),
    due: entries
      .filter((e) => {
        const age = now - new Date(e.lastAt).getTime();
        return (!e.lastCorrect && age >= DAY) || (e.lastCorrect && e.correctCount === 1 && age >= 7 * DAY);
      })
      .sort((a, b) => a.lastAt.localeCompare(b.lastAt)),
  };

  const startReview = (list: ReviewEntry[]) => {
    const ids = list.map((e) => e.questionId).filter((id) => getQuestion(id)).slice(0, MAX_REVIEW);
    if (!ids.length) return;
    void start({ mode: "review", track: "sat", difficulty: "mixed", count: ids.length, timeLimitSec: null, feedback: "immediate", hints: true, questionIds: ids });
  };

  const tabs = [
    { key: "incorrect", label: "Incorrect", icon: XCircle, empty: "Questions you miss show up here so you can retry them." },
    { key: "marked", label: "Marked", icon: Flag, empty: "Questions you mark for review during a session appear here." },
    { key: "saved", label: "Saved", icon: Bookmark, empty: "Save any question from a results page with the bookmark button." },
    { key: "due", label: "Due", icon: CalendarClock, empty: "Missed questions become due a day later; questions you got right once come back after a week." },
  ] as const;

  return (
    <>
      <PageHeader title="Review" description="Retry questions from your history. Review sessions give instant feedback and hints." />
      {entries.length === 0 && activity.saved.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="Nothing to review yet"
          description="Finish a practice session and the questions you miss or mark will be collected here."
          action={
            <Button asChild>
              <Link href="/study">Start practicing</Link>
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="incorrect">
          <TabsList className="h-auto flex-wrap">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                <t.icon /> {t.label} <span className="rounded-full bg-muted px-1.5 text-xs">{lists[t.key].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="space-y-4">
              {lists[t.key].length === 0 ? (
                <EmptyState icon={t.icon} title={`No ${t.label.toLowerCase()} questions`} description={t.empty} />
              ) : (
                <>
                  <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center">
                    <p className="flex-1 text-sm text-muted-foreground">
                      {lists[t.key].length} question{lists[t.key].length === 1 ? "" : "s"}. {t.key === "due" ? t.empty : ""}
                      {lists[t.key].length > MAX_REVIEW ? ` A session includes the first ${MAX_REVIEW}.` : ""}
                    </p>
                    <Button onClick={() => startReview(lists[t.key])} disabled={starting}>
                      {starting ? <Loader2 className="animate-spin" /> : <Play />} Start review session
                    </Button>
                  </div>
                  <ul className="space-y-3">
                    {lists[t.key].map((e, i) => {
                      const q = getQuestion(e.questionId);
                      if (!q) return null;
                      return <QuestionReview key={q.id} question={q} number={i + 1} response={e.lastResponse} correct={e.lastCorrect} flagged={e.flagged} />;
                    })}
                  </ul>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
}
