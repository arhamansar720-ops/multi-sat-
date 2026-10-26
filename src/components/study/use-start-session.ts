"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/providers/app-provider";
import { AppError } from "@/lib/data/repository";
import type { SessionConfig } from "@/lib/engine/types";

/** Creates a session in the active repository (device or account) and opens it. */
export function useStartSession() {
  const { repo } = useApp();
  const router = useRouter();
  const [starting, setStarting] = React.useState(false);
  const start = React.useCallback(
    async (config: SessionConfig) => {
      setStarting(true);
      try {
        const session = await repo.createSession(config);
        router.push(`/practice/${session.id}`);
      } catch (err) {
        toast.error(err instanceof AppError ? err.message : "Couldn't start that session. Please try again.");
        setStarting(false);
      }
    },
    [repo, router],
  );
  return { start, starting };
}
