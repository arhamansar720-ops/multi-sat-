"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as React from "react";
import { getPublicConfig, type PublicConfigStatus } from "@/lib/config";
import { localStore } from "@/lib/data/local-store";
import { AppError, localRepository, remoteRepository, type StudyRepository } from "@/lib/data/repository";
import type { UserActivity } from "@/lib/engine/types";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export interface AppUser {
  id: string;
  email: string | null;
  isGuest: boolean;
}

interface AppContextValue {
  config: PublicConfigStatus;
  supabase: SupabaseClient | null;
  /** True once we know whether someone is signed in. */
  authReady: boolean;
  user: AppUser | null;
  /** Where study data lives right now. */
  dataScope: "device" | "account";
  repo: StudyRepository;
  activity: UserActivity | null;
  activityLoading: boolean;
  activityError: string | null;
  refreshActivity: () => Promise<void>;
  continueAsGuest: (displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  storageAvailable: boolean;
  /** True when Supabase is configured but couldn't be reached. */
  backendUnreachable: boolean;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const config = React.useMemo(() => getPublicConfig(), []);
  const supabase = React.useMemo(() => getBrowserSupabase(), []);
  const [authReady, setAuthReady] = React.useState(!supabase);
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [activity, setActivity] = React.useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = React.useState(true);
  const [backendUnreachable, setBackendUnreachable] = React.useState(false);

  React.useEffect(() => {
    setStorageAvailable(localStore.storageAvailable());
    if (!supabase) return;
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        setBackendUnreachable(Boolean(error && (error.name === "AuthRetryableFetchError" || /fetch|network/i.test(error.message))));
        const u = data.user;
        setUser(u ? { id: u.id, email: u.email ?? null, isGuest: Boolean(u.is_anonymous) } : null);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setBackendUnreachable(true);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? null, isGuest: Boolean(u.is_anonymous) } : null);
      setAuthReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const repo = user && supabase ? remoteRepository : localRepository;
  const dataScope = repo.kind === "remote" ? "account" : "device";

  const refreshActivity = React.useCallback(async () => {
    setActivityLoading(true);
    try {
      const next = await repo.getActivity();
      setActivity(next);
      setActivityError(null);
    } catch (err) {
      setActivityError(err instanceof AppError ? err.message : "Couldn't load your progress.");
    } finally {
      setActivityLoading(false);
    }
  }, [repo]);

  React.useEffect(() => {
    if (!authReady) return;
    void refreshActivity();
  }, [authReady, refreshActivity, user?.id]);

  const continueAsGuest = React.useCallback(
    async (displayName?: string) => {
      if (!supabase) throw new AppError("Online play isn't configured on this deployment.");
      const { data: existing } = await supabase.auth.getUser();
      if (existing.user) return;
      const { error } = await supabase.auth.signInAnonymously({ options: { data: displayName ? { display_name: displayName } : {} } });
      if (error) {
        if (error.name === "AuthRetryableFetchError" || /fetch|network/i.test(error.message)) {
          setBackendUnreachable(true);
          throw new AppError("Online services are temporarily unavailable. Solo practice still works and saves on this device.", "network");
        }
        throw new AppError(
          /anonymous/i.test(error.message)
            ? "Guest play is turned off on this server. Create a free account to play online."
            : error.message,
        );
      }
    },
    [supabase],
  );

  const signOut = React.useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  }, [supabase]);

  const value: AppContextValue = {
    config,
    supabase,
    authReady,
    user,
    dataScope,
    repo,
    activity,
    activityLoading,
    activityError,
    refreshActivity,
    continueAsGuest,
    signOut,
    storageAvailable,
    backendUnreachable,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
