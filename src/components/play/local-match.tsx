"use client";

import { Bot, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Notice } from "@/components/ui/states";
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from "@/lib/multiplayer/rules";
import { MatchStage, useServerNow } from "./match-stage";
import { RoomSettingsForm } from "./room-settings-form";
import { useLocalMatch } from "./use-local-match";

export function LocalMatch() {
  const { activity } = useApp();
  const [settings, setSettings] = React.useState<RoomSettings>({ ...DEFAULT_ROOM_SETTINGS, questionCount: 5, secondsPerQuestion: 30 });
  const [bots, setBots] = React.useState("2");
  const name = activity?.preferences.displayName ?? "You";
  const { view, start, answer, botIds, reset } = useLocalMatch(settings, name, Number(bots));
  const now = useServerNow(0);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Bot className="size-4" aria-hidden /> Local demo · runs only in this browser
          </span>
        }
        title="Practice match"
        description="Same rules and scoring as online matches. Your opponents are simulated practice bots, not real players."
      />
      {!view ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Match settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <RoomSettingsForm value={settings} onChange={setSettings} showPlayers={false} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Practice bots</p>
                <Segmented label="Number of practice bots" value={bots} onValueChange={setBots} options={["1", "2", "3", "4"].map((n) => ({ value: n, label: n }))} />
              </div>
              <Button size="lg" onClick={start}>
                <Play /> Start match
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>About this demo</CardTitle>
              <CardDescription>What&apos;s simulated and what&apos;s real</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Bots answer at random times and get questions right at fixed rates that drop with difficulty.</p>
              <p>You earn {10} XP per correct answer on this device. There&apos;s no victory bonus and bot matches don&apos;t count toward multiplayer achievements or leaderboards.</p>
              <Notice tone="info">For real matches with friends, use a deployment connected to a database and create a room.</Notice>
            </CardContent>
          </Card>
        </div>
      ) : (
        <MatchStage
          match={view}
          now={now}
          botIds={botIds}
          onAnswer={answer}
          submitting={false}
          answerError={null}
          footer={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => { reset(); }}>
                <RotateCcw /> Play again
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">Return to dashboard</Link>
              </Button>
            </div>
          }
        />
      )}
    </>
  );
}
