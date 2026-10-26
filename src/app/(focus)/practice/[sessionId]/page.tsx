"use client";

import { Loader2, SearchX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { ExamRunner } from "@/components/exam/exam-runner";
import { TestRunner } from "@/components/exam/test-runner";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { AppError, type LoadedSession } from "@/lib/data/repository";

export default function PracticePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { repo, authReady } = useApp();
  const router = useRouter();
  const [state, setState] = React.useState<{ status: "loading" } | { status: "ready"; loaded: LoadedSession } | { status: "missing" } | { status: "error"; message: string }>({ status: "loading" });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const loaded = await repo.getSession(sessionId);
      if (!loaded) return setState({ status: "missing" });
      if (loaded.session.status === "completed" || loaded.result) {
        router.replace(`/results/${sessionId}`);
        return;
      }
      setState({ status: "ready", loaded });
    } catch (err) {
      setState({ status: "error", message: err instanceof AppError ? err.message : "Couldn't load this session." });
    }
  }, [repo, sessionId, router]);

  React.useEffect(() => {
    if (authReady) void load();
  }, [authReady, load]);

  if (state.status === "ready") {
    return state.loaded.session.config.mode === "test" ? <TestRunner loaded={state.loaded} /> : <ExamRunner loaded={state.loaded} />;
  }
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      {state.status === "loading" && (
        <div className="flex w-full items-center justify-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden /> Loading your session…
        </div>
      )}
      {state.status === "missing" && (
        <EmptyState
          className="w-full"
          icon={SearchX}
          title="Session not found"
          description="This session doesn't exist in your current account or on this device. Sessions from demo mode stay in the browser where they were created."
          action={
            <Button asChild>
              <Link href="/study">Start a new session</Link>
            </Button>
          }
        />
      )}
      {state.status === "error" && <ErrorState className="w-full" message={state.message} onRetry={load} />}
    </main>
  );
}
