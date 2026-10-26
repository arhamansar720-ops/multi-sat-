"use client";

import { ArrowLeft, ArrowRight, Bookmark, ChevronDown, ChevronUp, Coffee, Eye, EyeOff, Flag, Keyboard, Loader2, LogOut, MoreVertical, Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { getQuestion, toPublicQuestion } from "@/lib/content/bank";
import { directoryCourseForTrack } from "@/lib/content/course-directory";
import type { AnswerResponse, Question } from "@/lib/content/types";
import { BREAK_MINUTES, getPracticeTest, moduleOffset, type PracticeTest } from "@/lib/content/tests";
import { AppError, emptyDraft, type LoadedSession } from "@/lib/data/repository";
import type { SessionDraft } from "@/lib/engine/types";
import { cn, formatClock } from "@/lib/utils";
import { QuestionView } from "./question-view";
import { RichText } from "./rich-text";
import { useDraftAutosave } from "./use-draft-autosave";

const LOW_TIME_MS = 5 * 60_000;

const DIRECTIONS: Record<string, string> = {
  "Reading and Writing":
    "The questions in this section address a range of reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, then choose the best answer based on the passage. All questions in this section are multiple choice with four answer choices, and each has a single best answer.",
  Math:
    "The questions in this section address a range of math skills. Use of a calculator is permitted for all questions. A reference sheet is available from the Reference button.\n\nUnless otherwise indicated, all variables and expressions represent real numbers, figures are drawn to scale, and all figures lie in a plane.\n\nFor multiple-choice questions, choose the single best answer. For student-produced response questions, enter your answer in the box. You can enter integers, decimals, or fractions; equivalent forms are accepted. If you find more than one correct answer, enter only one. Negative answers are allowed: start with a minus sign.",
  "Multiple Choice":
    "Each question or incomplete statement is followed by answer choices. Select the one best answer unless the question tells you to select two answers. Some questions are based on a passage, table, or figure. You can move between questions in this section until time runs out.",
};

const REFERENCE = `**Area and circumference**

- Circle: $A = \\pi r^2$, $C = 2\\pi r$
- Rectangle: $A = \\ell w$
- Triangle: $A = \\frac{1}{2}bh$

**Right triangles**

- Pythagorean theorem: $c^2 = a^2 + b^2$
- $30^\\circ$-$60^\\circ$-$90^\\circ$ triangle sides: $x$, $x\\sqrt{3}$, $2x$
- $45^\\circ$-$45^\\circ$-$90^\\circ$ triangle sides: $s$, $s$, $s\\sqrt{2}$

**Volume**

- Rectangular prism: $V = \\ell wh$
- Cylinder: $V = \\pi r^2 h$
- Sphere: $V = \\frac{4}{3}\\pi r^3$
- Cone: $V = \\frac{1}{3}\\pi r^2 h$
- Rectangular pyramid: $V = \\frac{1}{3}\\ell wh$

**Facts**

- A circle has $360^\\circ$ of arc, or $2\\pi$ radians.
- The angles of a triangle add up to $180^\\circ$.`;

type View = "questions" | "review" | "break";

export function TestRunner({ loaded }: { loaded: LoadedSession }) {
  const test = getPracticeTest(loaded.session.config.testId);
  if (!test) {
    return <p className="p-8 text-center text-muted-foreground">This practice test is no longer available.</p>;
  }
  return <TestRunnerInner loaded={loaded} test={test} />;
}

function TestRunnerInner({ loaded, test }: { loaded: LoadedSession; test: PracticeTest }) {
  const { session, clockOffsetMs } = loaded;
  const { repo, refreshActivity, activity } = useApp();
  const router = useRouter();
  const nowFn = React.useCallback(() => Date.now() + clockOffsetMs, [clockOffsetMs]);

  const [draft, setDraft] = React.useState<SessionDraft>(() => {
    const d = { ...emptyDraft(), ...(loaded.draft ?? {}) };
    const mi = Math.min(d.moduleIndex ?? 0, test.modules.length - 1);
    const startedAt = { ...(d.moduleStartedAt ?? {}) };
    if (!startedAt[mi] && !d.breakUntil) startedAt[mi] = new Date(Date.now() + clockOffsetMs).toISOString();
    const first = moduleOffset(test, mi);
    const last = first + test.modules[mi]!.questionIds.length - 1;
    const current = Math.min(Math.max(d.currentIndex ?? first, first), last);
    return { ...d, moduleIndex: mi, moduleStartedAt: startedAt, currentIndex: current };
  });
  const [view, setView] = React.useState<View>(() => (loaded.draft?.breakUntil ? "break" : "questions"));
  const [now, setNow] = React.useState(nowFn);
  const [timerHidden, setTimerHidden] = React.useState(false);
  const [directionsOpen, setDirectionsOpen] = React.useState(() => !loaded.draft?.moduleStartedAt);
  const [referenceOpen, setReferenceOpen] = React.useState(false);
  const [navOpen, setNavOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [confirmNext, setConfirmNext] = React.useState(false);
  const [confirmExit, setConfirmExit] = React.useState(false);
  const [eliminateMode, setEliminateMode] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const submittedRef = React.useRef(false);
  const advancingRef = React.useRef(false);
  const lowWarned = React.useRef<number | null>(null);

  const mi = draft.moduleIndex ?? 0;
  const mod = test.modules[mi]!;
  const offset = moduleOffset(test, mi);
  const moduleQuestions = React.useMemo(() => mod.questionIds.map((id) => getQuestion(id)).filter((q): q is Question => Boolean(q)), [mod]);
  const localIndex = Math.min(Math.max(draft.currentIndex - offset, 0), moduleQuestions.length - 1);
  const question = moduleQuestions[localIndex]!;
  const isLastModule = mi === test.modules.length - 1;
  const startedAtMs = draft.moduleStartedAt?.[mi] ? new Date(draft.moduleStartedAt[mi]!).getTime() : now;
  const remaining = Math.max(0, startedAtMs + mod.minutes * 60_000 - now);
  const breakRemaining = draft.breakUntil ? Math.max(0, new Date(draft.breakUntil).getTime() - now) : 0;
  const sectionNumber = [...new Set(test.modules.slice(0, mi + 1).map((m) => m.section))].length;
  const moduleInSection = test.modules.slice(0, mi + 1).filter((m) => m.section === mod.section).length;
  const multiModuleSection = test.modules.filter((m) => m.section === mod.section).length > 1;
  const heading = test.modules.length === 1 ? mod.title : `Section ${sectionNumber}${multiModuleSection ? `, Module ${moduleInSection}` : ""}: ${mod.section}`;
  const isMath = mod.section === "Math";
  const studentName = activity?.preferences.displayName ?? "Student";

  const draftRef = React.useRef(draft);
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Clock + time-on-question tracking.
  React.useEffect(() => {
    let last = Date.now();
    const t = window.setInterval(() => {
      const delta = Date.now() - last;
      last = Date.now();
      setNow(nowFn());
      if (document.visibilityState !== "visible" || submittedRef.current) return;
      setDraft((d) => {
        if (d.breakUntil) return d;
        const qid = test.modules[d.moduleIndex ?? 0]?.questionIds[d.currentIndex - moduleOffset(test, d.moduleIndex ?? 0)];
        if (!qid) return d;
        return { ...d, timeSpentMs: { ...d.timeSpentMs, [qid]: (d.timeSpentMs[qid] ?? 0) + Math.min(delta, 5000) } };
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [nowFn, test]);

  useDraftAutosave(repo, session.id, draft, submitting);

  const submitTest = React.useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await repo.submitSession(session.id, { ...draftRef.current, updatedAt: new Date().toISOString() });
      void refreshActivity();
      router.replace(`/results/${session.id}`);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(err instanceof AppError ? err.message : "We couldn't submit your test. Your answers are saved; try again.");
    }
  }, [repo, session.id, refreshActivity, router]);

  /** Ends the current module: on to a break, the next module, or submission. No going back. */
  const finishModule = React.useCallback(
    (reason: "manual" | "timeout") => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      const current = draftRef.current.moduleIndex ?? 0;
      if (current >= test.modules.length - 1) {
        if (reason === "timeout") toast.info("Time's up. Your test was submitted.");
        void submitTest();
        return;
      }
      const next = current + 1;
      const startedNow = new Date(nowFn()).toISOString();
      if (test.breakAfter.includes(current)) {
        setDraft((d) => ({ ...d, moduleIndex: next, currentIndex: moduleOffset(test, next), breakUntil: new Date(nowFn() + BREAK_MINUTES * 60_000).toISOString() }));
        setView("break");
      } else {
        setDraft((d) => ({ ...d, moduleIndex: next, currentIndex: moduleOffset(test, next), moduleStartedAt: { ...d.moduleStartedAt, [next]: startedNow } }));
        setView("questions");
        setDirectionsOpen(true);
      }
      if (reason === "timeout") toast.info("Time's up for that module. Moving on.");
      window.setTimeout(() => (advancingRef.current = false), 500);
    },
    [test, nowFn, submitTest],
  );

  const endBreak = React.useCallback(() => {
    setDraft((d) => ({ ...d, breakUntil: null, moduleStartedAt: { ...d.moduleStartedAt, [d.moduleIndex ?? 0]: new Date(nowFn()).toISOString() } }));
    setView("questions");
    setDirectionsOpen(true);
  }, [nowFn]);

  // Module timer expiry, low-time warning, and automatic end of break.
  React.useEffect(() => {
    if (submittedRef.current) return;
    if (view === "break") {
      if (breakRemaining <= 0) endBreak();
      return;
    }
    if (remaining <= LOW_TIME_MS && remaining > 0 && lowWarned.current !== mi && mod.minutes > 6) {
      lowWarned.current = mi;
      setTimerHidden(false);
      toast.warning("5 minutes left in this module.");
    }
    if (remaining <= 0) finishModule("timeout");
  }, [remaining, breakRemaining, view, mi, mod.minutes, finishModule, endBreak]);

  const go = React.useCallback(
    (local: number) => {
      const clamped = Math.max(0, Math.min(moduleQuestions.length - 1, local));
      setDraft((d) => ({ ...d, currentIndex: offset + clamped }));
      setView("questions");
      setNavOpen(false);
    },
    [moduleQuestions.length, offset],
  );
  const toggleFlag = React.useCallback(() => {
    setDraft((d) => ({ ...d, flagged: d.flagged.includes(question.id) ? d.flagged.filter((f) => f !== question.id) : [...d.flagged, question.id] }));
  }, [question.id]);
  const setAnswer = (response: AnswerResponse) => setDraft((d) => ({ ...d, answers: { ...d.answers, [question.id]: response } }));
  const toggleEliminate = (choiceId: string) =>
    setDraft((d) => {
      const list = d.eliminated[question.id] ?? [];
      const next = list.includes(choiceId) ? list.filter((c) => c !== choiceId) : [...list, choiceId];
      // Eliminating the selected choice clears the selection, as in the real interface.
      const answers = next.includes(choiceId) && d.answers[question.id]?.includes(choiceId) ? { ...d.answers, [question.id]: d.answers[question.id]!.filter((c) => c !== choiceId) } : d.answers;
      return { ...d, answers, eliminated: { ...d.eliminated, [question.id]: next } };
    });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey || view !== "questions") return;
      if (navOpen || directionsOpen || referenceOpen || confirmNext || shortcutsOpen) return;
      if (e.key === "ArrowRight") localIndex < moduleQuestions.length - 1 ? go(localIndex + 1) : setView("review");
      else if (e.key === "ArrowLeft") go(localIndex - 1);
      else if (e.key.toLowerCase() === "m") toggleFlag();
      else if (question.type !== "numeric" && /^[a-f]$/i.test(e.key)) {
        const id = e.key.toUpperCase();
        if (!question.choices?.some((c) => c.id === id)) return;
        setDraft((d) => {
          const cur = d.answers[question.id] ?? [];
          const next = question.type === "multi" ? (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id].sort()) : [id];
          return { ...d, answers: { ...d.answers, [question.id]: next } };
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, navOpen, directionsOpen, referenceOpen, confirmNext, shortcutsOpen, localIndex, moduleQuestions.length, go, toggleFlag, question]);

  const answered = (q: Question) => (draft.answers[q.id]?.length ?? 0) > 0;
  const flagged = draft.flagged.includes(question.id);
  const unansweredCount = moduleQuestions.filter((q) => !answered(q)).length;
  const lowTime = remaining <= LOW_TIME_MS;

  if (view === "break") {
    const nextMod = test.modules[mi]!;
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-foreground px-4 text-center text-background">
        <Coffee className="size-10 opacity-80" aria-hidden />
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-widest opacity-70">Remaining break time</p>
          <p className="font-mono text-6xl font-semibold tabular-nums" role="timer" aria-label={`Break time remaining ${formatClock(breakRemaining)}`}>
            {formatClock(breakRemaining)}
          </p>
        </div>
        <div className="max-w-md space-y-2 text-sm opacity-80">
          <p>You can take a {BREAK_MINUTES}-minute break. When the break ends, the next section starts automatically.</p>
          <p>Up next: {nextMod.title}</p>
        </div>
        <Button size="lg" variant="secondary" onClick={endBreak}>
          Resume testing
        </Button>
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-card">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold sm:text-base">{heading}</p>
            <button type="button" onClick={() => setDirectionsOpen(true)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Directions <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col items-center">
            {view === "questions" || view === "review" ? (
              <>
                <span
                  role="timer"
                  aria-live={lowTime ? "assertive" : "off"}
                  aria-label={timerHidden ? "Timer hidden" : `Time remaining in module ${formatClock(remaining)}`}
                  className={cn("font-mono text-lg font-semibold tabular-nums sm:text-xl", lowTime && "text-destructive")}
                >
                  {timerHidden ? <Clock3Placeholder /> : formatClock(remaining)}
                </span>
                <button type="button" onClick={() => setTimerHidden((h) => !h)} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted" aria-label={timerHidden ? "Show timer" : "Hide timer"}>
                  {timerHidden ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />} {timerHidden ? "Show" : "Hide"}
                </button>
              </>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-1">
            {isMath && (
              <Button variant="ghost" size="sm" onClick={() => setReferenceOpen(true)} className="flex-col gap-0.5 px-2 py-1 h-auto text-xs">
                <Ruler /> Reference
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex-col gap-0.5 px-2 py-1 h-auto text-xs" aria-label="More options">
                  <MoreVertical /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard /> Keyboard shortcuts
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirmExit(true)}>
                  <LogOut /> Save and exit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="border-b-2 border-dashed border-foreground/40" aria-hidden />
      </header>

      {view === "review" ? (
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-10 text-center">
          <h1 className="text-3xl font-semibold">Check Your Work</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Select any question to review it. When you continue, you can&apos;t return to this module.
            {unansweredCount > 0 && ` You have ${unansweredCount} unanswered question${unansweredCount === 1 ? "" : "s"}; unanswered questions are scored as incorrect.`}
          </p>
          <div className="mt-8 rounded-2xl border bg-card p-6 text-left shadow-card">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <p className="font-semibold">{heading}</p>
              <Legend />
            </div>
            <QuestionGrid questions={moduleQuestions} draft={draft} current={localIndex} onJump={go} />
          </div>
          {submitError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {submitError}
            </p>
          )}
        </main>
      ) : (
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-32 pt-5 sm:px-8">
          <div className="mb-5 flex items-center gap-3 border-b bg-muted/40 px-1 py-1.5">
            <span className="flex h-8 min-w-8 items-center justify-center bg-foreground px-2 text-sm font-semibold text-background">{localIndex + 1}</span>
            <button
              type="button"
              onClick={toggleFlag}
              aria-pressed={flagged}
              className={cn("inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm", flagged ? "font-semibold" : "text-foreground/80 hover:bg-muted")}
            >
              <Bookmark className={cn("size-4", flagged && "fill-destructive text-destructive")} aria-hidden /> Mark for Review
            </button>
            {question.type !== "numeric" && (
              <button
                type="button"
                onClick={() => setEliminateMode((v) => !v)}
                aria-pressed={eliminateMode}
                aria-label="Answer eliminator"
                title="Cross out answer choices"
                className={cn("ml-auto rounded border px-2 py-0.5 text-xs font-semibold line-through decoration-2", eliminateMode ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                ABC
              </button>
            )}
          </div>
          <QuestionView
            question={toPublicQuestion(question)}
            response={draft.answers[question.id]}
            onChange={setAnswer}
            eliminated={draft.eliminated[question.id]}
            onToggleEliminate={eliminateMode ? toggleEliminate : undefined}
            disabled={submitting}
          />
        </main>
      )}

      {/* Bottom bar */}
      <footer className="fixed inset-x-0 bottom-0 z-30 bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="border-t-2 border-dashed border-foreground/40" aria-hidden />
        <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
          <p className="truncate text-sm font-semibold">{studentName}</p>
          {view === "questions" ? (
            <Button variant="default" className="bg-foreground text-background hover:bg-foreground/90" onClick={() => setNavOpen(true)} aria-haspopup="dialog">
              Question {localIndex + 1} of {moduleQuestions.length} <ChevronUp />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex justify-end gap-2">
            {view === "review" ? (
              <>
                <Button variant="outline" className="rounded-full" onClick={() => go(moduleQuestions.length - 1)}>
                  <ArrowLeft /> Back
                </Button>
                <Button className="rounded-full" onClick={() => setConfirmNext(true)} disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : null}
                  {isLastModule ? "Submit test" : "Next module"}
                </Button>
              </>
            ) : (
              <>
                {localIndex > 0 && (
                  <Button variant="outline" className="rounded-full" onClick={() => go(localIndex - 1)}>
                    Back
                  </Button>
                )}
                <Button className="rounded-full" onClick={() => (localIndex < moduleQuestions.length - 1 ? go(localIndex + 1) : setView("review"))}>
                  Next <ArrowRight />
                </Button>
              </>
            )}
          </div>
        </div>
      </footer>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{heading} Questions</DialogTitle>
            <DialogDescription>Jump to any question in this module.</DialogDescription>
          </DialogHeader>
          <Legend />
          <QuestionGrid questions={moduleQuestions} draft={draft} current={localIndex} onJump={go} />
          <div className="flex justify-center">
            <Button variant="outline" className="rounded-full" onClick={() => { setNavOpen(false); setView("review"); }}>
              Go to Review Page
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={directionsOpen} onOpenChange={setDirectionsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>
              {mod.questionIds.length} questions · {mod.minutes} minutes. The timer for this module is already running.
            </DialogDescription>
          </DialogHeader>
          <RichText text={DIRECTIONS[mod.section] ?? DIRECTIONS["Multiple Choice"]!} className="text-sm" />
          <div className="flex justify-end">
            <Button onClick={() => setDirectionsOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={referenceOpen} onOpenChange={setReferenceOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reference sheet</DialogTitle>
          </DialogHeader>
          <RichText text={REFERENCE} className="text-sm" />
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <li><kbd className="rounded border bg-muted px-1.5 font-mono text-xs">A</kbd>–<kbd className="rounded border bg-muted px-1.5 font-mono text-xs">D</kbd> select a choice</li>
            <li><kbd className="rounded border bg-muted px-1.5 font-mono text-xs">←</kbd> / <kbd className="rounded border bg-muted px-1.5 font-mono text-xs">→</kbd> previous / next question</li>
            <li><kbd className="rounded border bg-muted px-1.5 font-mono text-xs">M</kbd> mark for review</li>
          </ul>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmNext}
        onOpenChange={setConfirmNext}
        title={isLastModule ? "Submit your test?" : "Move to the next module?"}
        description={
          isLastModule
            ? "You can't change your answers after you submit."
            : `You won't be able to come back to this module.${unansweredCount ? ` ${unansweredCount} question${unansweredCount === 1 ? " is" : "s are"} unanswered.` : ""}`
        }
        confirmLabel={isLastModule ? "Submit test" : "Next module"}
        onConfirm={() => finishModule("manual")}
      />
      <ConfirmDialog
        open={confirmExit}
        onOpenChange={setConfirmExit}
        title="Save and exit?"
        description="Your answers are saved. The module timer keeps running while you're away, just like a timed test, so return soon."
        confirmLabel="Save and exit"
        onConfirm={async () => {
          await repo.saveDraft(session.id, { ...draftRef.current, updatedAt: new Date().toISOString() }).catch(() => undefined);
          const course = directoryCourseForTrack(test.track);
          router.push(course ? `/courses/${course.slug}` : "/courses");
        }}
      />
    </div>
  );
}

function Clock3Placeholder() {
  return <span className="text-sm font-normal text-muted-foreground">Hidden</span>;
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
      <span className="flex items-center gap-1.5"><span className="size-3 border border-dashed border-foreground/60" /> Unanswered</span>
      <span className="flex items-center gap-1.5"><span className="size-3 bg-primary" /> Answered</span>
      <span className="flex items-center gap-1.5"><Flag className="size-3 fill-destructive text-destructive" /> For review</span>
    </div>
  );
}

function QuestionGrid({ questions, draft, current, onJump }: { questions: Question[]; draft: SessionDraft; current: number; onJump: (i: number) => void }) {
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-3">
      {questions.map((q, i) => {
        const answered = (draft.answers[q.id]?.length ?? 0) > 0;
        const marked = draft.flagged.includes(q.id);
        return (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}: ${answered ? "answered" : "unanswered"}${marked ? ", marked for review" : ""}${i === current ? ", current" : ""}`}
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "relative flex size-10 items-center justify-center text-sm font-semibold transition-colors",
                answered ? "bg-primary text-primary-foreground" : "border border-dashed border-foreground/60 text-primary hover:bg-muted",
                i === current && "outline-2 outline-offset-2 outline-foreground",
              )}
            >
              {i + 1}
              {marked && <Flag className="absolute -right-2 -top-2 size-4 fill-destructive text-destructive" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
