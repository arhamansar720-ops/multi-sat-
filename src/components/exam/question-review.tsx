"use client";

import { Bookmark, BookmarkCheck, Check, ChevronDown, Flag, Minus, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCorrectAnswer } from "@/lib/content/grading";
import type { AnswerResponse, Question } from "@/lib/content/types";
import { AppError } from "@/lib/data/repository";
import { cn } from "@/lib/utils";
import { QuestionView } from "./question-view";
import { RichText } from "./rich-text";

interface Props {
  question: Question;
  number: number;
  response: AnswerResponse | null;
  correct: boolean;
  flagged?: boolean;
  defaultOpen?: boolean;
}

/** Expandable review card: the question, the student's answer, the key, and the explanation. */
export function QuestionReview({ question, number, response, correct, flagged, defaultOpen }: Props) {
  const [open, setOpen] = React.useState(Boolean(defaultOpen));
  const { activity, repo, refreshActivity } = useApp();
  const [saved, setSaved] = React.useState(() => activity?.saved.includes(question.id) ?? false);
  React.useEffect(() => setSaved(activity?.saved.includes(question.id) ?? false), [activity, question.id]);
  const answered = Boolean(response?.length);
  const status = correct ? "Correct" : answered ? "Incorrect" : "Skipped";
  const Icon = correct ? Check : answered ? X : Minus;
  const id = React.useId();

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      await repo.setSaved(question.id, next);
      toast.success(next ? "Saved for later review" : "Removed from saved");
      void refreshActivity();
    } catch (err) {
      setSaved(!next);
      toast.error(err instanceof AppError ? err.message : "Couldn't update saved questions.");
    }
  };

  return (
    <li className="rounded-2xl border bg-card shadow-card">
      <div className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            correct ? "bg-success-soft text-success" : answered ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span className="block text-sm font-medium">
            Question {number} · <span className={correct ? "text-success" : answered ? "text-destructive" : "text-muted-foreground"}>{status}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {question.topic} · {question.skill}
          </span>
        </button>
        {flagged && (
          <Badge variant="warning" className="hidden sm:inline-flex">
            <Flag /> Marked
          </Badge>
        )}
        <Button variant="ghost" size="icon-sm" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? "Remove from saved questions" : "Save question for review"}>
          {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} aria-controls={id}>
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <div id={id} className="space-y-5 border-t p-4 sm:p-6">
          <QuestionView question={question} response={response ?? undefined} disabled reveal={{ correct: question.correct }} stacked />
          <div className="rounded-xl bg-muted/60 p-4">
            <RichText text={`**Correct answer:** ${formatCorrectAnswer(question)}`} className="mb-1 text-sm" />
            <RichText text={question.explanation} className="text-sm" />
          </div>
        </div>
      )}
    </li>
  );
}
