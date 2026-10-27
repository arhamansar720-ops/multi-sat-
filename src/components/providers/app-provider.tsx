"use client";

import * as React from "react";
import type { PublicConfigStatus } from "@/lib/config";
import { localStore } from "@/lib/data/local-store";
import { api, AppError, localRepository, remoteRepository, type StudyRepository } from "@/lib/data/repository";
import type { UserActivity } from "@/lib/engine/types";

export interface AppUser {
  id: string;
  email: string | null;
  isGuest: boolean;
  displayName: string;
  username: string | null;
}

interface AppContextValue {
  config: PublicConfigStatus;
  /** True when this deployment has a database (accounts, sync, multiplayer). */
  online: boolean;
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
  /** Re-reads the signed-in user after sign-in, sign-up, or other auth changes. */
  refreshUser: () => Promise<AppUser | null>;
  continueAsGuest: (displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  storageAvailable: boolean;
  /** True when the backend is configured but couldn't be reached. */
  backendUnreachable: boolean;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({ config, children }: { config: PublicConfigStatus; children: React.ReactNode }) {
  const online = config.mode === "connected";
  const [authReady, setAuthReady] = React.useState(!online);
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [activity, setActivity] = React.useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = React.useState(true);
  const [activityError, setActivityError] = React.useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = React.useState(true);
  const [backendUnreachable, setBackendUnreachable] = React.useState(false);

  const refreshUser = React.useCallback(async () => {
    if (!online) return null;
    try {
      const { user: next } = await api<{ user: AppUser | null }>("/api/auth/session");
      setUser(next);
      setBackendUnreachable(false);
      return next;
    } catch (err) {
      // Server or database unreachable: keep working locally.
      setBackendUnreachable(!(err instanceof AppError) || err.code === "network" || err.status >= 500);
      setUser(null);
      return null;
    } finally {
      setAuthReady(true);
    }
  }, [online]);

  React.useEffect(() => {
    setStorageAvailable(localStore.storageAvailable());
    void refreshUser();
  }, [refreshUser]);

  const repo = user && online ? remoteRepository : localRepository;
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
      if (!online) throw new AppError("Online play isn't configured on this deployment.");
      if (user) return;
      try {
        await api("/api/auth/guest", { method: "POST", json: displayName ? { displayName } : {} });
      } catch (err) {
        if (err instanceof AppError && (err.code === "network" || err.status >= 500)) {
          setBackendUnreachable(true);
          throw new AppError("Online services are temporarily unavailable. Solo practice still works and saves on this device.", "network");
        }
        throw err;
      }
      await refreshUser();
    },
    [online, user, refreshUser],
  );

  const signOut = React.useCallback(async () => {
    if (online) await api("/api/auth/sign-out", { method: "POST" }).catch(() => {});
    setUser(null);
  }, [online]);

  const value: AppContextValue = {
    config,
    online,
    authReady,
    user,
    dataScope,
    repo,
    activity,
    activityLoading,
    activityError,
    refreshActivity,
    refreshUser,
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
