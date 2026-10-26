/**
 * Timezone strategy: every activity timestamp is stored in UTC. Calendar-day
 * features (streaks, daily goals, weekly charts) convert timestamps to the
 * student's saved IANA timezone, falling back to UTC if it is invalid.
 */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD for the instant in the given timezone. */
export function localDateKey(instant: Date | string, tz: string): string {
  const zone = safeTimeZone(tz);
  let fmt = formatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    formatters.set(zone, fmt);
  }
  return fmt.format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Adds days to a YYYY-MM-DD key using UTC arithmetic (DST-safe for date keys). */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** Monday-start week containing the key. */
export function weekStart(key: string): string {
  const dow = dayOfWeek(key);
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

export function shortWeekday(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export interface StreakInfo {
  current: number;
  best: number;
  activeToday: boolean;
}

export function computeStreak(activeDays: Iterable<string>, todayKey: string): StreakInfo {
  const days = new Set(activeDays);
  const activeToday = days.has(todayKey);
  let current = 0;
  let cursor = activeToday ? todayKey : addDays(todayKey, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current), activeToday };
}
