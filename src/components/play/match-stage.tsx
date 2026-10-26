"use client";

import { MotionConfig, motion } from "framer-motion";
import { Bot, Check, Clock, Crown, Flame, Loader2, Medal, Send, Timer, Trophy, X, Zap } from "lucide-react";
import * as React from "react";
import { QuestionView } from "@/components/exam/question-view";
import { RichText } from "@/components/exam/rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AnswerResponse } from "@/lib/content/types";
import type { RoomState } from "@/lib/server/rooms";
import { cn, formatClock } from "@/lib/utils";

export type MatchState = NonNullable<RoomState["match"]>;

export function useServerNow(offsetMs: number, intervalMs = 250): number {
  const [now, setNow] = React.useState(() => Date.now() + offsetMs);
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => window.clearInterval(t);
  }, [offsetMs, intervalMs]);
  return now;
}

interface StageProps {
  match: MatchState;
  now: number;
  botIds?: Set<string>;
  onAnswer: (response: AnswerResponse) => Promise<void>;
  submitting: boolean;
  answerError: string | null;
  footer?: React.ReactNode;
}

export function MatchStage(props: StageProps) {
  const { match, now } = props;
  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="violet">Round {match.round}</Badge>
          <span className="text-muted-foreground">
            {match.phase === "finished" ? "Final results" : `Question ${Math.min(match.index + 1, match.questionCount)} of ${match.questionCount}`}
          </span>
          <Badge variant="outline" className="ml-auto">
            {match.scoring === "speed" ? "Speed bonus on" : "Accuracy only"}
          </Badge>
        </div>
        {match.phase === "countdown" && <Countdown endsAt={match.phaseEndsAt} now={now} />}
        {match.phase === "question" && <QuestionPhase {...props} />}
        {match.phase === "reveal" && <RevealPhase {...props} />}
        {match.phase === "finished" && <FinalResults match={match} botIds={props.botIds} footer={props.footer} />}
      </div>
    </MotionConfig>
  );
}

function Countdown({ endsAt, now }: { endsAt: number; now: number }) {
  const secs = Math.max(1, Math.ceil((endsAt - now) / 1000));
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center" role="status" aria-live="assertive">
      <p className="text-muted-foreground">Get ready…</p>
      <motion.p key={secs} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-7xl font-semibold tabular-nums text-primary">
        {secs}
      </motion.p>
    </div>
  );
}

function TimerBar({ start, end, now }: { start: number; end: number; now: number }) {
  const remaining = Math.max(0, end - now);
  const ratio = end > start ? remaining / (end - start) : 0;
  const low = remaining < 5000;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className={cn("flex items-center gap-1.5 font-mono tabular-nums", low && "text-destructive")} role="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
          <Timer className="size-4" aria-hidden /> {formatClock(remaining)}
        </span>
      </div>
      <Progress value={ratio} label="Time left for this question" indicatorClassName={cn("transition-none", low ? "bg-destructive" : "bg-primary")} />
    </div>
  );
}

function QuestionPhase({ match, now, onAnswer, submitting, answerError }: StageProps) {
  const [response, setResponse] = React.useState<AnswerResponse>([]);
  React.useEffect(() => setResponse([]), [match.index, match.id]);
  const q = match.question;
  if (!q) return <Loader2 className="mx-auto size-6 animate-spin" aria-label="Loading question" />;
  const locked = Boolean(match.myAnswer);
  const timeUp = now > match.phaseEndsAt;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardContent className="space-y-6 pt-5 sm:pt-6">
          <TimerBar start={match.phaseStartedAt} end={match.phaseEndsAt} now={now} />
          <QuestionView question={q} response={locked ? match.myAnswer! : response} onChange={setResponse} disabled={locked || timeUp || !match.isParticipant} stacked />
          {!match.isParticipant ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">You joined after this round started, so you&apos;re watching. You&apos;ll play in the next round.</p>
          ) : locked ? (
            <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm font-medium" role="status">
              <Check className="size-4 text-primary" aria-hidden /> Answer locked in. Waiting for the reveal…
            </p>
          ) : (
            <Button size="lg" className="w-full sm:w-auto" disabled={!response.length || submitting || timeUp} onClick={() => onAnswer(response)}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />} {timeUp ? "Time's up" : "Lock in answer"}
            </Button>
          )}
          {answerError && (
            <p role="alert" className="text-sm text-destructive">
              {answerError}
            </p>
          )}
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card>
          <CardContent className="pt-5 text-sm">
            <p className="font-medium">
              {match.answeredCount} of {match.participantCount} answered
            </p>
            <Progress className="mt-2" value={match.participantCount ? match.answeredCount / match.participantCount : 0} label="Players who have answered" indicatorClassName="bg-violet" />
          </CardContent>
        </Card>
        <Standings match={match} compact />
      </aside>
    </div>
  );
}

function RevealPhase({ match, now, botIds }: StageProps) {
  const reveal = match.reveal;
  const q = match.question;
  if (!reveal || !q) return null;
  const mine = reveal.myCorrect;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardContent className="space-y-5 pt-5 sm:pt-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3",
              mine === true ? "bg-success-soft" : mine === false ? "bg-destructive-soft" : "bg-muted",
            )}
            role="status"
            aria-live="polite"
          >
            {mine === true ? <Check className="size-5 text-success" aria-hidden /> : mine === false ? <X className="size-5 text-destructive" aria-hidden /> : <Clock className="size-5 text-muted-foreground" aria-hidden />}
            <p className="font-semibold">
              {mine === true ? `Correct! +${reveal.myPoints} points` : mine === false ? "Not this time. 0 points" : match.isParticipant ? "No answer. 0 points" : "Reveal"}
            </p>
          </motion.div>
          <QuestionView question={q} response={match.myAnswer ?? undefined} disabled reveal={{ correct: reveal.correct }} stacked />
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            <RichText text={reveal.explanation} />
          </div>
          <p className="text-xs text-muted-foreground">Next question in {Math.max(0, Math.ceil((match.phaseEndsAt - now) / 1000))}s</p>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">This question</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {reveal.results.map((r) => (
                <li key={r.userId} className="flex items-center gap-2">
                  {r.correct ? <Check className="size-4 text-success" aria-label="correct" /> : r.answered ? <X className="size-4 text-destructive" aria-label="incorrect" /> : <Clock className="size-4 text-muted-foreground" aria-label="no answer" />}
                  <span className="flex-1 truncate">
                    {r.displayName}
                    {botIds?.has(r.userId) && <BotTag />}
                  </span>
                  <span className="tabular-nums text-muted-foreground">+{r.points}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Standings match={match} botIds={botIds} />
      </aside>
    </div>
  );
}

export function BotTag() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
      <Bot className="size-3" aria-hidden /> bot
    </span>
  );
}

export function Standings({ match, compact, botIds }: { match: MatchState; compact?: boolean; botIds?: Set<string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="size-4 text-warning" aria-hidden /> Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1.5">
          {match.standings.map((s) => (
            <motion.li layout key={s.userId} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", s.isMe && "bg-primary-soft font-medium")}>
              <span className="w-5 text-right tabular-nums text-muted-foreground">{s.rank}</span>
              <span className="flex-1 truncate">
                {s.displayName}
                {s.isMe && <span className="text-muted-foreground"> (you)</span>}
                {botIds?.has(s.userId) && <BotTag />}
              </span>
              {!compact && s.lastPoints !== null && s.lastPoints > 0 && <span className="text-xs text-success">+{s.lastPoints}</span>}
              <span className="font-mono tabular-nums">{s.score}</span>
            </motion.li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function FinalResults({ match, botIds, footer }: { match: MatchState; botIds?: Set<string>; footer?: React.ReactNode }) {
  const me = match.standings.find((s) => s.isMe);
  const winners = match.standings.filter((s) => s.rank === 1);
  const podium = match.standings.slice(0, 3);
  const finalized = match.standings.some((s) => s.xpAwarded !== undefined);
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="space-y-6 pt-6 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}>
            <Crown className="mx-auto size-10 text-warning" aria-hidden />
            <h2 className="mt-2 text-2xl font-semibold">
              {winners.length > 1 ? `It's a tie: ${winners.map((w) => w.displayName).join(" & ")}` : `${winners[0]?.displayName ?? "Nobody"} wins!`}
            </h2>
          </motion.div>
          <ol className="mx-auto flex max-w-md items-end justify-center gap-3" aria-label="Podium">
            {podium.map((s, i) => (
              <motion.li
                key={s.userId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 * i }}
                className={cn(
                  "flex w-28 flex-col items-center justify-end rounded-t-xl border px-2 pb-3 pt-4",
                  s.rank === 1 ? "h-36 border-warning/40 bg-warning-soft" : s.rank === 2 ? "h-28 bg-muted" : "h-24 bg-muted/60",
                )}
              >
                <Medal className={cn("size-5", s.rank === 1 ? "text-warning" : "text-muted-foreground")} aria-hidden />
                <span className="mt-1 w-full truncate text-sm font-semibold">{s.displayName}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.score} pts</span>
                <span className="sr-only">Rank {s.rank}</span>
              </motion.li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {me && (
        <section aria-label="Your results" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile icon={Trophy} label="Your rank" value={`#${me.rank} of ${match.standings.length}`} />
          <Tile icon={Zap} label="Points" value={String(me.score)} />
          <Tile icon={Check} label="Accuracy" value={`${me.correct}/${match.questionCount} (${Math.round((me.correct / match.questionCount) * 100)}%)`} />
          <Tile icon={Flame} label="Best streak" value={me.bestStreak !== undefined ? String(me.bestStreak) : "—"} />
          <Tile icon={Clock} label="Fastest correct" value={me.fastestCorrectMs ? `${(me.fastestCorrectMs / 1000).toFixed(1)}s` : "—"} />
        </section>
      )}
      {me && (
        <p className="text-center text-sm text-muted-foreground" role="status">
          {finalized ? (me.xpAwarded ? `You earned ${me.xpAwarded} XP.` : "No XP this match.") : "Calculating XP…"}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Final rankings</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-2">#</th>
                <th scope="col" className="py-2 pr-2">Player</th>
                <th scope="col" className="py-2 pr-2 text-right">Correct</th>
                <th scope="col" className="py-2 pr-2 text-right">Best streak</th>
                <th scope="col" className="py-2 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {match.standings.map((s) => (
                <tr key={s.userId} className={cn("border-t", s.isMe && "font-medium")}>
                  <td className="py-2 pr-2 tabular-nums">{s.rank}</td>
                  <td className="py-2 pr-2">
                    {s.displayName}
                    {s.isMe && " (you)"}
                    {botIds?.has(s.userId) && <BotTag />}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{s.correct}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{s.bestStreak ?? "—"}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{s.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {footer}
    </div>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-card">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
