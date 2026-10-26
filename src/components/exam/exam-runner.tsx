"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronLeft, Clock, Eye, EyeOff, Flag, Grid3x3, Keyboard, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { getQuestion, toPublicQuestion } from "@/lib/content/bank";
import { getTrack } from "@/lib/content/catalog";
import { isResponseCorrect } from "@/lib/content/grading";
import type { AnswerResponse, Question } from "@/lib/content/types";
import { AppError, emptyDraft, type LoadedSession } from "@/lib/data/repository";
import { MODE_LABELS, type SessionDraft } from "@/lib/engine/types";
import { cn, formatClock } from "@/lib/utils";
import { RichText } from "./rich-text";
import { QuestionView } from "./question-view";

const LOW_TIME_MS = 60_000;

export function ExamRunner({ loaded }: { loaded: LoadedSession }) {
  const { session, clockOffsetMs } = loaded;
  const { repo, refreshActivity } = useApp();
  const router = useRouter();
  const questions = React.useMemo(() => session.questionIds.map((id) => getQuestion(id)).filter((q): q is Question => Boolean(q)), [session.questionIds]);
  const [draft, setDraft] = React.useState<SessionDraft>(() => {
    const d = loaded.draft ?? emptyDraft();
    return { ...emptyDraft(), ...d, currentIndex: Math.min(d.currentIndex ?? 0, Math.max(0, questions.length - 1)) };
  });
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [timerHidden, setTimerHidden] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now() + clockOffsetMs);
  const submittedRef = React.useRef(false);
  const lowWarned = React.useRef(false);

  const index = draft.currentIndex;
  const question = questions[index]!;
  const immediate = session.config.feedback === "immediate";
  const isChecked = draft.checked.includes(question.id);
  const deadline = session.deadline ? new Date(session.deadline).getTime() : null;
  const remaining = deadline ? Math.max(0, deadline - now) : null;
  const answeredCount = questions.filter((q) => (draft.answers[q.id]?.length ?? 0) > 0).length;
  const track = getTrack(session.config.track);

  // Clock tick + per-question time tracking (only while the tab is visible).
  const draftRef = React.useRef(draft);
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  React.useEffect(() => {
    let last = Date.now();
    const t = window.setInterval(() => {
      const current = Date.now();
      const delta = current - last;
      last = current;
      setNow(current + clockOffsetMs);
      if (document.visibilityState === "visible" && !submittedRef.current) {
        setDraft((d) => {
          const qid = questions[d.currentIndex]?.id;
          if (!qid || d.checked.includes(qid)) return d;
          return { ...d, timeSpentMs: { ...d.timeSpentMs, [qid]: (d.timeSpentMs[qid] ?? 0) + Math.min(delta, 5000) } };
        });
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [clockOffsetMs, questions]);

  // Persist the draft (localStorage immediately in local mode; debounced server save in connected mode).
  const saveTimer = React.useRef<number | null>(null);
  const lastSavedAnswers = React.useRef<string>("");
  React.useEffect(() => {
    if (submittedRef.current) return;
    const snapshot = JSON.stringify({ a: draft.answers, f: draft.flagged, c: draft.checked, i: draft.currentIndex, e: draft.eliminated });
    const significant = snapshot !== lastSavedAnswers.current;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () => {
        lastSavedAnswers.current = snapshot;
        repo.saveDraft(session.id, { ...draftRef.current, updatedAt: new Date().toISOString() }).catch(() => {
          /* Draft also lives locally; the next save retries. */
        });
      },
      repo.kind === "local" ? 300 : significant ? 1200 : 15000,
    );
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, repo, session.id]);

  const submit = React.useCallback(
    async (reason: "manual" | "timeout") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await repo.submitSession(session.id, { ...draftRef.current, updatedAt: new Date().toISOString() });
        if (reason === "timeout") toast.info("Time's up. Your session was submitted automatically.");
        void refreshActivity();
        router.replace(`/results/${session.id}`);
      } catch (err) {
        submittedRef.current = false;
        setSubmitting(false);
        setSubmitError(err instanceof AppError ? err.message : "We couldn't submit your session. Your answers are saved on this device; try again.");
      }
    },
    [repo, session.id, refreshActivity, router],
  );

  // Low-time warning and automatic submission at the deadline.
  React.useEffect(() => {
    if (remaining === null) return;
    if (remaining <= LOW_TIME_MS && remaining > 0 && !lowWarned.current) {
      lowWarned.current = true;
      setTimerHidden(false);
      toast.warning("One minute left.");
    }
    if (remaining <= 0 && !submittedRef.current) void submit("timeout");
  }, [remaining, submit]);

  const setAnswer = (response: AnswerResponse) => {
    if (isChecked) return;
    setDraft((d) => ({ ...d, answers: { ...d.answers, [question.id]: response } }));
  };
  const go = React.useCallback(
    (i: number) => {
      setDraft((d) => ({ ...d, currentIndex: Math.max(0, Math.min(questions.length - 1, i)) }));
      setReviewOpen(false);
      setNavOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [questions.length],
  );
  const toggleFlag = React.useCallback(() => {
    setDraft((d) => ({ ...d, flagged: d.flagged.includes(question.id) ? d.flagged.filter((f) => f !== question.id) : [...d.flagged, question.id] }));
  }, [question.id]);
  const toggleEliminate = (choiceId: string) => {
    setDraft((d) => {
      const list = d.eliminated[question.id] ?? [];
      const next = list.includes(choiceId) ? list.filter((c) => c !== choiceId) : [...list, choiceId];
      return { ...d, eliminated: { ...d.eliminated, [question.id]: next } };
    });
  };
  const check = () => setDraft((d) => ({ ...d, checked: [...new Set([...d.checked, question.id])] }));

  // Keyboard shortcuts (ignored while typing in an input).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (reviewOpen || confirmOpen || navOpen) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key.toLowerCase() === "m") toggleFlag();
      else if (e.key === "?") setShortcutsOpen(true);
      else if (question.type !== "numeric" && /^[a-f]$/i.test(e.key)) {
        const id = e.key.toUpperCase();
        if (!question.choices?.some((c) => c.id === id) || draft.checked.includes(question.id)) return;
        setDraft((d) => {
          const cur = d.answers[question.id] ?? [];
          const next = question.type === "multi" ? (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id].sort()) : [id];
          return { ...d, answers: { ...d.answers, [question.id]: next } };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, question, toggleFlag, reviewOpen, confirmOpen, navOpen, draft.checked]);

  const response = draft.answers[question.id];
  const flagged = draft.flagged.includes(question.id);
  const revealNow = immediate && isChecked;
  const correctNow = revealNow && isResponseCorrect(question, response);
  const lowTime = remaining !== null && remaining <= LOW_TIME_MS;
  const unanswered = questions.length - answeredCount;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Exit to study menu (your progress is saved)">
            <Link href="/study">
              <ChevronLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{session.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {track?.shortName ?? session.config.track} · {question.section} · {question.skill}
            </p>
          </div>
          {remaining !== null && (
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm tabular-nums",
                  lowTime ? "bg-destructive-soft text-destructive" : "bg-muted",
                )}
                role="timer"
                aria-live={lowTime ? "assertive" : "off"}
                aria-label={timerHidden ? "Timer hidden" : `Time remaining ${formatClock(remaining)}`}
              >
                <Clock className="size-4" aria-hidden />
                {timerHidden ? <span className="text-xs">Hidden</span> : formatClock(remaining)}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setTimerHidden((h) => !h)} aria-label={timerHidden ? "Show timer" : "Hide timer"}>
                {timerHidden ? <Eye /> : <EyeOff />}
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon-sm" className="hidden sm:inline-flex" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
            <Keyboard />
          </Button>
        </div>
        <Progress value={answeredCount / questions.length} label={`${answeredCount} of ${questions.length} answered`} className="h-1 rounded-none" />
      </header>

      {/* Question */}
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-36 pt-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="flex h-7 items-center rounded-md bg-foreground px-2.5 text-sm font-semibold text-background">{index + 1}</span>
          <span className="text-sm text-muted-foreground">of {questions.length}</span>
          <Button variant={flagged ? "secondary" : "ghost"} size="sm" onClick={toggleFlag} aria-pressed={flagged} className={cn(flagged && "text-warning")}>
            <Flag className={cn(flagged && "fill-warning")} /> {flagged ? "Marked for review" : "Mark for review"}
          </Button>
          <Badge variant="outline" className="ml-auto capitalize">
            {question.difficulty}
          </Badge>
          <Badge variant="outline">{MODE_LABELS[session.config.mode]}</Badge>
        </div>

        <QuestionView
          question={toPublicQuestion(question)}
          response={response}
          onChange={setAnswer}
          eliminated={draft.eliminated[question.id]}
          onToggleEliminate={isChecked ? undefined : toggleEliminate}
          disabled={isChecked || submitting}
          reveal={revealNow ? { correct: question.correct } : null}
          hint={session.config.hints ? question.hint : null}
        />

        {revealNow && (
          <section aria-live="polite" className={cn("mt-6 rounded-2xl border p-5", correctNow ? "border-success/40 bg-success-soft" : "border-destructive/30 bg-destructive-soft")}>
            <p className="mb-2 flex items-center gap-2 font-semibold">
              {correctNow ? <Check className="size-5 text-success" aria-hidden /> : <X className="size-5 text-destructive" aria-hidden />}
              {correctNow ? "Correct" : response?.length ? "Not quite" : "No answer given"}
            </p>
            <RichText text={question.explanation} className="text-sm" />
          </section>
        )}

        {submitError && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" aria-hidden />
            <div className="flex-1">{submitError}</div>
            <Button size="sm" variant="outline" onClick={() => submit("manual")}>
              Retry
            </Button>
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
          <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous question">
            <ArrowLeft /> <span className="hidden sm:inline">Back</span>
          </Button>
          <Button variant="secondary" onClick={() => setNavOpen(true)} className="mx-auto" aria-haspopup="dialog">
            <Grid3x3 /> Question {index + 1} of {questions.length}
          </Button>
          {immediate && !isChecked && (
            <Button variant="outline" onClick={check} disabled={!response?.length}>
              Check
            </Button>
          )}
          {index < questions.length - 1 ? (
            <Button onClick={() => go(index + 1)} aria-label="Next question">
              <span className="hidden sm:inline">Next</span> <ArrowRight />
            </Button>
          ) : (
            <Button onClick={() => setReviewOpen(true)} variant="success" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Check />} Review & submit
            </Button>
          )}
        </div>
      </footer>

      {/* Navigator */}
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Question navigator</DialogTitle>
            <DialogDescription>Jump to any question. Your answers are saved as you go.</DialogDescription>
          </DialogHeader>
          <Navigator questions={questions} draft={draft} current={index} onJump={go} />
          <div className="flex justify-end">
            <Button variant="success" onClick={() => { setNavOpen(false); setReviewOpen(true); }}>
              Review & submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review screen */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Check your work</DialogTitle>
            <DialogDescription>
              {answeredCount} of {questions.length} answered{unanswered ? `, ${unanswered} unanswered` : ""}
              {draft.flagged.length ? `, ${draft.flagged.length} marked for review` : ""}. Select a question to return to it.
            </DialogDescription>
          </DialogHeader>
          <Navigator questions={questions} draft={draft} current={index} onJump={go} />
          {remaining !== null && <p className="text-sm text-muted-foreground">Time remaining: {formatClock(remaining)}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Keep working
            </Button>
            <Button variant="success" onClick={() => setConfirmOpen(true)} disabled={submitting}>
              Submit session
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this session?"
        description={
          unanswered > 0
            ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Unanswered questions count as incorrect. You can't change answers after submitting.`
            : "You can't change your answers after submitting."
        }
        confirmLabel="Submit"
        onConfirm={() => {
          setReviewOpen(false);
          void submit("manual");
        }}
      />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {[
              ["A – F", "Select an answer choice"],
              ["← / →", "Previous / next question"],
              ["M", "Mark or unmark for review"],
              ["Tab", "Move between controls"],
              ["?", "Show this list"],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>
                  <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                </dt>
                <dd className="text-muted-foreground">{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Navigator({ questions, draft, current, onJump }: { questions: Question[]; draft: SessionDraft; current: number; onJump: (i: number) => void }) {
  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {questions.map((q, i) => {
          const answered = (draft.answers[q.id]?.length ?? 0) > 0;
          const flagged = draft.flagged.includes(q.id);
          const label = `Question ${i + 1}: ${answered ? "answered" : "unanswered"}${flagged ? ", marked for review" : ""}${i === current ? ", current" : ""}`;
          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-label={label}
                aria-current={i === current ? "step" : undefined}
                className={cn(
                  "relative flex h-10 w-full items-center justify-center rounded-lg border-2 text-sm font-semibold transition-colors",
                  answered ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-input bg-card hover:border-primary/50",
                  i === current && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
              >
                {i + 1}
                {flagged && <Flag className="absolute -right-1.5 -top-1.5 size-4 fill-warning text-warning" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-primary" /> Answered</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded border-2 border-dashed border-input" /> Unanswered</span>
        <span className="flex items-center gap-1.5"><Flag className="size-3 fill-warning text-warning" /> Marked</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded ring-2 ring-foreground" /> Current</span>
      </div>
    </div>
  );
}
