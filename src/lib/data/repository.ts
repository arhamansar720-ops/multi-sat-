"use client";

import { getTrack } from "@/lib/content/catalog";
import { randomId } from "@/lib/content/random";
import { finalizeSession, rewardContextFromHistory } from "@/lib/engine/finalize";
import { deadlineFor, normalizeConfig, selectQuestions, sessionTitle } from "@/lib/engine/selection";
import {
  sessionConfigSchema,
  type MatchSummary,
  type PracticeSession,
  type Preferences,
  type SessionConfig,
  type SessionDraft,
  type SessionResult,
  type UserActivity,
} from "@/lib/engine/types";
import { newAchievements } from "@/lib/progression/achievements";
import { computeProgress } from "@/lib/progression/stats";
import { localStore } from "./local-store";

export class AppError extends Error {
  constructor(
    message: string,
    public code = "error",
    public status = 0,
  ) {
    super(message);
  }
}

export interface LoadedSession {
  session: PracticeSession;
  draft: SessionDraft | null;
  result: SessionResult | null;
  /** serverNow - clientNow, so timers use the authoritative clock. */
  clockOffsetMs: number;
}

export interface StudyRepository {
  kind: "local" | "remote";
  createSession(config: SessionConfig): Promise<PracticeSession>;
  getSession(id: string): Promise<LoadedSession | null>;
  saveDraft(id: string, draft: SessionDraft): Promise<void>;
  submitSession(id: string, draft: SessionDraft): Promise<SessionResult>;
  getResult(id: string): Promise<SessionResult | null>;
  getActivity(): Promise<UserActivity>;
  listInProgress(): Promise<PracticeSession[]>;
  setSaved(questionId: string, saved: boolean): Promise<void>;
  savePreferences(prefs: Partial<Preferences>): Promise<void>;
}

export function emptyDraft(): SessionDraft {
  return { answers: {}, flagged: [], eliminated: {}, checked: [], currentIndex: 0, timeSpentMs: {}, updatedAt: new Date().toISOString() };
}

function localActivity(): UserActivity {
  return {
    results: localStore.getResults(),
    matches: localStore.getMatches(),
    xpLedger: localStore.getLedger(),
    achievements: localStore.getAchievements(),
    saved: localStore.getSaved(),
    preferences: localStore.getPreferences(),
  };
}

/** Evaluates achievements after a new result or match, using the same rules as the server. */
export function achievementsAfter(activity: UserActivity, now = new Date()): string[] {
  const snapshot = computeProgress(activity, now);
  return newAchievements(
    {
      results: activity.results,
      matches: activity.matches,
      weeklyMinutes: snapshot.week.minutes,
      weeklyGoalMinutes: snapshot.week.goalMinutes,
      currentStreak: snapshot.streak.current,
    },
    activity.achievements,
  );
}

/** Demo mode: identical engine and reward rules, persisted only in this browser. */
export const localRepository: StudyRepository = {
  kind: "local",
  async createSession(raw) {
    const config = normalizeConfig(sessionConfigSchema.parse(raw));
    if (!getTrack(config.track)) throw new AppError("That exam or course does not exist.");
    const id = randomId();
    const now = new Date();
    const { questionIds, dailyKey } = selectQuestions(config, `local:${id}`, now);
    if (questionIds.length === 0) throw new AppError("No questions match those filters yet. Try broadening your selection.");
    const session: PracticeSession = {
      id,
      title: sessionTitle(config),
      config: { ...config, count: questionIds.length },
      questionIds,
      startedAt: now.toISOString(),
      deadline: deadlineFor(now, config.timeLimitSec),
      status: "in_progress",
      dailyKey,
    };
    localStore.saveSession(session);
    return session;
  },
  async getSession(id) {
    const session = localStore.getSessions()[id];
    if (!session) return null;
    const result = localStore.getResults().find((r) => r.sessionId === id) ?? null;
    return { session, draft: localStore.getDraft(id), result, clockOffsetMs: 0 };
  },
  async saveDraft(id, draft) {
    localStore.saveDraft(id, draft);
  },
  async submitSession(id, draft) {
    const session = localStore.getSessions()[id];
    if (!session) throw new AppError("This session no longer exists on this device.");
    const existing = localStore.getResults().find((r) => r.sessionId === id);
    if (existing) return existing; // idempotent: resubmitting never re-awards XP
    const now = new Date();
    const before = localActivity();
    const ctx = rewardContextFromHistory({ ...before, timezone: before.preferences.timezone }, session, now);
    const result = finalizeSession(session, draft, ctx, now);
    const ledger = result.xp.map((a) => ({ id: `${id}:${a.reason}`, amount: a.amount, reason: a.reason, sourceId: id, createdAt: result.completedAt }));
    const after: UserActivity = { ...before, results: [result, ...before.results], xpLedger: [...ledger, ...before.xpLedger] };
    result.newAchievements = achievementsAfter(after, now);
    localStore.addResult(result);
    localStore.addLedger(ledger);
    localStore.addAchievements(result.newAchievements.map((a) => ({ id: a, earnedAt: result.completedAt })));
    localStore.saveSession({ ...session, status: "completed" });
    localStore.clearDraft(id);
    return result;
  },
  async getResult(id) {
    return localStore.getResults().find((r) => r.sessionId === id) ?? null;
  },
  async getActivity() {
    return localActivity();
  },
  async listInProgress() {
    const done = new Set(localStore.getResults().map((r) => r.sessionId));
    return Object.values(localStore.getSessions())
      .filter((s) => s.status === "in_progress" && !done.has(s.id))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 5);
  },
  async setSaved(questionId, saved) {
    const ids = new Set(localStore.getSaved());
    if (saved) ids.add(questionId);
    else ids.delete(questionId);
    localStore.setSaved([...ids]);
  },
  async savePreferences(prefs) {
    localStore.setPreferences({ ...localStore.getPreferences(), ...prefs });
  },
};

/** Records a finished local demo match (bots are labeled; no win bonus is ever paid). */
export function recordLocalMatch(summary: MatchSummary, correctXp: number): string[] {
  const before = localActivity();
  const ledger =
    correctXp > 0 ? [{ id: `${summary.matchId}:match_correct`, amount: correctXp, reason: "match_correct" as const, sourceId: summary.matchId, createdAt: summary.finishedAt }] : [];
  localStore.addMatch(summary);
  localStore.addLedger(ledger);
  const after = { ...before, matches: [summary, ...before.matches], xpLedger: [...ledger, ...before.xpLedger] };
  const earned = achievementsAfter(after);
  localStore.addAchievements(earned.map((id) => ({ id, earnedAt: summary.finishedAt })));
  return earned;
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch {
    throw new AppError("Can't reach the server. Check your connection and try again.", "network");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AppError(err?.message ?? `Request failed (${res.status}).`, err?.code ?? "http_error", res.status);
  }
  return data as T;
}

/** Connected mode: the server creates, grades, and stores sessions. */
export const remoteRepository: StudyRepository = {
  kind: "remote",
  async createSession(config) {
    const { session } = await api<{ session: PracticeSession }>("/api/sessions", { method: "POST", json: { config } });
    return session;
  },
  async getSession(id) {
    try {
      const data = await api<{ session: PracticeSession; draft: SessionDraft | null; result: SessionResult | null; serverNow: number }>(
        `/api/sessions/${encodeURIComponent(id)}`,
      );
      // Prefer the newer of the server draft and this device's draft.
      const local = localStore.getDraft(id);
      const draft = local && (!data.draft || local.updatedAt > data.draft.updatedAt) ? local : data.draft;
      return { session: data.session, draft, result: data.result, clockOffsetMs: data.serverNow - Date.now() };
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return null;
      throw err;
    }
  },
  async saveDraft(id, draft) {
    localStore.saveDraft(id, draft);
    await api(`/api/sessions/${encodeURIComponent(id)}/draft`, { method: "PUT", json: draft });
  },
  async submitSession(id, draft) {
    const { result } = await api<{ result: SessionResult }>(`/api/sessions/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      json: { answers: draft.answers, flagged: draft.flagged, timeSpentMs: draft.timeSpentMs },
    });
    localStore.clearDraft(id);
    return result;
  },
  async getResult(id) {
    const loaded = await remoteRepository.getSession(id);
    return loaded?.result ?? null;
  },
  async getActivity() {
    const { activity } = await api<{ activity: UserActivity }>("/api/me/activity");
    return activity;
  },
  async listInProgress() {
    const { sessions } = await api<{ sessions: PracticeSession[] }>("/api/sessions");
    return sessions;
  },
  async setSaved(questionId, saved) {
    await api("/api/me/saved", { method: "POST", json: { questionId, saved } });
  },
  async savePreferences(prefs) {
    await api("/api/me/preferences", { method: "PUT", json: prefs });
  },
};
