"use client";

import {
  DEFAULT_PREFERENCES,
  type EarnedAchievement,
  type MatchSummary,
  type PracticeSession,
  type Preferences,
  type SessionDraft,
  type SessionResult,
  type XpEntry,
} from "@/lib/engine/types";

/**
 * Demo-mode persistence. Everything lives in this browser's localStorage and
 * never leaves the device. All access is wrapped so private browsing or
 * blocked storage degrades to in-memory state instead of crashing.
 */
const PREFIX = "studyduel:v1:";
const memory = new Map<string, string>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFIX + key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  if (raw === null) raw = memory.get(key) ?? null;
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(PREFIX + key, raw);
  } catch {
    // Storage full or blocked: keep the in-memory copy for this tab.
  }
}

function remove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const localStore = {
  storageAvailable(): boolean {
    try {
      const k = `${PREFIX}probe`;
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
  getSessions: () => read<Record<string, PracticeSession>>("sessions", {}),
  saveSession(session: PracticeSession) {
    const all = read<Record<string, PracticeSession>>("sessions", {});
    all[session.id] = session;
    // Keep storage bounded: drop the oldest completed sessions beyond 300.
    const entries = Object.values(all).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    write("sessions", Object.fromEntries(entries.slice(0, 300).map((s) => [s.id, s])));
  },
  getDraft: (sessionId: string) => read<SessionDraft | null>(`draft:${sessionId}`, null),
  saveDraft: (sessionId: string, draft: SessionDraft) => write(`draft:${sessionId}`, draft),
  clearDraft: (sessionId: string) => remove(`draft:${sessionId}`),
  getResults: () => read<SessionResult[]>("results", []),
  addResult(result: SessionResult) {
    const results = read<SessionResult[]>("results", []).filter((r) => r.sessionId !== result.sessionId);
    write("results", [result, ...results].slice(0, 500));
  },
  getMatches: () => read<MatchSummary[]>("matches", []),
  addMatch(match: MatchSummary) {
    write("matches", [match, ...read<MatchSummary[]>("matches", []).filter((m) => m.matchId !== match.matchId)].slice(0, 200));
  },
  getLedger: () => read<XpEntry[]>("ledger", []),
  addLedger(entries: XpEntry[]) {
    const existing = read<XpEntry[]>("ledger", []);
    const ids = new Set(existing.map((e) => e.id));
    write("ledger", [...entries.filter((e) => !ids.has(e.id)), ...existing].slice(0, 5000));
  },
  getAchievements: () => read<EarnedAchievement[]>("achievements", []),
  addAchievements(list: EarnedAchievement[]) {
    const existing = read<EarnedAchievement[]>("achievements", []);
    const have = new Set(existing.map((a) => a.id));
    write("achievements", [...existing, ...list.filter((a) => !have.has(a.id))]);
  },
  getSaved: () => read<string[]>("saved", []),
  setSaved: (ids: string[]) => write("saved", [...new Set(ids)]),
  getPreferences(): Preferences {
    const stored = read<Partial<Preferences>>("preferences", {});
    let timezone = stored.timezone;
    if (!timezone) {
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      } catch {
        timezone = "UTC";
      }
    }
    return { ...DEFAULT_PREFERENCES, ...stored, timezone };
  },
  setPreferences: (prefs: Preferences) => write("preferences", prefs),
  clearAll() {
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memory.clear();
  },
};
