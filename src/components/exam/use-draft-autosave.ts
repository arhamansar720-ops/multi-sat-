"use client";

import * as React from "react";
import { localStore } from "@/lib/data/local-store";
import type { StudyRepository } from "@/lib/data/repository";
import type { SessionDraft } from "@/lib/engine/types";

const SIGNIFICANT_INTERVAL_MS = 1_000;
const TIMING_INTERVAL_MS = 15_000;

/** Everything except time-on-question counters, which change every second. */
function significantKey(d: SessionDraft): string {
  return JSON.stringify([d.answers, d.flagged, d.eliminated, d.checked, d.currentIndex, d.moduleIndex, d.moduleStartedAt, d.breakUntil]);
}

/**
 * Persists a session draft without starving under constant updates:
 * - every change is written to this device immediately (refresh-safe);
 * - the repository (server in connected mode) is throttled: answer, flag, and
 *   navigation changes within ~1s, timing-only changes at most every 15s;
 * - pending changes are flushed when the page is hidden or closed.
 */
export function useDraftAutosave(repo: StudyRepository, sessionId: string, draft: SessionDraft, disabled: boolean) {
  const latest = React.useRef(draft);
  const lastSentAt = React.useRef(0);
  const lastSentKey = React.useRef<string | null>(null);
  const timer = React.useRef<number | null>(null);
  const disabledRef = React.useRef(disabled);

  React.useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const send = React.useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (disabledRef.current) return;
    const d = { ...latest.current, updatedAt: new Date().toISOString() };
    lastSentAt.current = Date.now();
    lastSentKey.current = significantKey(d);
    repo.saveDraft(sessionId, d).catch(() => {
      // The device copy is current; the next change retries the server.
      lastSentKey.current = null;
    });
  }, [repo, sessionId]);

  React.useEffect(() => {
    latest.current = draft;
    if (disabled) return;
    localStore.saveDraft(sessionId, { ...draft, updatedAt: new Date().toISOString() });
    if (repo.kind === "local") return; // the device copy is the repository
    const significant = significantKey(draft) !== lastSentKey.current;
    const wait = Math.max(0, lastSentAt.current + (significant ? SIGNIFICANT_INTERVAL_MS : TIMING_INTERVAL_MS) - Date.now());
    if (wait === 0) send();
    else if (!timer.current || significant) {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(send, wait);
    }
  }, [draft, disabled, repo.kind, sessionId, send]);

  React.useEffect(() => {
    if (repo.kind === "local") return;
    const flush = () => {
      if (document.visibilityState === "hidden" && significantKey(latest.current) !== lastSentKey.current) send();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", send);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", send);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [repo.kind, send]);
}
