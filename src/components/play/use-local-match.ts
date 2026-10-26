"use client";

import * as React from "react";
import { getQuestion, toPublicQuestion } from "@/lib/content/bank";
import { formatCorrectAnswer, isResponseCorrect } from "@/lib/content/grading";
import { randomId, seededRandom } from "@/lib/content/random";
import type { AnswerResponse, Question } from "@/lib/content/types";
import { recordLocalMatch } from "@/lib/data/repository";
import { selectQuestions } from "@/lib/engine/selection";
import { XP_RULES } from "@/lib/progression/xp";
import { COUNTDOWN_MS, nextClock, pointsFor, rankStandings, type MatchClock, type RoomSettings } from "@/lib/multiplayer/rules";
import type { MatchState } from "./match-stage";

/**
 * Local demo match: the same rules and state machine as online matches, run
 * entirely in this browser against clearly labeled practice bots. Nothing here
 * is presented as a real person, and no victory bonus is ever awarded.
 */
interface Player {
  id: string;
  name: string;
  bot: boolean;
  skill: number;
}
interface Answer {
  response: AnswerResponse;
  correct: boolean;
  points: number;
  ms: number;
}
interface Internal {
  id: string;
  clock: MatchClock;
  questions: Question[];
  players: Player[];
  answers: Record<string, Record<number, Answer>>;
  botPlan: Record<string, number>; // bot id -> ms timestamp to answer current question
  recorded: boolean;
  xpAwarded: number | null;
}

const BOT_NAMES = ["Practice Bot Ada", "Practice Bot Turing", "Practice Bot Noether", "Practice Bot Banneker"];
const HIT_RATE = { easy: 0.85, medium: 0.65, hard: 0.45 } as const;

function planBots(state: Internal, now: number): Record<string, number> {
  const rand = seededRandom(`${state.id}:${state.clock.index}:plan`);
  const limit = state.clock.secondsPerQuestion * 1000;
  return Object.fromEntries(state.players.filter((p) => p.bot).map((p) => [p.id, now + limit * (0.25 + rand() * 0.6)]));
}

export function useLocalMatch(settings: RoomSettings, playerName: string, botCount: number) {
  const meId = "local-you";
  const scoring = settings.scoring;
  const [state, setState] = React.useState<Internal | null>(null);

  const start = React.useCallback(() => {
    const id = randomId();
    const { questionIds } = selectQuestions(
      { mode: "quick", track: settings.track, sections: settings.sections, difficulty: settings.difficulty, count: settings.questionCount, timeLimitSec: null, feedback: "end", hints: false },
      `local-match:${id}`,
    );
    const now = Date.now();
    setState({
      id,
      clock: { phase: "countdown", index: 0, phaseStartedAt: now, phaseEndsAt: now + COUNTDOWN_MS, questionCount: questionIds.length, secondsPerQuestion: settings.secondsPerQuestion },
      questions: questionIds.map((q) => getQuestion(q)!).filter(Boolean),
      players: [
        { id: meId, name: playerName, bot: false, skill: 1 },
        ...BOT_NAMES.slice(0, botCount).map((name, i) => ({ id: `bot-${i}`, name, bot: true, skill: 0.85 + i * 0.1 })),
      ],
      answers: {},
      botPlan: {},
      recorded: false,
      xpAwarded: null,
    });
  }, [settings, playerName, botCount]);

  // Game loop: one stable interval per match; the updater returns the same object when nothing changes.
  const matchId = state?.id ?? null;
  const finished = state?.clock.phase === "finished";
  React.useEffect(() => {
    if (!matchId || finished) return;
    const t = window.setInterval(() => {
      setState((s) => {
        if (!s || s.id !== matchId) return s;
        const now = Date.now();
        let changed = false;
        let answers = s.answers;
        if (s.clock.phase === "question") {
          const q = s.questions[s.clock.index]!;
          const rand = seededRandom(`${s.id}:${s.clock.index}:answers`);
          for (const p of s.players.filter((pl) => pl.bot)) {
            const roll = rand();
            const at = s.botPlan[p.id] ?? Infinity;
            if (now >= at && !answers[p.id]?.[s.clock.index]) {
              const correct = roll < Math.min(0.95, HIT_RATE[q.difficulty] * p.skill);
              const wrongChoice = q.choices?.find((c) => !q.correct.includes(c.id))?.id ?? "A";
              const response = correct ? (q.type === "numeric" ? [q.correct[0]!] : q.correct) : q.type === "numeric" ? ["0"] : [wrongChoice];
              const ms = at - s.clock.phaseStartedAt;
              answers = { ...answers, [p.id]: { ...answers[p.id], [s.clock.index]: { response, correct, ms, points: pointsFor(correct, ms, s.clock.secondsPerQuestion * 1000, scoring) } } };
              changed = true;
            }
          }
        }
        const allAnswered = s.players.every((p) => answers[p.id]?.[s.clock.index]);
        const clock = nextClock(s.clock, allAnswered, now);
        if (!clock && !changed) return s;
        const next: Internal = { ...s, answers, clock: clock ?? s.clock };
        if (clock?.phase === "question") next.botPlan = planBots(next, now);
        return next;
      });
    }, 200);
    return () => window.clearInterval(t);
  }, [matchId, finished, scoring]);

  // Record finished match locally (once).
  React.useEffect(() => {
    if (!state || state.clock.phase !== "finished" || state.recorded) return;
    const mine = Object.values(state.answers[meId] ?? {});
    const correct = mine.filter((a) => a.correct).length;
    const ranked = rankStandings(
      state.players.map((p) => {
        const a = Object.values(state.answers[p.id] ?? {});
        return { id: p.id, score: a.reduce((s, x) => s + x.points, 0), correct: a.filter((x) => x.correct).length, correctTimeMs: a.filter((x) => x.correct).reduce((s, x) => s + x.ms, 0), joinedAt: p.id };
      }),
    );
    const me = ranked.find((r) => r.id === meId)!;
    const xp = correct * XP_RULES.match.correct;
    recordLocalMatch(
      {
        matchId: state.id,
        roomCode: null,
        kind: "local-demo",
        finishedAt: new Date().toISOString(),
        rank: me.rank,
        players: state.players.length,
        humanPlayers: 1,
        score: me.score,
        correct,
        total: state.questions.length,
        won: false,
        xpTotal: xp,
      },
      xp,
    );
    setState((s) => (s ? { ...s, recorded: true, xpAwarded: xp } : s));
  }, [state]);

  const answer = React.useCallback(
    async (response: AnswerResponse) => {
      setState((s) => {
        if (!s || s.clock.phase !== "question" || s.answers[meId]?.[s.clock.index]) return s;
        const q = s.questions[s.clock.index]!;
        const now = Date.now();
        if (now > s.clock.phaseEndsAt) return s;
        const correct = isResponseCorrect(q, response);
        const ms = now - s.clock.phaseStartedAt;
        return {
          ...s,
          answers: { ...s.answers, [meId]: { ...s.answers[meId], [s.clock.index]: { response, correct, ms, points: pointsFor(correct, ms, s.clock.secondsPerQuestion * 1000, settings.scoring) } } },
        };
      });
    },
    [settings.scoring],
  );

  const view: MatchState | null = React.useMemo(() => {
    if (!state) return null;
    const { clock } = state;
    const hidden = clock.phase === "question" ? clock.index : clock.phase === "countdown" ? 0 : Infinity;
    const finished = clock.phase === "finished";
    const visible = (pid: string) => Object.entries(state.answers[pid] ?? {}).filter(([i]) => Number(i) < hidden).map(([, a]) => a);
    const ranked = rankStandings(
      state.players.map((p) => {
        const a = visible(p.id);
        return { id: p.id, score: a.reduce((s, x) => s + x.points, 0), correct: a.filter((x) => x.correct).length, correctTimeMs: a.filter((x) => x.correct).reduce((s, x) => s + x.ms, 0), joinedAt: p.id, p };
      }),
    );
    const q = state.questions[clock.index];
    const mine = state.answers[meId]?.[clock.index];
    const bestStreak = (pid: string) => {
      let best = 0;
      let run = 0;
      for (let i = 0; i < state.questions.length; i++) {
        run = state.answers[pid]?.[i]?.correct ? run + 1 : 0;
        best = Math.max(best, run);
      }
      return best;
    };
    return {
      id: state.id,
      round: 1,
      phase: clock.phase,
      index: clock.index,
      phaseStartedAt: clock.phaseStartedAt,
      phaseEndsAt: clock.phaseEndsAt,
      questionCount: clock.questionCount,
      secondsPerQuestion: clock.secondsPerQuestion,
      scoring: settings.scoring,
      isParticipant: true,
      question: (clock.phase === "question" || clock.phase === "reveal") && q ? toPublicQuestion(q) : null,
      myAnswer: mine?.response ?? null,
      answeredCount: state.players.filter((p) => state.answers[p.id]?.[clock.index]).length,
      participantCount: state.players.length,
      reveal:
        clock.phase === "reveal" && q
          ? {
              correct: q.correct,
              correctText: formatCorrectAnswer(q),
              explanation: q.explanation,
              myCorrect: mine ? mine.correct : null,
              myPoints: mine?.points ?? 0,
              results: state.players.map((p) => {
                const a = state.answers[p.id]?.[clock.index];
                return { userId: p.id, displayName: p.name, correct: Boolean(a?.correct), points: a?.points ?? 0, answered: Boolean(a) };
              }),
            }
          : null,
      standings: ranked.map((r) => {
        const all = Object.values(state.answers[r.id] ?? {});
        return {
          userId: r.id,
          displayName: r.p.name,
          score: r.score,
          correct: r.correct,
          answered: visible(r.id).length,
          rank: r.rank,
          isMe: r.id === meId,
          lastPoints: clock.phase === "reveal" ? (state.answers[r.id]?.[clock.index]?.points ?? 0) : null,
          ...(finished
            ? {
                bestStreak: bestStreak(r.id),
                fastestCorrectMs: all.filter((a) => a.correct).reduce<number | null>((m, a) => (m === null ? a.ms : Math.min(m, a.ms)), null),
                xpAwarded: state.recorded ? (r.id === meId ? (state.xpAwarded ?? 0) : 0) : undefined,
              }
            : {}),
        };
      }),
    };
  }, [state, settings.scoring]);

  const botIds = React.useMemo(() => new Set(state?.players.filter((p) => p.bot).map((p) => p.id) ?? []), [state?.players]);
  return { view, start, answer, botIds, reset: () => setState(null) };
}
