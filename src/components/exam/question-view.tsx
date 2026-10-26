"use client";

import { Check, Lightbulb, Strikethrough, X } from "lucide-react";
import * as React from "react";
import { parseNumericAnswer } from "@/lib/content/grading";
import type { AnswerResponse, PublicQuestion } from "@/lib/content/types";
import { cn } from "@/lib/utils";
import { QuestionFigure } from "./figure";
import { InlineText, RichText } from "./rich-text";

export interface RevealInfo {
  correct: string[];
}

interface QuestionViewProps {
  question: PublicQuestion;
  response: AnswerResponse | undefined;
  onChange?: (response: AnswerResponse) => void;
  eliminated?: string[];
  onToggleEliminate?: (choiceId: string) => void;
  disabled?: boolean;
  reveal?: RevealInfo | null;
  hint?: string | null;
  /** Compact layout for phones/multiplayer: passage stacked above the question. */
  stacked?: boolean;
  numberLabel?: string;
}

export function QuestionView({ question, response, onChange, eliminated = [], onToggleEliminate, disabled, reveal, hint, stacked, numberLabel }: QuestionViewProps) {
  const [showHint, setShowHint] = React.useState(false);
  React.useEffect(() => setShowHint(false), [question.id]);
  const hasStimulus = Boolean(question.passage || question.figure);

  const stimulus = hasStimulus && (
    <div className="min-w-0 space-y-3">
      {question.passage?.title && <p className="text-sm font-semibold">{question.passage.title}</p>}
      {question.passage && <RichText text={question.passage.text} className="font-serif text-[1.05rem] sm:text-[1.075rem]" />}
      {question.passage?.source && <p className="text-xs text-muted-foreground">{question.passage.source}</p>}
      {question.figure && <QuestionFigure figure={question.figure} />}
    </div>
  );

  const body = (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2">
        {numberLabel && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{numberLabel}</p>}
        <RichText text={question.prompt} className="text-[1.02rem] font-medium" />
        {question.type === "multi" && <p className="text-sm text-muted-foreground">Select all that apply. No partial credit.</p>}
      </div>
      {question.type === "numeric" ? (
        <NumericInput value={response?.[0] ?? ""} onChange={(v) => onChange?.(v ? [v] : [])} disabled={disabled} reveal={reveal} />
      ) : (
        <ChoiceList question={question} response={response} onChange={onChange} eliminated={eliminated} onToggleEliminate={onToggleEliminate} disabled={disabled} reveal={reveal} />
      )}
      {hint && !reveal && (
        <div>
          {showHint ? (
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm" role="note">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <RichText text={hint} />
            </div>
          ) : (
            <button type="button" onClick={() => setShowHint(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Lightbulb className="size-4" aria-hidden /> Show hint
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (!hasStimulus) return body;
  if (stacked) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border bg-muted/30 p-4">{stimulus}</div>
        {body}
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-0">
      <div className="lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto lg:border-r lg:pr-8">{stimulus}</div>
      <div className="lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto lg:pl-8">{body}</div>
    </div>
  );
}

function ChoiceList({
  question,
  response,
  onChange,
  eliminated,
  onToggleEliminate,
  disabled,
  reveal,
}: Pick<QuestionViewProps, "question" | "response" | "onChange" | "onToggleEliminate" | "disabled" | "reveal"> & { eliminated: string[] }) {
  const multi = question.type === "multi";
  const selected = new Set(response ?? []);
  const toggle = (id: string) => {
    if (disabled || !onChange) return;
    if (multi) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange([...next].sort());
    } else {
      onChange(selected.has(id) ? [] : [id]);
    }
  };

  return (
    <div role={multi ? "group" : "radiogroup"} aria-label="Answer choices" className="grid gap-2.5">
      {(question.choices ?? []).map((choice) => {
        const isSelected = selected.has(choice.id);
        const isEliminated = eliminated.includes(choice.id) && !isSelected;
        const isCorrect = reveal?.correct.includes(choice.id);
        const state = reveal ? (isCorrect ? "correct" : isSelected ? "wrong" : "neutral") : isSelected ? "selected" : "idle";
        return (
          <div key={choice.id} className="flex items-stretch gap-2">
            <button
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={isSelected}
              aria-disabled={disabled || undefined}
              onClick={() => toggle(choice.id)}
              className={cn(
                "group flex min-h-12 flex-1 items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-[0.97rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                state === "idle" && "border-border bg-card hover:border-primary/40 hover:bg-primary-soft/40",
                state === "selected" && "border-primary bg-primary-soft",
                state === "correct" && "border-success bg-success-soft",
                state === "wrong" && "border-destructive bg-destructive-soft",
                state === "neutral" && "border-border bg-card opacity-80",
                disabled && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center border text-xs font-semibold",
                  multi ? "rounded-md" : "rounded-full",
                  state === "selected" && "border-primary bg-primary text-primary-foreground",
                  state === "correct" && "border-success bg-success text-white dark:text-background",
                  state === "wrong" && "border-destructive bg-destructive text-white dark:text-background",
                )}
                aria-hidden
              >
                {state === "correct" ? <Check className="size-4" /> : state === "wrong" ? <X className="size-4" /> : choice.id}
              </span>
              <span className={cn("min-w-0 flex-1", isEliminated && "text-muted-foreground line-through decoration-2")}>
                <span className="sr-only">Choice {choice.id}: </span>
                <InlineText text={choice.text} />
                {isEliminated && <span className="sr-only"> (eliminated)</span>}
              </span>
              {reveal && isCorrect && <span className="shrink-0 text-xs font-semibold text-success">Correct answer</span>}
              {reveal && isSelected && !isCorrect && <span className="shrink-0 text-xs font-semibold text-destructive">Your answer</span>}
            </button>
            {onToggleEliminate && !reveal && !disabled && (
              <button
                type="button"
                onClick={() => onToggleEliminate(choice.id)}
                aria-pressed={eliminated.includes(choice.id)}
                aria-label={`${eliminated.includes(choice.id) ? "Restore" : "Eliminate"} choice ${choice.id}`}
                title={eliminated.includes(choice.id) ? "Restore choice" : "Eliminate choice"}
                className={cn(
                  "flex w-10 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  eliminated.includes(choice.id) && "bg-muted text-foreground",
                )}
              >
                <Strikethrough className="size-4" aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NumericInput({ value, onChange, disabled, reveal }: { value: string; onChange: (v: string) => void; disabled?: boolean; reveal?: RevealInfo | null }) {
  const id = React.useId();
  const parsed = value ? parseNumericAnswer(value) : null;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        Your answer
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 12))}
        disabled={disabled}
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 12, -3.5, or 3/4"
        aria-describedby={`${id}-help`}
        aria-invalid={Boolean(value) && parsed === null}
        className="h-14 w-full max-w-xs rounded-xl border-2 border-input bg-card px-4 font-mono text-xl tabular-nums focus-visible:border-primary focus-visible:outline-none aria-invalid:border-destructive disabled:opacity-70"
      />
      <p id={`${id}-help`} className="text-xs text-muted-foreground" aria-live="polite">
        {value && parsed === null ? "That doesn't look like a number. Use digits, a decimal point, a minus sign, or a fraction." : "Enter an integer, decimal, or fraction. Equivalent forms are accepted."}
      </p>
      {reveal && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm">
          <Check className="mr-1 inline size-4 text-success" aria-hidden />
          Accepted answer{reveal.correct.length > 1 ? "s" : ""}: <span className="font-mono font-semibold">{reveal.correct.join(" or ")}</span>
        </p>
      )}
    </div>
  );
}
