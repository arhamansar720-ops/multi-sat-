"use client";

import { Info, Medal, Trophy } from "lucide-react";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { RequiresAccount } from "@/components/layout/requires-account";
import { useApp } from "@/components/providers/app-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { levelInfo } from "@/lib/progression/xp";
import { cn } from "@/lib/utils";

type Scope = "global" | "friends";
type Period = "week" | "month" | "all";
type Metric = "xp" | "correct" | "wins" | "consistency";

interface Row {
  rank: number;
  user_id: string;
  display_name: string;
  username: string | null;
  total_xp: number;
  xp: number;
  correct: number;
  wins: number;
  active_days: number;
  is_me: boolean;
}

const METRIC_LABEL: Record<Metric, string> = { xp: "XP earned", correct: "Correct answers", wins: "Match wins", consistency: "Active days" };

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader title="Leaderboards" description="Rankings use only display names and totals. Guests and students who opt out never appear." />
      <RequiresAccount feature="Leaderboards">
        <LeaderboardView />
      </RequiresAccount>
    </>
  );
}

function LeaderboardView() {
  const { supabase, activity } = useApp();
  const [scope, setScope] = React.useState<Scope>("global");
  const [period, setPeriod] = React.useState<Period>("week");
  const [metric, setMetric] = React.useState<Metric>("xp");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setRows(null);
    const { data, error: err } = await supabase.rpc("get_leaderboard", { p_period: period, p_metric: metric, p_scope: scope, p_limit: 50 });
    if (err) return setError("Couldn't load the leaderboard.");
    setError(null);
    setRows((data ?? []) as Row[]);
  }, [supabase, scope, period, metric]);
  React.useEffect(() => void load(), [load]);

  const value = (r: Row) => (metric === "xp" ? r.xp : metric === "correct" ? r.correct : metric === "wins" ? r.wins : r.active_days);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Segmented label="Leaderboard scope" value={scope} onValueChange={setScope} options={[{ value: "global", label: "Global" }, { value: "friends", label: "Friends" }]} />
        <Segmented label="Time period" value={period} onValueChange={setPeriod} options={[{ value: "week", label: "This week" }, { value: "month", label: "This month" }, { value: "all", label: "All time" }]} />
        <Segmented label="Ranking metric" value={metric} onValueChange={setMetric} options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
      </div>
      {activity && !activity.preferences.leaderboardOptIn && scope === "global" && (
        <Notice tone="info" icon={Info}>You&apos;ve opted out of global leaderboards, so other students can&apos;t see you here. Only you see your own row. Change this in Settings.</Notice>
      )}
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <Skeleton className="h-80" />
      ) : rows.filter((r) => value(r) > 0).length === 0 ? (
        <EmptyState icon={Trophy} title="No rankings yet" description={scope === "friends" ? "Add friends and study together to fill this board." : "Be the first to earn a spot this period."} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-5">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {scope} leaderboard, {period}, ranked by {METRIC_LABEL[metric]}
              </caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="w-12 py-2">Rank</th>
                  <th scope="col" className="py-2">Student</th>
                  <th scope="col" className="py-2 text-right">{METRIC_LABEL[metric]}</th>
                  <th scope="col" className="hidden py-2 text-right sm:table-cell">Level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id} className={cn("border-t", r.is_me && "bg-primary-soft/60 font-medium")}>
                    <td className="py-2.5">
                      <span className="flex items-center gap-1 tabular-nums">
                        {r.rank <= 3 && value(r) > 0 && <Medal className={cn("size-4", r.rank === 1 ? "text-warning" : "text-muted-foreground")} aria-hidden />}
                        {r.rank}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {r.display_name}
                      {r.is_me && <span className="text-muted-foreground"> (you)</span>}
                      {r.username && <span className="ml-1.5 text-xs text-muted-foreground">@{r.username}</span>}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{value(r)}</td>
                    <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{levelInfo(r.total_xp).level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              Ties share a rank and are ordered by XP in the same period. Weeks start Monday 00:00 UTC. XP can&apos;t be farmed by replaying sessions: correct-answer XP is paid once per question per week.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
